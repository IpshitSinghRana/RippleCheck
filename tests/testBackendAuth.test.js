const test = require('node:test')
const assert = require('node:assert/strict')
const neo4j = require('neo4j-driver')
const dotenv = require('dotenv')

dotenv.config()

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687'
const NEO4J_USER = process.env.NEO4J_USERNAME || process.env.NEO4J_USER || 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password'
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD))

const { verifyAuth, verifyProjectAccess } = require('../middleware/verifyAuth')

test.describe('Backend Auth & Project Isolation Integration Tests', () => {
  const TEST_PROJECT_A = 'test-auth-proj-a'
  const TEST_PROJECT_B = 'test-auth-proj-b'
  const USER_A = 'test_user_a_uid'
  const USER_B = 'test_user_b_uid'

  test.before(async () => {
    const session = driver.session()
    try {
      // Seed test projects
      await session.run(`
        MERGE (a:File {projectId: $projA, path: "src/index.js"})
        ON CREATE SET a.name = "index.js", a.userId = $userA, a.lines = 10, a.dependencies = 0
        MERGE (b:File {projectId: $projB, path: "src/index.js"})
        ON CREATE SET b.name = "index.js", b.userId = $userB, b.lines = 20, b.dependencies = 0
      `, { projA: TEST_PROJECT_A, projB: TEST_PROJECT_B, userA: USER_A, userB: USER_B })
    } finally {
      await session.close()
    }
  })

  test.after(async () => {
    const session = driver.session()
    try {
      await session.run(`
        MATCH (f:File)
        WHERE f.projectId IN [$projA, $projB]
        DETACH DELETE f
      `, { projA: TEST_PROJECT_A, projB: TEST_PROJECT_B })
    } finally {
      await session.close()
      await driver.close()
    }
  })

  test('1. Missing Bearer token on private project returns 401', async () => {
    const req = {
      headers: {},
      query: { projectId: TEST_PROJECT_A }
    }
    let statusCode = null
    let responseBody = null
    const res = {
      status(code) {
        statusCode = code
        return this
      },
      json(data) {
        responseBody = data
        return this
      }
    }
    let nextCalled = false
    await verifyAuth(req, res, () => { nextCalled = true })

    assert.equal(statusCode, 401)
    assert.equal(nextCalled, false)
    assert.match(responseBody.error, /Unauthorized: Missing or malformed Firebase ID token/i)
  })

  test('2. Invalid Bearer token returns 401', async () => {
    const req = {
      headers: { authorization: 'Bearer invalid_garbage_token' },
      query: { projectId: TEST_PROJECT_A }
    }
    let statusCode = null
    let responseBody = null
    const res = {
      status(code) {
        statusCode = code
        return this
      },
      json(data) {
        responseBody = data
        return this
      }
    }
    let nextCalled = false
    await verifyAuth(req, res, () => { nextCalled = true })

    assert.equal(statusCode, 401)
    assert.equal(nextCalled, false)
    assert.match(responseBody.error, /Unauthorized:/i)
  })

  test('3. User A accessing User B private project returns 403 Forbidden', async () => {
    const req = {
      userId: USER_A, // authenticated as User A
      query: { projectId: TEST_PROJECT_B } // targeting User B's project
    }
    let statusCode = null
    let responseBody = null
    const res = {
      status(code) {
        statusCode = code
        return this
      },
      json(data) {
        responseBody = data
        return this
      }
    }
    let nextCalled = false
    await verifyProjectAccess(req, res, () => { nextCalled = true })

    assert.equal(statusCode, 403)
    assert.equal(nextCalled, false)
    assert.match(responseBody.error, /Forbidden: You do not have permission to access project/i)
  })

  test('4. User A accessing own project is allowed', async () => {
    const req = {
      userId: USER_A,
      query: { projectId: TEST_PROJECT_A }
    }
    let statusCode = null
    const res = {
      status(code) {
        statusCode = code
        return this
      },
      json(data) {
        return this
      }
    }
    let nextCalled = false
    await verifyProjectAccess(req, res, () => { nextCalled = true })

    assert.equal(statusCode, null)
    assert.equal(nextCalled, true)
  })

  test('5. Sample repository allows access without auth token in local dev mode', async () => {
    const req = {
      headers: {},
      query: { projectId: 'sample-repo' }
    }
    let statusCode = null
    const res = {
      status(code) {
        statusCode = code
        return this
      },
      json(data) {
        return this
      }
    }
    let nextCalled = false
    await verifyAuth(req, res, () => { nextCalled = true })

    assert.equal(statusCode, null)
    assert.equal(nextCalled, true)
    assert.equal(req.userId, 'public')

    // Also test verifyProjectAccess for sample-repo
    let accessNextCalled = false
    await verifyProjectAccess(req, res, () => { accessNextCalled = true })
    assert.equal(accessNextCalled, true)
  })
})
