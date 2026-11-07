// -----------------------------------------------------------------------------
// load-graph.js — RippleCheck dependency graph loader
//
// Reads a Madge dependency graph and writes it into Neo4j as:
//   (:File {projectId, userId, path, name}) -[:IMPORTS]-> (:File {projectId, userId, path, name})
//
// Usage CLI:
//   node scripts/load-graph.js [madgeFilePath] [projectId] [userId]
//
// Usage Programmatic:
//   const { loadGraph } = require("./load-graph");
//   await loadGraph({ madgeData, projectId, userId });
// -----------------------------------------------------------------------------

"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const fs = require("fs");
const neo4j = require("neo4j-driver");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_MADGE_FILE = path.join(PROJECT_ROOT, "data", "madge.json");
const DEFAULT_PROJECT_ID = "sample-repo";
const DEFAULT_USER_ID = "public";

const { createDriver, getDriverConfig } = require("../services/cypherExecutor");

function normalizePath(rawPath) {
    return path.normalize(rawPath).replace(/\\/g, "/");
}

function extractName(normalizedPath) {
    return path.basename(normalizedPath);
}

/**
 * Loads parsed dependency graph data into Neo4j scoped by projectId and userId.
 *
 * @param {Object} options
 * @param {string} [options.madgeFilePath] - Path to madge.json
 * @param {Object} [options.madgeData] - Direct madge graph object
 * @param {string} [options.projectId="sample-repo"] - Project identifier
 * @param {string} [options.userId="public"] - Owner user ID
 */
async function loadGraph({
    madgeFilePath = DEFAULT_MADGE_FILE,
    madgeData = null,
    projectId = DEFAULT_PROJECT_ID,
    userId = DEFAULT_USER_ID
} = {}) {
    if (process.env.RIPPLECHECK_EDITION !== "desktop" && !process.env.NEO4J_PASSWORD) {
        throw new Error("NEO4J_PASSWORD is not set in environment.");
    }

    let parsedData = madgeData;
    if (!parsedData) {
        const resolvedPath = path.resolve(madgeFilePath);
        console.log(`\n📂 Reading Madge graph from: ${resolvedPath}`);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File not found: ${resolvedPath}. Run scan first.`);
        }
        parsedData = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
    }

    const filePaths = new Set();
    const importEdges = [];

    for (const [importer, dependencies] of Object.entries(parsedData)) {
        const normalizedImporter = normalizePath(importer);
        filePaths.add(normalizedImporter);
        for (const dep of dependencies) {
            const normalizedDep = normalizePath(dep);
            filePaths.add(normalizedDep);
            importEdges.push({
                from: normalizedImporter,
                to: normalizedDep
            });
        }
    }

    console.log(`   Project : ${projectId} (User: ${userId})`);
    console.log(`   Files   : ${filePaths.size}`);
    console.log(`   Imports : ${importEdges.length}`);

    // If running in Desktop Edition, ingest directly into embedded LadybugDB
    if (process.env.RIPPLECHECK_EDITION === "desktop") {
        const { executeLadybug, initLadybugSchema } = require("../services/ladybugExecutor");
        await initLadybugSchema();

        let fileCount = 0;
        for (const filePath of filePaths) {
            const compositeId = `${projectId}::${filePath}`;
            const fileName = extractName(filePath);
            await executeLadybug(
                `CREATE (:File {id: $id, projectId: $projectId, path: $path, name: $name, summary: '', userId: $userId})`,
                { id: compositeId, projectId, path: filePath, name: fileName, userId },
                { bypassValidation: true }
            );
            fileCount++;
        }

        let edgeCount = 0;
        for (const edge of importEdges) {
            const fromId = `${projectId}::${edge.from}`;
            const toId = `${projectId}::${edge.to}`;
            await executeLadybug(
                `MATCH (source:File {id: $fromId}), (target:File {id: $toId}) CREATE (source)-[:IMPORTS]->(target)`,
                { fromId, toId },
                { bypassValidation: true }
            );
            edgeCount++;
        }

        const countFiles = await executeLadybug(
            `MATCH (n:File {projectId: $projectId}) RETURN count(n) AS total_files`,
            { projectId },
            { bypassValidation: true }
        );
        const totalFiles = countFiles[0].total_files || countFiles[0]["count(n)"] || fileCount;

        const countEdges = await executeLadybug(
            `MATCH (a:File {projectId: $projectId})-[:IMPORTS]->(b:File {projectId: $projectId}) RETURN count(*) AS total_relationships`,
            { projectId },
            { bypassValidation: true }
        );
        const totalRelationships = countEdges[0].total_relationships || countEdges[0]["count(*)"] || edgeCount;

        console.log(`✅ [Desktop LadybugDB] Loaded project '${projectId}': ${totalFiles} nodes, ${totalRelationships} relationships.`);
        return { fileCount, edgeCount, totalFiles: Number(totalFiles), totalRelationships: Number(totalRelationships) };
    }

    // Web Edition: Load into Neo4j Aura
    const driver = createDriver();
    const { database } = getDriverConfig();

    let session;
    try {
        session = database ? driver.session({ database }) : driver.session();

        // Ensure composite uniqueness constraint on (projectId, path)
        await session.run(`
            CREATE CONSTRAINT file_project_path_unique IF NOT EXISTS
            FOR (f:File)
            REQUIRE (f.projectId, f.path) IS UNIQUE
        `);

        // 1. MERGE File nodes scoped to projectId
        let fileCount = 0;
        for (const filePath of filePaths) {
            const result = await session.run(
                `
                MERGE (f:File {projectId: $projectId, path: $path})
                ON CREATE SET f.name = $name, f.userId = $userId
                ON MATCH  SET f.name = $name, f.userId = coalesce(f.userId, $userId)
                `,
                {
                    projectId,
                    userId,
                    path: filePath,
                    name: extractName(filePath)
                }
            );
            fileCount += result.summary.counters.updates().nodesCreated;
        }

        // 2. MERGE IMPORTS relationships strictly within the same project
        let edgeCount = 0;
        for (const edge of importEdges) {
            const result = await session.run(
                `
                MATCH (source:File {projectId: $projectId, path: $from})
                MATCH (target:File {projectId: $projectId, path: $to})
                MERGE (source)-[:IMPORTS]->(target)
                `,
                {
                    projectId,
                    from: edge.from,
                    to: edge.to
                }
            );
            edgeCount += result.summary.counters.updates().relationshipsCreated;
        }

        // Verification query scoped to this project
        const fileVerify = await session.run(
            "MATCH (n:File {projectId: $projectId}) RETURN count(n) AS total_files",
            { projectId }
        );
        const rawTotalFiles = fileVerify.records[0].get("total_files");
        const totalFiles = typeof rawTotalFiles?.toNumber === "function" ? rawTotalFiles.toNumber() : Number(rawTotalFiles);

        const edgeVerify = await session.run(
            "MATCH (a:File {projectId: $projectId})-[r:IMPORTS]->(b:File {projectId: $projectId}) RETURN count(r) AS total_relationships",
            { projectId }
        );
        const rawTotalRels = edgeVerify.records[0].get("total_relationships");
        const totalRelationships = typeof rawTotalRels?.toNumber === "function" ? rawTotalRels.toNumber() : Number(rawTotalRels);

        console.log(`✅ Loaded project '${projectId}': ${totalFiles} nodes, ${totalRelationships} relationships.`);
        return { fileCount, edgeCount, totalFiles, totalRelationships };
    } finally {
        if (session) await session.close();
        await driver.close();
    }
}

// CLI execution
if (require.main === module) {
    const customMadge = process.argv[2] || DEFAULT_MADGE_FILE;
    const customProject = process.argv[3] || DEFAULT_PROJECT_ID;
    const customUser = process.argv[4] || DEFAULT_USER_ID;

    loadGraph({
        madgeFilePath: customMadge,
        projectId: customProject,
        userId: customUser
    }).catch((err) => {
        console.error("❌ Graph loading failed:", err.message);
        process.exit(1);
    });
}

module.exports = { loadGraph };
