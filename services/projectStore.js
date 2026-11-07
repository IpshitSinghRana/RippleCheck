// -----------------------------------------------------------------------------
// projectStore.js — Persistent Multi-User Project Management for RippleCheck
//
// Metadata Schema for (:Project):
//   - projectId: string (unique, 128-bit cryptographically secure identifier)
//   - userId: string (Firebase User UID, or 'public' for sample repo)
//   - projectName: string (display name, e.g. 'ecommerce-backend')
//   - originalZipName: string (original uploaded archive name)
//   - fileCount: number (scanned file count)
//   - dependencyCount: number (scanned dependency count)
//   - createdAt: string (ISO timestamp)
//   - lastScannedAt: string (ISO timestamp)
//   - analysisStatus: string ('completed' | 'failed' | 'processing')
// -----------------------------------------------------------------------------

"use strict";

const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const neo4j = require("neo4j-driver");

const NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7687";
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

function getDriver() {
    if (!NEO4J_PASSWORD) {
        throw new Error("NEO4J_PASSWORD is not set in environment.");
    }
    return neo4j.driver(
        NEO4J_URI,
        neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
        { disableLosslessIntegers: true }
    );
}

/**
 * Generates a 128-bit cryptographically secure, unique project ID.
 * Format: `proj_<name-slug>_<128-bit hex string>`
 *
 * @param {string} [name="project"]
 * @returns {string}
 */
function generateSecureProjectId(name = "project") {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32) || "project";
    // 16 bytes = 128 bits of cryptographic randomness
    const random128 = crypto.randomBytes(16).toString("hex");
    return `proj_${slug}_${random128}`;
}

/**
 * Initializes schema constraints and default sample repository project metadata.
 */
async function initProjectSchema() {
    if (process.env.RIPPLECHECK_EDITION === "desktop") {
        const { initLadybugSchema } = require("./ladybugExecutor");
        return await initLadybugSchema();
    }
    const driver = getDriver();
    const session = driver.session();
    try {
        // Enforce uniqueness constraint on Project(projectId)
        await session.run(`
            CREATE CONSTRAINT project_id_unique IF NOT EXISTS
            FOR (p:Project)
            REQUIRE p.projectId IS UNIQUE
        `);

        // Default sample repository manifest
        const sampleManifest = [
            { path: "src/app.js", name: "app.js", size: 1024, isSupported: true, extension: ".js" },
            { path: "src/auth.js", name: "auth.js", size: 840, isSupported: true, extension: ".js" },
            { path: "src/database.js", name: "database.js", size: 760, isSupported: true, extension: ".js" },
            { path: "src/index.js", name: "index.js", size: 520, isSupported: true, extension: ".js" },
            { path: "src/userService.js", name: "userService.js", size: 910, isSupported: true, extension: ".js" },
            { path: "src/utils.js", name: "utils.js", size: 650, isSupported: true, extension: ".js" }
        ];

        // Ensure sample-repo project metadata exists
        await session.run(`
            MERGE (p:Project {projectId: "sample-repo"})
            ON CREATE SET
                p.userId = "public",
                p.projectName = "sample-repo",
                p.originalZipName = "sample-repo.zip",
                p.fileCount = 6,
                p.dependencyCount = 5,
                p.manifest = $manifest,
                p.createdAt = "2026-01-01T00:00:00.000Z",
                p.lastScannedAt = "2026-01-01T00:00:00.000Z",
                p.analysisStatus = "completed"
            ON MATCH SET
                p.userId = "public",
                p.projectName = "sample-repo",
                p.manifest = coalesce(p.manifest, $manifest)
        `, { manifest: JSON.stringify(sampleManifest) });
    } finally {
        await session.close();
        await driver.close();
    }
}

/**
 * Saves a new project record into Neo4j.
 *
 * @param {Object} projectData
 * @returns {Promise<Object>}
 */
async function createProject({
    projectId,
    userId,
    projectName,
    originalZipName = "",
    fileCount = 0,
    dependencyCount = 0,
    manifest = [],
    analysisStatus = "completed"
}) {
    if (!projectId || !userId || !projectName) {
        throw new Error("Missing required project fields (projectId, userId, projectName).");
    }

    const now = new Date().toISOString();
    const manifestStr = typeof manifest === "string" ? manifest : JSON.stringify(manifest || []);

    if (process.env.RIPPLECHECK_EDITION === "desktop") {
        const { executeLadybug } = require("./ladybugExecutor");
        await executeLadybug(
            `CREATE (:Project {
                projectId: $projectId,
                userId: $userId,
                projectName: $projectName,
                originalZipName: $originalZipName,
                fileCount: $fileCount,
                dependencyCount: $dependencyCount,
                manifest: $manifest,
                createdAt: $createdAt,
                lastScannedAt: $lastScannedAt,
                analysisStatus: $analysisStatus
            })`,
            {
                projectId,
                userId,
                projectName,
                originalZipName,
                fileCount: Number(fileCount),
                dependencyCount: Number(dependencyCount),
                manifest: manifestStr,
                createdAt: now,
                lastScannedAt: now,
                analysisStatus
            },
            { bypassValidation: true }
        );
        return {
            projectId,
            userId,
            projectName,
            originalZipName,
            fileCount,
            dependencyCount,
            manifest: manifestStr,
            createdAt: now,
            lastScannedAt: now,
            analysisStatus
        };
    }

    const driver = getDriver();
    const session = driver.session();

    try {
        const manifestStr = typeof manifest === "string" ? manifest : JSON.stringify(manifest || []);
        const result = await session.run(`
            CREATE (p:Project {
                projectId: $projectId,
                userId: $userId,
                projectName: $projectName,
                originalZipName: $originalZipName,
                fileCount: $fileCount,
                dependencyCount: $dependencyCount,
                manifest: $manifest,
                createdAt: $createdAt,
                lastScannedAt: $lastScannedAt,
                analysisStatus: $analysisStatus
            })
            RETURN p
        `, {
            projectId,
            userId,
            projectName,
            originalZipName,
            fileCount,
            dependencyCount,
            manifest: manifestStr,
            createdAt: now,
            lastScannedAt: now,
            analysisStatus
        });

        if (result.records.length === 0) {
            throw new Error("Failed to create project record.");
        }

        return result.records[0].get("p").properties;
    } finally {
        await session.close();
        await driver.close();
    }
}

/**
 * Lists projects accessible to the user (the user's owned projects + sample-repo).
 *
 * @param {string} userId - Authenticated user UID
 * @returns {Promise<Array<Object>>}
 */
async function listUserProjects(userId) {
    if (!userId) return [];

    if (process.env.RIPPLECHECK_EDITION === "desktop") {
        const { executeLadybug } = require("./ladybugExecutor");
        const rows = await executeLadybug(
            `MATCH (p:Project)
            WHERE p.userId = $userId OR p.projectId = 'sample-repo'
            RETURN p.projectId AS projectId, p.userId AS userId, p.projectName AS projectName,
                   p.originalZipName AS originalZipName, p.fileCount AS fileCount,
                   p.dependencyCount AS dependencyCount, p.manifest AS manifest,
                   p.createdAt AS createdAt, p.lastScannedAt AS lastScannedAt,
                   p.analysisStatus AS analysisStatus
            ORDER BY p.createdAt DESC`,
            { userId },
            { bypassValidation: true }
        );
        return rows;
    }

    const driver = getDriver();
    const session = driver.session();

    try {
        const result = await session.run(`
            MATCH (p:Project)
            WHERE p.userId = $userId OR p.projectId = "sample-repo"
            RETURN p
            ORDER BY CASE WHEN p.projectId = "sample-repo" THEN 1 ELSE 0 END, p.createdAt DESC
        `, { userId });

        return result.records.map((r) => r.get("p").properties);
    } finally {
        await session.close();
        await driver.close();
    }
}

/**
 * Retrieves a single project record by projectId.
 *
 * @param {string} projectId
 * @returns {Promise<Object|null>}
 */
async function getProjectById(projectId) {
    if (!projectId) return null;

    if (process.env.RIPPLECHECK_EDITION === "desktop") {
        const { executeLadybug } = require("./ladybugExecutor");
        const rows = await executeLadybug(
            `MATCH (p:Project {projectId: $projectId})
            RETURN p.projectId AS projectId, p.userId AS userId, p.projectName AS projectName,
                   p.originalZipName AS originalZipName, p.fileCount AS fileCount,
                   p.dependencyCount AS dependencyCount, p.manifest AS manifest,
                   p.createdAt AS createdAt, p.lastScannedAt AS lastScannedAt,
                   p.analysisStatus AS analysisStatus
            LIMIT 1`,
            { projectId },
            { bypassValidation: true }
        );
        return rows.length > 0 ? rows[0] : null;
    }

    const driver = getDriver();
    const session = driver.session();

    try {
        const result = await session.run(`
            MATCH (p:Project {projectId: $projectId})
            RETURN p
            LIMIT 1
        `, { projectId });

        if (result.records.length === 0) return null;
        return result.records[0].get("p").properties;
    } finally {
        await session.close();
        await driver.close();
    }
}

/**
 * Deletes a project and all its associated File nodes and relationships from Neo4j.
 * Strictly prevents deleting the sample-repo or deleting projects owned by another user.
 *
 * @param {string} projectId
 * @param {string} userId - Authenticated user UID
 * @returns {Promise<{ deletedProject: boolean, deletedNodes: number, deletedRelationships: number }>}
 */
async function deleteProject(projectId, userId) {
    if (!projectId || !userId) {
        throw new Error("Missing projectId or userId for deletion.");
    }

    if (projectId === "sample-repo") {
        throw new Error("The default sample repository cannot be deleted.");
    }

    if (process.env.RIPPLECHECK_EDITION === "desktop") {
        const { executeLadybug } = require("./ladybugExecutor");
        const check = await executeLadybug(
            `MATCH (p:Project {projectId: $projectId}) RETURN p.userId AS ownerId LIMIT 1`,
            { projectId },
            { bypassValidation: true }
        );
        if (check.length === 0) {
            throw new Error(`Project '${projectId}' not found.`);
        }
        if (check[0].ownerId !== userId) {
            throw new Error("Forbidden: You do not have permission to delete this project.");
        }
        await executeLadybug(
            `MATCH (p:Project {projectId: $projectId}) DELETE p`,
            { projectId },
            { bypassValidation: true }
        );
        await executeLadybug(
            `MATCH (f:File {projectId: $projectId}) DELETE f`,
            { projectId },
            { bypassValidation: true }
        );
        return { deletedProject: true, deletedNodes: 0, deletedRelationships: 0 };
    }

    const driver = getDriver();
    const session = driver.session();

    try {
        // 1. Verify project exists and belongs to requesting user
        const checkResult = await session.run(`
            MATCH (p:Project {projectId: $projectId})
            RETURN p.userId AS ownerId
            LIMIT 1
        `, { projectId });

        if (checkResult.records.length === 0) {
            throw new Error("Project not found.");
        }

        const ownerId = checkResult.records[0].get("ownerId");
        if (ownerId !== userId) {
            throw new Error("Forbidden: You do not have permission to delete this project.");
        }

        // 2. Delete Project node, File nodes, and all their IMPORTS relationships
        const deleteResult = await session.run(`
            MATCH (p:Project {projectId: $projectId, userId: $userId})
            OPTIONAL MATCH (f:File {projectId: $projectId, userId: $userId})
            DETACH DELETE p, f
        `, { projectId, userId });

        const summary = deleteResult.summary.counters.updates();

        return {
            deletedProject: true,
            deletedNodes: summary.nodesDeleted,
            deletedRelationships: summary.relationshipsDeleted
        };
    } finally {
        await session.close();
        await driver.close();
    }
}

module.exports = {
    generateSecureProjectId,
    initProjectSchema,
    createProject,
    listUserProjects,
    getProjectById,
    deleteProject
};

