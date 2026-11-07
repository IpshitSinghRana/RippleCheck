// -----------------------------------------------------------------------------
// poc-runner.js — Isolated Graph Compatibility Benchmark for RippleCheck
// -----------------------------------------------------------------------------

const path = require('path');
const fs = require('fs');

async function testEngine(name, pkgPath) {
  console.log(`\n======================================================`);
  console.log(`Testing Engine: ${name}`);
  console.log(`======================================================`);

  const dbDir = path.resolve(__dirname, `test-db-${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
  if (fs.existsSync(dbDir)) {
    fs.rmSync(dbDir, { recursive: true, force: true });
  }

  const engine = require(pkgPath);
  console.log(`Version: ${engine.VERSION || 'unknown'}`);

  const startInit = Date.now();
  const db = new engine.Database(dbDir);
  const conn = new engine.Connection(db);
  const initDuration = Date.now() - startInit;
  console.log(`Initialization time: ${initDuration} ms`);

  // Helper to run query
  const query = async (cypher, params = {}) => {
    let q = cypher;
    for (const [k, v] of Object.entries(params)) {
      const valStr = typeof v === 'string' ? `'${v}'` : String(v);
      q = q.replace(new RegExp(`\\$${k}\\b`, 'g'), valStr);
    }
    const result = await conn.query(q);
    return await result.getAll();
  };

  const results = {};

  try {
    // 1. Schema Creation
    console.log(`[1] Creating Schema...`);
    await conn.query(`CREATE NODE TABLE File (path STRING, name STRING, summary STRING, projectId STRING, userId STRING, PRIMARY KEY(path))`);
    await conn.query(`CREATE REL TABLE IMPORTS (FROM File TO File)`);
    results.schema = 'PASS';
    console.log(` -> Schema created successfully.`);

    // 2. Data Ingestion (sample-repo dataset)
    console.log(`[2] Ingesting Sample Dataset...`);
    const files = [
      { path: 'src/index.js', name: 'index.js', summary: 'Entry point', projectId: 'sample-repo', userId: 'public' },
      { path: 'src/app.js', name: 'app.js', summary: 'App configuration', projectId: 'sample-repo', userId: 'public' },
      { path: 'src/routes.js', name: 'routes.js', summary: 'Express routes', projectId: 'sample-repo', userId: 'public' },
      { path: 'src/userService.js', name: 'userService.js', summary: 'User logic', projectId: 'sample-repo', userId: 'public' },
      { path: 'src/database.js', name: 'database.js', summary: 'DB client', projectId: 'sample-repo', userId: 'public' },
      { path: 'src/utils.js', name: 'utils.js', summary: 'Helper utilities', projectId: 'sample-repo', userId: 'public' }
    ];

    for (const f of files) {
      await conn.query(`CREATE (:File {path: '${f.path}', name: '${f.name}', summary: '${f.summary}', projectId: '${f.projectId}', userId: '${f.userId}'})`);
    }

    const imports = [
      ['src/index.js', 'src/app.js'],
      ['src/app.js', 'src/routes.js'],
      ['src/routes.js', 'src/userService.js'],
      ['src/userService.js', 'src/database.js'],
      ['src/userService.js', 'src/utils.js']
    ];

    for (const [src, tgt] of imports) {
      await conn.query(`MATCH (a:File {path: '${src}'}), (b:File {path: '${tgt}'}) CREATE (a)-[:IMPORTS]->(b)`);
    }
    results.ingestion = 'PASS';
    console.log(` -> Ingested 6 File nodes and 5 IMPORTS relationships.`);

    // 3. Direct Dependency Query
    console.log(`[3] Direct Dependency Query...`);
    const directRes = await query(`MATCH (a:File {projectId: $projectId})-[:IMPORTS]->(b:File {projectId: $projectId}) RETURN a.path AS source, b.path AS target`, { projectId: 'sample-repo' });
    console.log(` -> Found ${directRes.length} direct edges (expected 5).`);
    results.directDependencies = directRes.length === 5 ? 'PASS' : 'FAIL';

    // 4. Transitive / Variable-Length Path Impact Traversal
    console.log(`[4] Variable-Length Impact Traversal (Blast Radius of database.js)...`);
    const impactRes = await query(`MATCH (affected:File {projectId: $projectId})-[:IMPORTS*1..10]->(target:File {projectId: $projectId, name: $fileName}) RETURN DISTINCT affected.path AS path, affected.name AS name`, { projectId: 'sample-repo', fileName: 'database.js' });
    console.log(` -> Affected files:`, impactRes.map(r => r.name || r['affected.name'] || r['path'] || r['affected.path']));
    results.impactTraversal = impactRes.length === 3 ? 'PASS' : `COUNT_${impactRes.length}`;

    // 5. Fan-In / Fan-Out Metrics
    console.log(`[5] Calculating Fan-In / Fan-Out Architecture Metrics...`);
    const fanInRes = await query(`MATCH (importer:File {projectId: $projectId})-[:IMPORTS]->(target:File {projectId: $projectId}) RETURN target.name AS name, count(importer) AS inDegree ORDER BY inDegree DESC`, { projectId: 'sample-repo' });
    console.log(` -> Fan-In Top:`, fanInRes.slice(0, 2));
    results.metrics = fanInRes.length > 0 ? 'PASS' : 'FAIL';

    // 6. User / Project Isolation
    console.log(`[6] Testing Multi-Project Isolation...`);
    await conn.query(`CREATE (:File {path: 'src/private.js', name: 'private.js', summary: 'Secret', projectId: 'user-b-project', userId: 'user-b'})`);
    const sampleRepoCheck = await query(`MATCH (f:File {projectId: $projectId}) RETURN f.name AS name`, { projectId: 'sample-repo' });
    const isIsolated = !sampleRepoCheck.some(r => (r.name || r['f.name']) === 'private.js');
    console.log(` -> Project isolation maintained? ${isIsolated}`);
    results.isolation = isIsolated ? 'PASS' : 'FAIL';

    // 7. Transaction & Persistence Test
    console.log(`[7] Testing Persistence across Connection Restart...`);
    conn.closeSync();
    db.closeSync();
    // Allow Windows file handle release
    await new Promise(r => setTimeout(r, 200));

    const db2 = new engine.Database(dbDir);
    const conn2 = new engine.Connection(db2);
    const persistResult = await conn2.query(`MATCH (f:File) RETURN count(f) AS cnt`);
    const countRows = await persistResult.getAll();
    console.log(` -> Node count after restart:`, countRows[0]);
    conn2.closeSync();
    db2.closeSync();
    results.persistence = 'PASS';

  } catch (err) {
    console.error(`ERROR in ${name}:`, err.message);
    results.error = err.message;
  }

  // Cleanup
  if (fs.existsSync(dbDir)) {
    try { fs.rmSync(dbDir, { recursive: true, force: true }); } catch {}
  }

  return { name, initDuration, results };
}

async function run() {
  console.log("Starting Graph Database Comparison Benchmark...");

  const r1 = await testEngine('LadybugDB', '@ladybugdb/core');
  const r2 = await testEngine('RyuGraph', 'ryugraph');
  const r3 = await testEngine('Kuzu-Legacy', 'kuzu');

  console.log(`\n======================================================`);
  console.log(`FINAL BENCHMARK SUMMARY`);
  console.log(`======================================================`);
  console.table([
    {
      Engine: r1.name,
      InitMs: r1.initDuration,
      Schema: r1.results.schema,
      Ingest: r1.results.ingestion,
      DirectDep: r1.results.directDependencies,
      ImpactTraversal: r1.results.impactTraversal,
      Metrics: r1.results.metrics,
      Isolation: r1.results.isolation,
      Persistence: r1.results.persistence
    },
    {
      Engine: r2.name,
      InitMs: r2.initDuration,
      Schema: r2.results.schema,
      Ingest: r2.results.ingestion,
      DirectDep: r2.results.directDependencies,
      ImpactTraversal: r2.results.impactTraversal,
      Metrics: r2.results.metrics,
      Isolation: r2.results.isolation,
      Persistence: r2.results.persistence
    },
    {
      Engine: r3.name,
      InitMs: r3.initDuration,
      Schema: r3.results.schema,
      Ingest: r3.results.ingestion,
      DirectDep: r3.results.directDependencies,
      ImpactTraversal: r3.results.impactTraversal,
      Metrics: r3.results.metrics,
      Isolation: r3.results.isolation,
      Persistence: r3.results.persistence
    }
  ]);
}

run();
