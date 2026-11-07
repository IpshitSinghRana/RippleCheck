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

// ---------------------------------------------------------------------------
// Connection settings — read from .env, with safe local-dev defaults.
// ---------------------------------------------------------------------------
const NEO4J_URI      = process.env.NEO4J_URI      || "bolt://localhost:7687";
const NEO4J_USERNAME = process.env.NEO4J_USERNAME  || "neo4j";

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
    // Step 2: Guard for missing password.
    // We look up process.env.NEO4J_PASSWORD here (at call time) rather than at
    // module load time so that runtime configuration changes or test mocks are
    // properly picked up.
    // -------------------------------------------------------------------------
    const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

    if (!NEO4J_PASSWORD) {
        throw new Error(
            "NEO4J_PASSWORD is not set. " +
            "Add it to the root .env file: NEO4J_PASSWORD=<your_password>"
        );
    }

    // -------------------------------------------------------------------------
    // Step 3: Create a driver instance for this call.
    //
    // disableLosslessIntegers: true — instructs the driver to convert Neo4j
    // Integer values to native JS numbers automatically.  Acceptable for
    // RippleCheck because node counts and path lengths will never exceed
    // Number.MAX_SAFE_INTEGER (2^53 - 1).
    //
    // A new driver is created per call to avoid stale connection state across
    // calls, which is acceptable for a CLI tool that runs infrequently.
    // For a long-running server, create the driver once at startup and reuse it.
    // -------------------------------------------------------------------------
    const driver = neo4j.driver(
        NEO4J_URI,
        neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
        { disableLosslessIntegers: true }
    );

    // Always close the driver in the finally block — even if session creation
    // or query execution throws — to release bolt connections.
    let session = null;

    try {
        // -------------------------------------------------------------------------
        // Step 4: Open a session.
        //
        // database: "neo4j" — always specify explicitly; never rely on the
        // server-side default, which can vary between Neo4j deployments.
        //
        // defaultAccessMode: neo4j.session.READ — instructs the driver and any
        // cluster router to route this session to a read replica, and signals
        // intent at the driver level.  This is NOT a substitute for a read-only
        // database user — it only affects cluster routing.
        // -------------------------------------------------------------------------
        session = driver.session({
            database: "neo4j",
            defaultAccessMode: neo4j.session.READ
        });

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
        const safeUri = NEO4J_URI; // URI is not secret; password is excluded
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

module.exports = { executeCypher };

