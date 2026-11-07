require("dotenv").config();

const fs = require("fs");
const neo4j = require("neo4j-driver");

const MADGE_FILE = "data/madge.json";

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
    console.error("Missing Neo4j environment variables in .env");
    process.exit(1);
}

const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
);

async function loadGraph() {
    let session;

    try {
        // Read Madge JSON
        const madgeData = JSON.parse(
            fs.readFileSync(MADGE_FILE, "utf8")
        );

        // Collect every file mentioned in the graph
        const files = new Set();

        for (const [file, dependencies] of Object.entries(madgeData)) {
            files.add(file);

            for (const dependency of dependencies) {
                files.add(dependency);
            }
        }

        const fileList = [...files];

        console.log(`Found ${fileList.length} files in Madge graph.`);

        // Open Neo4j session
        session = driver.session();

        // Create File nodes
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];

            await session.run(
                `
                MERGE (f:File {path: $path})
                `,
                { path: file }
            );

            console.log(`Loaded ${i + 1}/${fileList.length} files`);
        }

        // Create IMPORTS relationships
        for (const [file, dependencies] of Object.entries(madgeData)) {
            for (const dependency of dependencies) {
                await session.run(
                    `
                    MATCH (source:File {path: $source})
                    MATCH (target:File {path: $target})
                    MERGE (source)-[:IMPORTS]->(target)
                    `,
                    {
                        source: file,
                        target: dependency
                    }
                );
            }
        }

        console.log("✅ Graph loaded successfully.");
    } catch (error) {
        console.error("❌ Failed to load graph:");
        console.error(error);
    } finally {
        if (session) {
            await session.close();
        }

        await driver.close();
    }
}

loadGraph();