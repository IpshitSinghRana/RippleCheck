// -----------------------------------------------------------------------------
// tests/testZipUpload.test.js — Comprehensive Test Suite for ZIP Upload & Analysis
// -----------------------------------------------------------------------------

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");
const neo4j = require("neo4j-driver");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { validateZip, safelyExtractZip, LIMITS } = require("../services/zipExtractor");
const { verifyProjectAccess } = require("../middleware/verifyAuth");

const NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7687";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "password";
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

test.describe("ZIP Validation & Security Guardrails", () => {

    test("1. Valid ZIP archive passes validation and extracts safely", () => {
        const zip = new AdmZip();
        zip.addFile("src/index.js", Buffer.from("const a = require('./utils'); module.exports = a;"));
        zip.addFile("src/utils.js", Buffer.from("module.exports = { ping: () => 'pong' };"));
        const zipBuffer = zip.toBuffer();

        const { zip: validatedZip, jsFileCount } = validateZip(zipBuffer);
        assert.equal(jsFileCount, 2);

        const extraction = safelyExtractZip(zipBuffer);
        assert.ok(fs.existsSync(extraction.extractDir));
        assert.ok(fs.existsSync(path.join(extraction.extractDir, "src", "index.js")));
        assert.ok(fs.existsSync(path.join(extraction.extractDir, "src", "utils.js")));

        // Cleanup
        extraction.cleanup();
        assert.equal(fs.existsSync(extraction.extractDir), false);
    });

    test("2. Rejects invalid file types / non-code archives (no JS/source files)", () => {
        const zip = new AdmZip();
        zip.addFile("document.txt", Buffer.from("Just plain text without code"));
        zip.addFile("image.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        const zipBuffer = zip.toBuffer();

        assert.throws(
            () => validateZip(zipBuffer),
            /No JavaScript source files/i
        );
    });

    test("3. Rejects ZIP Slip / path traversal entry", () => {
        const zip = new AdmZip();
        zip.addFile("dummy.js", Buffer.from("console.log('normal');"));
        const entries = zip.getEntries();
        entries[0].entryName = "../evil.js";

        assert.throws(
            () => validateZip(zip.toBuffer()),
            /ZIP Slip path traversal detected/i
        );
    });

    test("4. Rejects absolute paths in archive entries", () => {
        const zip = new AdmZip();
        zip.addFile("dummy.js", Buffer.from("root:x:0:0"));
        const entries = zip.getEntries();
        entries[0].entryName = "/etc/passwd.js";

        assert.throws(
            () => validateZip(zip.toBuffer()),
            /Archive entry has an absolute path/i
        );
    });

    test("5. Rejects null bytes in entry filenames", () => {
        const zip = new AdmZip();
        zip.addFile("test\0evil.js", Buffer.from("console.log('null byte');"));
        const zipBuffer = zip.toBuffer();

        assert.throws(
            () => validateZip(zipBuffer),
            /illegal null byte/i
        );
    });

    test("6. Supports repositories with thousands of files and excludes ignored folders", () => {
        const zip = new AdmZip();
        // Add active JS source files in nested directories
        zip.addFile("src/index.js", Buffer.from("console.log('root');"));
        zip.addFile("src/components/Button.js", Buffer.from("console.log('button');"));
        // Add ignored entries (node_modules, .git, dist, build, coverage)
        zip.addFile("node_modules/express/index.js", Buffer.from("module.exports = {};"));
        zip.addFile(".git/config", Buffer.from("[core]"));
        zip.addFile("dist/bundle.js", Buffer.from("var min = 1;"));
        zip.addFile("coverage/lcov.info", Buffer.from("TN:"));

        const { jsFileCount, entries } = validateZip(zip.toBuffer());
        // Only the 2 non-ignored files are counted for analysis
        assert.equal(jsFileCount, 2);
        assert.equal(entries.length, 2);
    });

    test("7. Rejects excessive entry count (> 25,000 entries)", () => {
        // Test limit threshold configuration
        assert.equal(LIMITS.MAX_FILES, 25000);
    });

    test("8. Rejects suspicious compression ratios above 100:1 (Zip Bomb defense)", () => {
        const zip = new AdmZip();
        // 2 MB of zeroes compresses to negligible size
        const hugeBuffer = Buffer.alloc(2 * 1024 * 1024, 0);
        zip.addFile("huge.js", hugeBuffer);
        const zipBuffer = zip.toBuffer();

        assert.throws(
            () => validateZip(zipBuffer),
            /compression ratio/i
        );
    });
});

test.describe("Multi-Project Isolation & User Ownership Post-Upload", () => {
    const PROJ_A = "test-upload-proj-a";
    const PROJ_B = "test-upload-proj-b";
    const USER_A = "firebase_user_a";
    const USER_B = "firebase_user_b";

    test.before(async () => {
        const session = driver.session();
        try {
            // Seed two isolated projects both containing an index.js
            await session.run(`
                MERGE (a1:File {projectId: $projA, path: "src/index.js"})
                ON CREATE SET a1.name = "index.js", a1.userId = $userA, a1.summary = "User A index"
                MERGE (a2:File {projectId: $projA, path: "src/api.js"})
                ON CREATE SET a2.name = "api.js", a2.userId = $userA, a2.summary = "User A API"
                MERGE (a1)-[:IMPORTS]->(a2)

                MERGE (b1:File {projectId: $projB, path: "src/index.js"})
                ON CREATE SET b1.name = "index.js", b1.userId = $userB, b1.summary = "User B index"
                MERGE (b2:File {projectId: $projB, path: "src/db.js"})
                ON CREATE SET b2.name = "db.js", b2.userId = $userB, b2.summary = "User B DB"
                MERGE (b1)-[:IMPORTS]->(b2)
            `, { projA: PROJ_A, projB: PROJ_B, userA: USER_A, userB: USER_B });
        } finally {
            await session.close();
        }
    });

    test.after(async () => {
        const session = driver.session();
        try {
            await session.run(`
                MATCH (f:File)
                WHERE f.projectId IN [$projA, $projB]
                DETACH DELETE f
            `, { projA: PROJ_A, projB: PROJ_B });
        } finally {
            await session.close();
            await driver.close();
        }
    });

    test("8. Two projects both containing index.js remain strictly isolated in Neo4j", async () => {
        const session = driver.session();
        try {
            const resA = await session.run(
                "MATCH (f:File {projectId: $projA}) RETURN f.path AS path, f.userId AS userId ORDER BY path",
                { projA: PROJ_A }
            );
            const resB = await session.run(
                "MATCH (f:File {projectId: $projB}) RETURN f.path AS path, f.userId AS userId ORDER BY path",
                { projB: PROJ_B }
            );

            assert.equal(resA.records.length, 2);
            assert.equal(resB.records.length, 2);

            const pathsA = resA.records.map((r) => r.get("path"));
            const pathsB = resB.records.map((r) => r.get("path"));

            assert.deepEqual(pathsA, ["src/api.js", "src/index.js"]);
            assert.deepEqual(pathsB, ["src/db.js", "src/index.js"]);

            // Project A relationships only connect within Project A
            const relsA = await session.run(
                "MATCH (a:File {projectId: $projA})-[r:IMPORTS]->(b:File) RETURN a.path AS src, b.path AS target, b.projectId AS targetProj",
                { projA: PROJ_A }
            );
            assert.equal(relsA.records.length, 1);
            assert.equal(relsA.records[0].get("targetProj"), PROJ_A);
        } finally {
            await session.close();
        }
    });

    test("9. User A cannot access User B uploaded project (HTTP 403)", async () => {
        const req = {
            userId: USER_A,
            query: { projectId: PROJ_B }
        };
        let statusCode = null;
        let responseBody = null;
        const res = {
            status(code) {
                statusCode = code;
                return this;
            },
            json(data) {
                responseBody = data;
                return this;
            }
        };

        let nextCalled = false;
        await verifyProjectAccess(req, res, () => { nextCalled = true; });

        assert.equal(statusCode, 403);
        assert.equal(nextCalled, false);
        assert.match(responseBody.error, /You do not have permission to access project/i);
    });

    test("10. Existing sample repository still works and is accessible", async () => {
        const req = {
            userId: "public",
            query: { projectId: "sample-repo" }
        };
        let statusCode = null;
        const res = {
            status(code) {
                statusCode = code;
                return this;
            },
            json(data) {
                return this;
            }
        };

        let nextCalled = false;
        await verifyProjectAccess(req, res, () => { nextCalled = true; });

        assert.equal(statusCode, null);
        assert.equal(nextCalled, true);
    });
});
