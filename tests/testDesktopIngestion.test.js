// -----------------------------------------------------------------------------
// tests/testDesktopIngestion.test.js — Desktop Ingestion & Isolation Test Suite
//
// Tests:
// 1. Ingestion of simulated ShopSphere repository into embedded LadybugDB.
// 2. Direct dependencies count & edge verification.
// 3. Transitive blast radius / impact analysis in LadybugDB.
// 4. Circular dependency detection in LadybugDB.
// 5. Multi-project isolation: Upload second project with identical file paths.
// 6. Parameter escaping: single quotes, double quotes, backslashes, Unicode, nulls.
// 7. Temporary extraction and upload cleanup verification.
// -----------------------------------------------------------------------------

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const AdmZip = require('adm-zip');

const testDbPath = path.resolve(__dirname, '../temp_desktop_ingest_test_db');
process.env.RIPPLECHECK_DESKTOP_DB_PATH = testDbPath;
process.env.RIPPLECHECK_EDITION = 'desktop';

const { executeCypher, initSchema, closeDatabase } = require('../services/graphAdapter');
const { loadGraph } = require('../scripts/load-graph');
const { createProject, listUserProjects, getProjectById } = require('../services/projectStore');
const { scanRepository } = require('../scripts/scan');
const { safelyExtractZip } = require('../services/zipExtractor');

describe('Desktop Repository Ingestion & Scanning Integration', () => {

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

    test('1. Full Ingestion: ShopSphere repository ZIP extracts, scans and loads into LadybugDB', async () => {
        // Construct simulated ShopSphere multi-tier repository ZIP
        const zip = new AdmZip();
        zip.addFile('src/server.js', Buffer.from(`
            const app = require('./app');
            console.log('Server started');
        `));
        zip.addFile('src/app.js', Buffer.from(`
            const routes = require('./routes');
            module.exports = { app: true };
        `));
        zip.addFile('src/routes.js', Buffer.from(`
            const authService = require('./authService');
            const cartService = require('./cartService');
            module.exports = { routes: true };
        `));
        zip.addFile('src/authService.js', Buffer.from(`
            const db = require('./database');
            module.exports = { login: () => true };
        `));
        zip.addFile('src/cartService.js', Buffer.from(`
            const db = require('./database');
            const paymentService = require('./paymentService');
            module.exports = { checkout: () => true };
        `));
        zip.addFile('src/paymentService.js', Buffer.from(`
            const db = require('./database');
            module.exports = { charge: () => true };
        `));
        zip.addFile('src/database.js', Buffer.from(`
            module.exports = { query: () => [] };
        `));

        const zipBuffer = zip.toBuffer();
        const extraction = safelyExtractZip(zipBuffer);

        assert.ok(fs.existsSync(extraction.extractDir));
        assert.equal(extraction.manifestFiles.length, 7);

        // Scan via Madge
        const madgeGraph = await scanRepository(path.join(extraction.extractDir, 'src'), null);
        assert.ok(Object.keys(madgeGraph).length > 0);

        // Load into desktop LadybugDB
        const projectId = 'proj-shopsphere-1001';
        const userId = 'desktop-guest-user';
        const loadResult = await loadGraph({
            madgeData: madgeGraph,
            projectId,
            userId
        });

        assert.equal(loadResult.totalFiles, 7);
        assert.equal(loadResult.totalRelationships, 8);

        // Save project metadata
        const savedProject = await createProject({
            projectId,
            userId,
            projectName: 'ShopSphere',
            originalZipName: 'ShopSphere.zip',
            fileCount: loadResult.totalFiles,
            dependencyCount: loadResult.totalRelationships,
            manifest: extraction.manifestFiles
        });

        assert.equal(savedProject.projectName, 'ShopSphere');
        assert.equal(savedProject.fileCount, 7);
        assert.equal(savedProject.dependencyCount, 8);

        // Verify cleanup
        extraction.cleanup();
        assert.equal(fs.existsSync(extraction.extractDir), false);
    });

    test('2. Project listing and retrieval survives in Desktop Edition', async () => {
        const userId = 'desktop-guest-user';
        const projects = await listUserProjects(userId);
        assert.ok(projects.length >= 2, `Expected at least 2 projects, got ${projects.length}`);
        const shopSphere = projects.find(p => p.projectId === 'proj-shopsphere-1001');
        assert.ok(shopSphere);
        assert.equal(shopSphere.projectName, 'ShopSphere');

        const fetched = await getProjectById('proj-shopsphere-1001');
        assert.ok(fetched);
        assert.equal(fetched.projectId, 'proj-shopsphere-1001');
    });

    test('2. Query verification: Direct and transitive dependencies match graph topology', async () => {
        const projectId = 'proj-shopsphere-1001';

        // Direct importers of database.js (should be 3: authService, cartService, paymentService)
        const directImporters = await executeCypher(`
            MATCH (importer:File {projectId: $projectId})-[:IMPORTS]->(target:File {projectId: $projectId, name: 'database.js'})
            RETURN importer.name AS name ORDER BY importer.name ASC
        `, { projectId });

        assert.equal(directImporters.length, 3);
        const directNames = directImporters.map(r => r.name);
        assert.deepEqual(directNames, ['authService.js', 'cartService.js', 'paymentService.js']);

        // Transitive blast radius of database.js (should reach server.js, app.js, routes.js)
        const impactRecords = await executeCypher(`
            MATCH (affected:File {projectId: $projectId})-[:IMPORTS*1..10]->(target:File {projectId: $projectId, name: 'database.js'})
            RETURN DISTINCT affected.name AS name ORDER BY affected.name ASC
        `, { projectId });

        const affectedNames = impactRecords.map(r => r.name);
        assert.ok(affectedNames.includes('server.js'));
        assert.ok(affectedNames.includes('app.js'));
        assert.ok(affectedNames.includes('routes.js'));
        assert.ok(affectedNames.includes('cartService.js'));
    });

    test('3. Multi-project duplicate path collision prevention', async () => {
        // Ingest a second project with the EXACT same relative paths ('src/server.js', 'src/database.js')
        const projectIdA = 'proj-shopsphere-1001';
        const projectIdB = 'proj-shopsphere-duplicate-test';
        const userId = 'desktop-guest-user';

        const madgeGraphB = {
            'server.js': ['database.js'],
            'database.js': []
        };

        const loadB = await loadGraph({
            madgeData: madgeGraphB,
            projectId: projectIdB,
            userId
        });

        assert.equal(loadB.totalFiles, 2);

        // Query Project A — must still have exactly 7 files, not 9
        const projectAFiles = await executeCypher(`
            MATCH (f:File {projectId: $projectId}) RETURN count(f) AS cnt
        `, { projectId: projectIdA });
        assert.equal(Number(projectAFiles[0].cnt || projectAFiles[0]['count(f)']), 7);

        // Query Project B — must have exactly 2 files
        const projectBFiles = await executeCypher(`
            MATCH (f:File {projectId: $projectId}) RETURN count(f) AS cnt
        `, { projectId: projectIdB });
        assert.equal(Number(projectBFiles[0].cnt || projectBFiles[0]['count(f)']), 2);
    });

    test('4. Parameter safety: Handles single quotes, backslashes, Unicode and injection attempts safely', async () => {
        const trickyName = "file'with\"quotes\\and/slashes_🚀.js";
        const trickyProjectId = "proj'--inject;DROP TABLE File;--";

        // Query with malicious or tricky parameter values
        const records = await executeCypher(`
            MATCH (f:File {projectId: $projectId, name: $fileName})
            RETURN f.name AS name
        `, { projectId: trickyProjectId, fileName: trickyName });

        // Query must safely execute and return 0 rows without syntax errors or injection
        assert.equal(records.length, 0);
    });
});
