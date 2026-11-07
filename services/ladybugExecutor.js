// -----------------------------------------------------------------------------
// ladybugExecutor.js — Embedded Graph Database Executor for RippleCheck Desktop
//
// Responsibilities:
// 1. Manages a local embedded LadybugDB (openCypher) instance in the user's data directory.
// 2. Schema initialization: Creates File node table and IMPORTS relationship table.
// 3. Executes read and write Cypher queries and normalizes results into plain JS objects.
// 4. Provides identical contract to cypherExecutor.executeCypher(query, params).
// 5. Handles data persistence and graceful connection shutdown.
// -----------------------------------------------------------------------------

"use strict";

const path = require("path");
const fs = require("fs");
const { validateCypher } = require("./cypherValidator");

let ladybugdb = null;
try {
    ladybugdb = require("@ladybugdb/core");
} catch (err) {
    // Graceful fallback if @ladybugdb/core is not yet compiled or installed in dev
    console.warn("[ladybugExecutor] @ladybugdb/core not found:", err.message);
}

let dbInstance = null;
let connInstance = null;
let isSchemaInitialized = false;

/**
 * Returns the default local database directory for Desktop Edition.
 */
function getDesktopDatabasePath() {
    let targetPath;
    if (process.env.RIPPLECHECK_DESKTOP_DB_PATH) {
        targetPath = path.resolve(process.env.RIPPLECHECK_DESKTOP_DB_PATH);
    } else {
        const appData = process.env.APPDATA || (process.platform === "darwin" ? path.join(process.env.HOME, "Library", "Application Support") : path.join(process.env.HOME, ".config"));
        targetPath = path.join(appData, "RippleCheck", "kuzudb");
    }

    // LadybugDB expects either a file path or a database path where parent exists
    // If targetPath is an existing directory, point to graph.lbug inside it
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
        return path.join(targetPath, "graph.lbug");
    }

    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
    }
    return targetPath;
}

/**
 * Initializes the embedded database instance and connection.
 */
function getDatabase() {
    if (!ladybugdb) {
        throw new Error("@ladybugdb/core native module is not available in this environment.");
    }
    if (!dbInstance) {
        const dbPath = getDesktopDatabasePath();
        dbInstance = new ladybugdb.Database(dbPath);
        connInstance = new ladybugdb.Connection(dbInstance);
    }
    return { db: dbInstance, conn: connInstance };
}

/**
 * Ensures required node and relationship tables exist.
 */
async function initLadybugSchema() {
    if (isSchemaInitialized) return;
    const { conn } = getDatabase();

    try {
        // File Node Table (composite primary key id: `${projectId}::${path}` prevents cross-project collision)
        await conn.query(`
            CREATE NODE TABLE IF NOT EXISTS File (
                id STRING,
                path STRING,
                name STRING,
                summary STRING,
                projectId STRING,
                userId STRING,
                PRIMARY KEY(id)
            )
        `);
        // Project Node Table
        await conn.query(`
            CREATE NODE TABLE IF NOT EXISTS Project (
                projectId STRING,
                userId STRING,
                projectName STRING,
                originalZipName STRING,
                fileCount INT64,
                dependencyCount INT64,
                manifest STRING,
                createdAt STRING,
                lastScannedAt STRING,
                analysisStatus STRING,
                PRIMARY KEY(projectId)
            )
        `);
        // Relationships
        await conn.query(`
            CREATE REL TABLE IF NOT EXISTS IMPORTS (FROM File TO File)
        `);

        // Seed sample-repo if missing
        const check = await conn.query(`MATCH (p:Project {projectId: 'sample-repo'}) RETURN p.projectId AS id`);
        const rows = await check.getAll();
        if (rows.length === 0) {
            const now = new Date().toISOString();
            await conn.query(`
                CREATE (:Project {
                    projectId: 'sample-repo',
                    userId: 'public',
                    projectName: 'sample-repo',
                    originalZipName: 'sample-repo.zip',
                    fileCount: 6,
                    dependencyCount: 5,
                    manifest: '[]',
                    createdAt: '${now}',
                    lastScannedAt: '${now}',
                    analysisStatus: 'completed'
                })
            `);
        }

        isSchemaInitialized = true;
    } catch (err) {
        if (err.message && err.message.includes("already exists")) {
            isSchemaInitialized = true;
        } else {
            console.error("[ladybugExecutor] Schema initialization failed:", err.message);
            throw err;
        }
    }
}

/**
 * Normalizes query string and parameters for LadybugDB execution:
 * Translates Neo4j specifics ($param syntax, variable-length ranges) into valid openCypher.
 */
function translateQuery(query, params = {}) {
    let translated = query;

    // Convert parameter syntax $param to escaped literal if not natively prepared
    for (const [key, value] of Object.entries(params)) {
        let replacement;
        if (typeof value === "string") {
            // Escape backslashes first, then single quotes
            const escaped = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
            replacement = `'${escaped}'`;
        } else if (value === null || value === undefined) {
            replacement = "NULL";
        } else {
            replacement = String(value);
        }
        translated = translated.replace(new RegExp(`\\$${key}\\b`, "g"), replacement);
    }

    // Configurable maximum traversal hops (default: 15)
    const maxHops = process.env.RIPPLECHECK_MAX_TRAVERSAL_HOPS || 15;
    translated = translated.replace(/\[:IMPORTS\*1\.\.\]/g, `[:IMPORTS*1..${maxHops}]`);

    return translated;
}

/**
 * Executes a Cypher query against embedded LadybugDB.
 *
 * @param {string} query - openCypher query string
 * @param {Object} [params={}] - Query parameters
 * @param {Object} [options={}] - Options (e.g. bypassValidation for schema/mutations)
 * @returns {Promise<Array<Object>>} Array of plain record objects
 */
async function executeLadybug(query, params = {}, options = {}) {
    if (!options.bypassValidation) {
        validateCypher(query);
    }

    await initLadybugSchema();
    const { conn } = getDatabase();
    const readyCypher = translateQuery(query, params);

    const queryResult = await conn.query(readyCypher);
    const rows = await queryResult.getAll();

    // Normalize property keys (strip table prefixes if any, e.g. 'f.name' -> 'name')
    return rows.map((row) => {
        const normalized = {};
        for (const [key, val] of Object.entries(row)) {
            const cleanKey = key.includes(".") ? key.split(".").pop() : key;
            normalized[cleanKey] = val;
        }
        return normalized;
    });
}

/**
 * Gracefully shuts down connection and releases file locks.
 */
function closeLadybugDatabase() {
    if (connInstance) {
        try { connInstance.closeSync(); } catch {}
        connInstance = null;
    }
    if (dbInstance) {
        try { dbInstance.closeSync(); } catch {}
        dbInstance = null;
    }
    isSchemaInitialized = false;
}

module.exports = {
    executeCypher: executeLadybug,
    executeLadybug,
    initLadybugSchema,
    closeLadybugDatabase,
    getDesktopDatabasePath
};

