// -----------------------------------------------------------------------------
// query.js — Natural Language Graph Query CLI for RippleCheck
//
// Usage:
//   node scripts/query.js "What files does app.js import?"
//   node scripts/query.js "Which files depend on database.js?"
//
// Pipeline:
//   1. Parse natural-language question from process.argv.
//   2. Call generateCypher(question) to convert the question into Cypher via LLM.
//   3. Pass the generated Cypher to executeCypher(query) for allowlist validation
//      and execution against the Neo4j database.
//   4. Format and display the question, generated Cypher, and result records.
// -----------------------------------------------------------------------------

"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { generateCypher } = require("../services/nlToCypher");
const { executeCypher } = require("../services/cypherExecutor");

/**
 * Formats and prints query records in an easy-to-read layout.
 *
 * @param {Array<Object>} records - Array of plain JavaScript record objects
 */
function displayResults(records) {
    if (!records || records.length === 0) {
        console.log("   (no matching records found)");
        return;
    }

    console.log(`   Found ${records.length} record${records.length === 1 ? "" : "s"}:\n`);

    // Use console.table when tabular format is appropriate, or structured JSON for deep objects
    try {
        console.table(records);
    } catch (_) {
        records.forEach((rec, idx) => {
            console.log(`   [${idx + 1}] ${JSON.stringify(rec, null, 2)}`);
        });
    }
}

async function main() {
    // 1. Parse natural-language question from command line
    const questionArgs = process.argv.slice(2).join(" ").trim();

    if (!questionArgs) {
        console.error("\n❌ Error: No question provided.\n");
        console.error("Usage:");
        console.error('  node scripts/query.js "<your natural language question>"\n');
        console.error("Examples:");
        console.error('  node scripts/query.js "What files does app.js import?"');
        console.error('  node scripts/query.js "Which files depend directly or indirectly on database.js?"');
        console.error('  node scripts/query.js "List all files in the project."\n');
        process.exitCode = 1;
        return;
    }

    console.log("\n=======================================================");
    console.log("  🔍 RippleCheck NL Query");
    console.log("=======================================================");
    console.log(`\n💬 Question: "${questionArgs}"\n`);

    try {
        // 2. Generate Cypher query from natural language
        console.log("🤖 Generating Cypher query via AI provider...");
        const cypher = await generateCypher(questionArgs);

        console.log("\n📐 Generated Cypher Query:");
        console.log("-------------------------------------------------------");
        console.log(cypher);
        console.log("-------------------------------------------------------\n");

        // 3. Execute Cypher (includes allowlist validation & Neo4j execution)
        console.log("⚡ Validating and executing against Neo4j...");
        const records = await executeCypher(cypher);

        // 4. Display results
        console.log("\n📊 Results:");
        console.log("-------------------------------------------------------");
        displayResults(records);
        console.log("-------------------------------------------------------\n");
        console.log("✅ Query completed successfully.\n");

    } catch (err) {
        console.error("\n❌ Query execution failed:");
        console.error(`   ${err.message}\n`);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };

