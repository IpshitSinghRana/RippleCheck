// -----------------------------------------------------------------------------
// cypherExecutor.js — Validated Cypher Executor for RippleCheck
//
// Responsibility:
//   Accept a Cypher query string, validate it through the allowlist validator,
//   execute it against the Neo4j graph database, and return records as plain
//   JavaScript objects.
//
// Security model:
//   1. validateCypher() MUST pass before any driver or session is created.
//   2. Credentials are read exclusively from environment variables — never
//      hardcoded, never logged, never included in thrown error messages.
//   3. The session is opened with READ access mode; the connected database
//      user should additionally be a read-only user in production.
//   4. Query parameters are supported (pass as second argument); never
//      interpolate user input directly into the Cypher string.
//
// Usage:
//   const { executeCypher } = require("./services/cypherExecutor");
//   const records = await executeCypher(
//     'MATCH (f:File) WHERE f.name = $name RETURN f.path AS path',
//     { name: "app.js" }
//   );
// -----------------------------------------------------------------------------

"use strict";

const path = require("path");

// Load .env from the project root using an absolute path so this module
// works correctly regardless of the current working directory when required.
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const neo4j = require("neo4j-driver");
const { validateCypher } = require("./cypherValidator");

function getDriverConfig() {
    const uri = process.env.NEO4J_URI || "bolt://localhost:7687";
    const username = process.env.NEO4J_USERNAME || process.env.NEO4J_USER || "neo4j";
    const password = process.env.NEO4J_PASSWORD;
    const database = process.env.NEO4J_DATABASE || (uri.includes("databases.neo4j.io") ? username : undefined);
    return { uri, username, password, database };
}

/**
 * Creates an authorized Neo4j Driver instance using active environment variables.
 *
 * @returns {neo4j.Driver}
 */
function createDriver() {
    const { uri, username, password } = getDriverConfig();
    if (!password) {
        throw new Error(
            "NEO4J_PASSWORD is not set. Add it to the environment: NEO4J_PASSWORD=<your_password>"
        );
    }
    return neo4j.driver(
        uri,
        neo4j.auth.basic(username, password),
        { disableLosslessIntegers: true }
    );
}

/**
 * Verifies connectivity to the configured Neo4j instance.
 *
 * @returns {Promise<{ ok: boolean, uri: string, database: string, serverInfo?: Object, error?: string }>}
 */
async function verifyNeo4jConnection() {
    const { uri, database, password } = getDriverConfig();
    if (!password) {
        return {
            ok: false,
            uri,
            database: database || "default",
            error: "NEO4J_PASSWORD is not set in environment."
        };
    }

    let driver = null;
    try {
        driver = createDriver();
        const serverInfo = await driver.getServerInfo();
        return {
            ok: true,
            uri,
            database: database || "default",
            serverInfo: {
                address: serverInfo.address,
                agent: serverInfo.agent,
                protocolVersion: serverInfo.protocolVersion
            }
        };
    } catch (err) {
        return {
            ok: false,
            uri,
            database: database || "default",
            error: err.message
        };
    } finally {
        if (driver) {
            try {
                await driver.close();
            } catch (_) {}
        }
    }
}

// ---------------------------------------------------------------------------
// Transaction timeout.
// 30 000 ms is generous for read-only graph traversal on a small codebase.
// Increase if you add deeper transitive-impact queries.
// ---------------------------------------------------------------------------
const TRANSACTION_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// executeCypher(query, params?)
//
// @param {string} query
//   A Cypher query string that must already pass validateCypher().
//   Always use parameterised literals (e.g. $name) for user-supplied values —
//   never concatenate user input into the query string.
//
// @param {Object} [params={}]
//   Optional key/value map of query parameters.
//   Values must be primitive types supported by neo4j-driver
//   (string, number, boolean, or neo4j Integer).
//
// @returns {Promise<Array<Object>>}
//   An array of plain JavaScript objects — one per record row.
//   Each object maps column names to their JavaScript values.
//   neo4j-driver Integers are automatically converted to native JS numbers
//   via the driver's integer-conversion option (see driver creation below).
//
// @throws {Error}
//   - If the query fails validateCypher().
//   - If NEO4J_PASSWORD is not set in the environment.
//   - If the database is unreachable or the query fails at runtime.
//   Credential values are never included in thrown errors.
// ---------------------------------------------------------------------------
async function executeCypher(query, params = {}) {

    // -------------------------------------------------------------------------
    // Step 1: Validate the query through the allowlist validator BEFORE
    // creating any driver or session.  This is a hard gate — no network traffic
    // is initiated for queries that do not satisfy the validator.
    // -------------------------------------------------------------------------
    validateCypher(query); // throws descriptively on any violation

    // -------------------------------------------------------------------------
    // Step 2: Acquire configured driver and database settings.
    // -------------------------------------------------------------------------
    const { uri, database, password } = getDriverConfig();

    if (!password) {
        throw new Error(
            "NEO4J_PASSWORD is not set. Add it to the environment: NEO4J_PASSWORD=<your_password>"
        );
    }

    // -------------------------------------------------------------------------
    // Step 3: Create a driver instance for this call.
    //
    // disableLosslessIntegers: true — instructs the driver to convert Neo4j
    // Integer values to native JS numbers automatically.  Acceptable for
    // RippleCheck because node counts and path lengths will never exceed
    // Number.MAX_SAFE_INTEGER (2^53 - 1).
    // -------------------------------------------------------------------------
    const driver = createDriver();

    // Always close the driver in the finally block — even if session creation
    // or query execution throws — to release bolt connections.
    let session = null;

    try {
        // -------------------------------------------------------------------------
        // Step 4: Open a session with the resolved database.
        // -------------------------------------------------------------------------
        const sessionConfig = {
            defaultAccessMode: neo4j.session.READ
        };
        if (database) {
            sessionConfig.database = database;
        }
        session = driver.session(sessionConfig);

        // -------------------------------------------------------------------------
        // Step 5: Execute the query inside a read transaction with a timeout.
        //
        // session.executeRead() automatically retries on transient errors
        // (e.g. leader re-election in a cluster).
        //
        // transactionConfig.timeout sets the server-side query timeout so the
        // database kills long-running traversals before they exhaust resources.
        // -------------------------------------------------------------------------
        const result = await session.executeRead(
            async (tx) => tx.run(query, params),
            { timeout: TRANSACTION_TIMEOUT_MS }
        );

        // -------------------------------------------------------------------------
        // Step 6: Convert neo4j Record objects to plain JavaScript objects.
        //
        // record.toObject() returns a { columnName: value } map.
        // Because disableLosslessIntegers is true, numeric values are already
        // native JS numbers at this point.
        // -------------------------------------------------------------------------
        return result.records.map((record) => record.toObject());

    } catch (err) {
        // Rethrow with a clear prefix, but deliberately exclude any detail that
        // could leak connection credentials (URI may be shown; password never is).
        const safeUri = uri; // URI is not secret; password is excluded
        throw new Error(
            `Cypher execution failed against ${safeUri}: ${err.message}`
        );

    } finally {
        // Always release resources — session first, then driver.
        // Guard with null checks in case the driver or session was never opened.
        if (session) {
            try {
                await session.close();
            } catch (_) {
                // Silently ignore errors during cleanup — the original error
                // has already been rethrown above.
            }
        }
        try {
            await driver.close();
        } catch (_) {
            // Same reasoning — cleanup errors must not shadow the real error.
        }
    }
}

module.exports = {
    executeCypher,
    createDriver,
    verifyNeo4jConnection,
    getDriverConfig
};

