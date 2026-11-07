// -----------------------------------------------------------------------------
// test-neo4j.js — RippleCheck Neo4j connectivity test
//
// Usage:  node scripts/test-neo4j.js
//
// Reads credentials from the root .env file via dotenv.
// Never prints or exposes NEO4J_PASSWORD.
// -----------------------------------------------------------------------------

require("dotenv").config();

const neo4j = require("neo4j-driver");
const path  = require("path");

// ---------------------------------------------------------------------------
// Guard: fail early with a clear message if the password is not set.
// We check only NEO4J_PASSWORD here because the URI and username have
// fallback defaults defined below, but the password has no safe default.
// ---------------------------------------------------------------------------
if (!process.env.NEO4J_PASSWORD) {
    console.error("❌ NEO4J_PASSWORD is not set.");
    console.error(
        "   Add it to the root .env file:  NEO4J_PASSWORD=<your_password>"
    );
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Connection settings — read from .env, with sensible local-dev defaults.
// ---------------------------------------------------------------------------
const NEO4J_URI      = process.env.NEO4J_URI      || "bolt://localhost:7687";
const NEO4J_USERNAME = process.env.NEO4J_USERNAME  || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;   // never logged

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------
async function testConnection() {
    const driver = neo4j.driver(
        NEO4J_URI,
        neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
    );

    let session;

    try {
        // -- Step 1: verify the driver can reach the server ------------------
        console.log(`\n🔌 Connecting to Neo4j at ${NEO4J_URI} ...`);
        await driver.verifyConnectivity();
        console.log("✅ Connectivity verified.");

        // -- Step 2: run a smoke-test query ----------------------------------
        console.log("\n📡 Running test query ...");
        session = driver.session();

        const result = await session.run(
            'RETURN "RippleCheck" AS project, "Connected" AS status'
        );

        const record  = result.records[0];
        const project = record.get("project");
        const status  = record.get("status");

        console.log(`\n🎉 Query result:`);
        console.log(`   project : ${project}`);
        console.log(`   status  : ${status}`);
        console.log("\n✅ Neo4j connection test passed.\n");

    } catch (error) {
        // Print the error message only — not the driver object, which can
        // contain internal state with credentials in some driver versions.
        console.error("\n❌ Neo4j connection test failed.");
        console.error(`   Reason: ${error.message}`);
        console.error(
            "\n   Troubleshooting tips:" +
            "\n   - Is the container running?  →  docker compose ps" +
            "\n   - Check logs               →  docker compose logs neo4j" +
            "\n   - Verify NEO4J_PASSWORD in .env matches the container's NEO4J_AUTH"
        );
        process.exit(1);

    } finally {
        if (session) {
            await session.close();
        }
        await driver.close();
    }
}

testConnection();
