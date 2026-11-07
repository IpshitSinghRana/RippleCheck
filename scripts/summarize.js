// -----------------------------------------------------------------------------
// summarize.js — RippleCheck AI-powered source code summarizer
//
// Reads JavaScript source files from data/sample-repo/src/, generates a concise
// 1-2 sentence summary for each file using the configured AI provider
// (via providers/aiProvider.js), and updates the corresponding File node in Neo4j:
//   SET f.summary = $summary
//
// Usage:  node scripts/summarize.js
//
// Prerequisites:
//   1. Neo4j container running and graph loaded (node scripts/load-graph.js)
//   2. AI Provider configured in .env (defaults to local Ollama with qwen2.5-coder:3b)
// -----------------------------------------------------------------------------

const path  = require("path");
const fs    = require("fs");
const neo4j = require("neo4j-driver");

require("dotenv").config({
    path: path.resolve(__dirname, "../.env")
});

const aiProvider = require("../providers/aiProvider");

// ---------------------------------------------------------------------------
// Paths — resolved relative to the project root so the script works
// regardless of the working directory it is called from.
// ---------------------------------------------------------------------------
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SRC_DIR      = path.join(PROJECT_ROOT, "data", "sample-repo", "src");

// ---------------------------------------------------------------------------
// Guard: fail early and clearly if the password is missing.
// ---------------------------------------------------------------------------
if (!process.env.NEO4J_PASSWORD) {
    console.error("❌ NEO4J_PASSWORD is not set.");
    console.error(
        "   Add it to the root .env file:  NEO4J_PASSWORD=<your_password>"
    );
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Configuration — read from .env with sensible defaults.
// ---------------------------------------------------------------------------
const NEO4J_URI      = process.env.NEO4J_URI      || "bolt://localhost:7687";
const NEO4J_USERNAME = process.env.NEO4J_USERNAME  || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;   // never logged
const TARGET_DB      = "neo4j";

// ---------------------------------------------------------------------------
// Normalize file paths to match the exact convention stored by load-graph.js:
// forward-slash relative path from the src directory (e.g. "app.js").
// ---------------------------------------------------------------------------
function normalizePath(rawPath) {
    return rawPath.split(path.sep).join("/");
}

// ---------------------------------------------------------------------------
// Recursively discover all JavaScript source files in the target directory.
// ---------------------------------------------------------------------------
function getSourceFiles(dir, baseDir = dir) {
    let files = [];
    if (!fs.existsSync(dir)) {
        return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(getSourceFiles(fullPath, baseDir));
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            const relativePath = normalizePath(path.relative(baseDir, fullPath));
            files.push({
                fullPath,
                relativePath,
                name: entry.name,
            });
        }
    }

    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

// ---------------------------------------------------------------------------
// Main summarizer function
// ---------------------------------------------------------------------------
async function summarize(targetSrcDir = SRC_DIR, projectId = "sample-repo") {
    // 1. Discover source files
    const sourceFiles = getSourceFiles(targetSrcDir);

    if (sourceFiles.length === 0) {
        console.warn(`⚠️ No .js source files found in: ${targetSrcDir}`);
        return { successfulFiles: [], failedFiles: [] };
    }

    // 2. Initialize Neo4j driver & session
    const driver = neo4j.driver(
        NEO4J_URI,
        neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
    );

    let session;
    const successfulFiles = [];
    const failedFiles = [];

    try {
        const providerInfo = aiProvider.getProviderInfo();

        console.log("=================================================");
        console.log("🧠 RippleCheck — AI Source Code Summarizer");
        console.log("=================================================");
        console.log(`📁 Source directory : ${SRC_DIR}`);
        console.log(`🤖 AI Provider      : ${providerInfo.provider}`);
        console.log(`📦 Model            : ${providerInfo.model}`);
        console.log(`🔌 Neo4j database   : ${TARGET_DB} at ${NEO4J_URI}`);
        console.log("-------------------------------------------------");
        console.log(`Found ${sourceFiles.length} JavaScript file(s) to process.\n`);

        console.log(`🔌 Connecting to Neo4j...`);
        await driver.verifyConnectivity();
        console.log(`✅ Connected successfully to Neo4j.\n`);

        session = driver.session({ database: TARGET_DB });

        // 3. Process each file
        for (let i = 0; i < sourceFiles.length; i++) {
            const file = sourceFiles[i];
            const progress = `[${i + 1}/${sourceFiles.length}]`;
            console.log(`${progress} 📄 Processing: ${file.relativePath}`);

            try {
                // Read source code
                const sourceCode = fs.readFileSync(file.fullPath, "utf8");

                // Request summary from configured AI provider
                console.log(`   🤖 Requesting summary from ${providerInfo.provider} (${providerInfo.model})...`);
                const summary = await aiProvider.generateSummary(file.relativePath, sourceCode);

                // Guard: Do not overwrite with an empty summary
                if (!summary || summary.trim().length === 0) {
                    throw new Error("AI provider returned an empty summary response");
                }

                console.log(`   💬 Summary: "${summary}"`);

                // Update File node in Neo4j using parameterized Cypher query
                // Matches existing File node by exact path and projectId
                const result = await session.run(
                    `
                    MATCH (f:File {projectId: $projectId, path: $path})
                    SET f.summary = $summary
                    RETURN f.path AS path
                    `,
                    {
                        projectId: projectId,
                        path: file.relativePath,
                        summary: summary,
                    }
                );

                if (result.records.length === 0) {
                    throw new Error(
                        `No File node found in Neo4j matching project "${projectId}" and path: "${file.relativePath}".`
                    );
                }

                console.log(`   ✅ Neo4j updated for "${file.relativePath}"\n`);
                successfulFiles.push({
                    path: file.relativePath,
                    summary: summary,
                });

            } catch (fileError) {
                console.error(`   ❌ Failed to process "${file.relativePath}": ${fileError.message}\n`);
                failedFiles.push({
                    path: file.relativePath,
                    error: fileError.message,
                });
            }
        }

        // Set non-zero exit code if any individual files failed during batch processing
        if (failedFiles.length > 0) {
            process.exitCode = 1;
        }

        // 4. Post-execution verification query
        console.log("-------------------------------------------------");
        console.log("🔍 Verifying File node summaries in Neo4j...");

        const verifyResult = await session.run(`
            MATCH (f:File {projectId: $projectId})
            RETURN
                count(f) AS totalFiles,
                count(CASE WHEN f.summary IS NOT NULL AND trim(f.summary) <> "" THEN 1 END) AS summarizedFiles
        `, { projectId });

        const totalFiles = verifyResult.records[0].get("totalFiles").toNumber();
        const summarizedFiles = verifyResult.records[0].get("summarizedFiles").toNumber();

        // 5. Final summary output
        console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📊 Summarization Batch Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total files scanned  : ${sourceFiles.length}
  Successful           : ${successfulFiles.length}
  Failed               : ${failedFiles.length}

  Neo4j Verification:
  Total File nodes in DB     : ${totalFiles}
  Nodes with non-empty summary: ${summarizedFiles} / ${totalFiles}`);

        if (successfulFiles.length > 0) {
            console.log("\n  ✅ Successfully summarized files:");
            for (const item of successfulFiles) {
                console.log(`     • ${item.path}`);
            }
        }

        if (failedFiles.length > 0) {
            console.log("\n  ⚠️ Failed files:");
            for (const item of failedFiles) {
                console.log(`     • ${item.path} → ${item.error}`);
            }
        }

        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    } catch (error) {
        process.exitCode = 1;
        console.error("\n❌ Summarization workflow failed.");
        console.error(`   Reason: ${error.message}`);
        console.error(
            "\n   Troubleshooting tips:" +
            "\n   - Is Neo4j running?  → docker compose ps" +
            "\n   - Check AI provider settings in .env (e.g. AI_PROVIDER=ollama)" +
            "\n   - For Ollama: is the daemon running and model pulled? (ollama pull qwen2.5-coder:3b)"
        );
    } finally {
        // 6. Ensure safe cleanup of session and driver
        if (session) {
            try {
                await session.close();
            } catch (closeErr) {
                console.error("Error closing Neo4j session:", closeErr.message);
            }
        }
        if (driver) {
            try {
                await driver.close();
            } catch (driverCloseErr) {
                console.error("Error closing Neo4j driver:", driverCloseErr.message);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------
if (require.main === module) {
    const customSrc = process.argv[2] || SRC_DIR;
    const customProject = process.argv[3] || "sample-repo";
    summarize(customSrc, customProject);
}

module.exports = { summarize };

