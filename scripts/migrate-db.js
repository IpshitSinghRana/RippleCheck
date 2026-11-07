const neo4j = require('neo4j-driver');
require('dotenv').config();

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD)
);

async function migrate() {
  const session = driver.session({ database: 'neo4j' });
  try {
    console.log('1. Migrating existing nodes to have projectId: "sample-repo" and userId: "public"...');
    const setRes = await session.run(
      'MATCH (f:File) WHERE f.projectId IS NULL SET f.projectId = "sample-repo", f.userId = coalesce(f.userId, "public") RETURN count(f) AS count'
    );
    console.log('Migrated node count:', setRes.records[0].get('count').toNumber());

    console.log('2. Dropping old constraint file_path_unique if it exists...');
    await session.run('DROP CONSTRAINT file_path_unique IF EXISTS');
    console.log('Dropped file_path_unique');

    console.log('3. Creating new composite constraint file_project_path_unique...');
    await session.run(
      'CREATE CONSTRAINT file_project_path_unique IF NOT EXISTS FOR (f:File) REQUIRE (f.projectId, f.path) IS UNIQUE'
    );
    console.log('Created file_project_path_unique');

    const constraints = await session.run('SHOW CONSTRAINTS');
    console.log('Updated constraints:', constraints.records.map(r => ({ name: r.get('name'), properties: r.get('properties') })));

    const nodes = await session.run('MATCH (f:File) RETURN f.path AS path, f.name AS name, f.projectId AS projectId, f.userId AS userId');
    console.log('Nodes after migration:', nodes.records.map(r => r.toObject()));
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

migrate();

