// -----------------------------------------------------------------------------
// testLadybugAdapter.test.js — Integration & Regression Test for Desktop Adapter
// -----------------------------------------------------------------------------

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Set isolated test directory for LadybugDB
const testDbPath = path.resolve(__dirname, '../temp_test_ladybug_db');
process.env.RIPPLECHECK_DESKTOP_DB_PATH = testDbPath;
process.env.RIPPLECHECK_EDITION = 'desktop';

const { executeCypher, initSchema, closeDatabase } = require('../services/graphAdapter');
const { executeLadybug } = require('../services/ladybugExecutor');

describe('Desktop Storage Adapter & LadybugDB Executor Compatibility', () => {

    before(async () => {
        if (fs.existsSync(testDbPath)) {
            fs.rmSync(testDbPath, { recursive: true, force: true });
        }
        await initSchema();
    });

    after(() => {
        closeDatabase();
        if (fs.existsSync(testDbPath)) {
            try { fs.rmSync(testDbPath, { recursive: true, force: true }); } catch {}
        }
    });

    test('1. Ingestion: Inserts File nodes and IMPORTS relationships', async () => {
        // Insert Files (id is primary key: `${projectId}::${path}`)
        await executeLadybug(
            `CREATE (:File {id: 'test-proj::src/index.js', path: 'src/index.js', name: 'index.js', summary: 'Entry', projectId: 'test-proj', userId: 'desktop-guest-user'})`,
            {},
            { bypassValidation: true }
        );
        await executeLadybug(
            `CREATE (:File {id: 'test-proj::src/app.js', path: 'src/app.js', name: 'app.js', summary: 'App', projectId: 'test-proj', userId: 'desktop-guest-user'})`,
            {},
            { bypassValidation: true }
        );
        await executeLadybug(
            `CREATE (:File {id: 'test-proj::src/db.js', path: 'src/db.js', name: 'db.js', summary: 'DB', projectId: 'test-proj', userId: 'desktop-guest-user'})`,
            {},
            { bypassValidation: true }
        );

        // Insert IMPORTS
        await executeLadybug(
            `MATCH (a:File {id: 'test-proj::src/index.js'}), (b:File {id: 'test-proj::src/app.js'}) CREATE (a)-[:IMPORTS]->(b)`,
            {},
            { bypassValidation: true }
        );
        await executeLadybug(
            `MATCH (a:File {id: 'test-proj::src/app.js'}), (b:File {id: 'test-proj::src/db.js'}) CREATE (a)-[:IMPORTS]->(b)`,
            {},
            { bypassValidation: true }
        );

        const nodes = await executeCypher(`MATCH (f:File {projectId: $projectId}) RETURN f.path AS path, f.name AS name`, { projectId: 'test-proj' });
        assert.equal(nodes.length, 3);
    });

    test('2. Direct dependencies: Query matches outgoing relationships', async () => {
        const edges = await executeCypher(
            `MATCH (a:File {projectId: $projectId})-[:IMPORTS]->(b:File {projectId: $projectId}) RETURN a.path AS source, b.path AS target`,
            { projectId: 'test-proj' }
        );
        assert.equal(edges.length, 2);
        assert.equal(edges[0].source, 'src/index.js');
        assert.equal(edges[0].target, 'src/app.js');
    });

    test('3. Transitive blast radius / impact analysis', async () => {
        // Find all files that depend on db.js
        const impacted = await executeCypher(
            `MATCH (affected:File {projectId: $projectId})-[:IMPORTS*1..10]->(target:File {projectId: $projectId, name: $fileName}) RETURN DISTINCT affected.path AS path, affected.name AS name`,
            { projectId: 'test-proj', fileName: 'db.js' }
        );

        assert.equal(impacted.length, 2);
        const names = impacted.map((f) => f.name);
        assert.ok(names.includes('app.js'));
        assert.ok(names.includes('index.js'));
    });

    test('4. Fan-in aggregation and metrics', async () => {
        const fanIn = await executeCypher(
            `MATCH (importer:File {projectId: $projectId})-[:IMPORTS]->(target:File {projectId: $projectId}) RETURN target.name AS name, count(importer) AS inDegree ORDER BY inDegree DESC`,
            { projectId: 'test-proj' }
        );
        assert.equal(fanIn.length, 2);
        assert.ok(fanIn[0].name === 'app.js' || fanIn[0].name === 'db.js');
    });

    test('5. Multi-project isolation', async () => {
        // Insert file for another project
        await executeLadybug(
            `CREATE (:File {id: 'other-proj::src/secret.js', path: 'src/secret.js', name: 'secret.js', summary: 'Other', projectId: 'other-proj', userId: 'user-b'})`,
            {},
            { bypassValidation: true }
        );

        // Querying test-proj should NOT see secret.js
        const files = await executeCypher(
            `MATCH (f:File {projectId: $projectId}) RETURN f.name AS name`,
            { projectId: 'test-proj' }
        );
        assert.equal(files.length, 3);
        assert.ok(!files.some((f) => f.name === 'secret.js'));
    });
});

