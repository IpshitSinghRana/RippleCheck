// -----------------------------------------------------------------------------
// tests/testProjectStore.test.js — Multi-User Persistent Project Management Tests
// -----------------------------------------------------------------------------

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const {
    generateSecureProjectId,
    initProjectSchema,
    createProject,
    listUserProjects,
    getProjectById,
    deleteProject
} = require("../services/projectStore");

test.describe("Phase 4: Persistent Multi-User Project Management", () => {
    const USER_ALICE = "firebase_alice_uid";
    const USER_BOB = "firebase_bob_uid";

    let aliceProjId;
    let bobProjId;

    test.before(async () => {
        await initProjectSchema();
    });

    test.after(async () => {
        // Cleanup test projects if still present
        try {
            if (aliceProjId) await deleteProject(aliceProjId, USER_ALICE);
        } catch (_) {}
        try {
            if (bobProjId) await deleteProject(bobProjId, USER_BOB);
        } catch (_) {}
    });

    test("1. Generates 128-bit cryptographically secure and unique project IDs", () => {
        const id1 = generateSecureProjectId("ecommerce");
        const id2 = generateSecureProjectId("ecommerce");

        assert.ok(id1.startsWith("proj_ecommerce_"));
        assert.ok(id2.startsWith("proj_ecommerce_"));
        assert.notEqual(id1, id2);

        // Check 128-bit randomness (32 hex characters suffix)
        const hexSuffix1 = id1.split("_").pop();
        const hexSuffix2 = id2.split("_").pop();
        assert.equal(hexSuffix1.length, 32);
        assert.equal(hexSuffix2.length, 32);
    });

    test("2. Creates persistent project metadata for Alice and Bob", async () => {
        aliceProjId = generateSecureProjectId("alice-repo");
        bobProjId = generateSecureProjectId("bob-repo");

        const aliceProj = await createProject({
            projectId: aliceProjId,
            userId: USER_ALICE,
            projectName: "alice-repo",
            originalZipName: "alice.zip",
            fileCount: 12,
            dependencyCount: 8,
            analysisStatus: "completed"
        });

        const bobProj = await createProject({
            projectId: bobProjId,
            userId: USER_BOB,
            projectName: "bob-repo",
            originalZipName: "bob.zip",
            fileCount: 20,
            dependencyCount: 15,
            analysisStatus: "completed"
        });

        assert.equal(aliceProj.projectId, aliceProjId);
        assert.equal(aliceProj.userId, USER_ALICE);
        assert.equal(bobProj.projectId, bobProjId);
        assert.equal(bobProj.userId, USER_BOB);
    });

    test("3. Alice sees only her own projects and sample-repo (never Bob's)", async () => {
        const aliceProjects = await listUserProjects(USER_ALICE);
        const aliceProjectIds = aliceProjects.map((p) => p.projectId);

        assert.ok(aliceProjectIds.includes(aliceProjId), "Alice should see her own project");
        assert.ok(aliceProjectIds.includes("sample-repo"), "Alice should see sample-repo");
        assert.ok(!aliceProjectIds.includes(bobProjId), "Alice MUST NOT see Bob's project");
    });

    test("4. Bob sees only his own projects and sample-repo (never Alice's)", async () => {
        const bobProjects = await listUserProjects(USER_BOB);
        const bobProjectIds = bobProjects.map((p) => p.projectId);

        assert.ok(bobProjectIds.includes(bobProjId), "Bob should see his own project");
        assert.ok(bobProjectIds.includes("sample-repo"), "Bob should see sample-repo");
        assert.ok(!bobProjectIds.includes(aliceProjId), "Bob MUST NOT see Alice's project");
    });

    test("5. Project metadata survives and is retrievable by ID", async () => {
        const project = await getProjectById(aliceProjId);
        assert.ok(project);
        assert.equal(project.projectId, aliceProjId);
        assert.equal(project.userId, USER_ALICE);
        assert.equal(project.fileCount, 12);
        assert.equal(project.dependencyCount, 8);
        assert.equal(project.analysisStatus, "completed");
    });

    test("6. User cannot delete another user's project (Forbidden)", async () => {
        await assert.rejects(
            async () => {
                // Alice tries to delete Bob's project
                await deleteProject(bobProjId, USER_ALICE);
            },
            /Forbidden: You do not have permission to delete this project/i
        );

        // Verify Bob's project is still intact
        const bobCheck = await getProjectById(bobProjId);
        assert.ok(bobCheck);
    });

    test("7. Sample repository cannot be deleted", async () => {
        await assert.rejects(
            async () => {
                await deleteProject("sample-repo", USER_ALICE);
            },
            /The default sample repository cannot be deleted/i
        );

        const sampleCheck = await getProjectById("sample-repo");
        assert.ok(sampleCheck);
    });

    test("8. Owner can delete own project, removing metadata and graph nodes", async () => {
        const result = await deleteProject(aliceProjId, USER_ALICE);
        assert.equal(result.deletedProject, true);

        const checkDeleted = await getProjectById(aliceProjId);
        assert.equal(checkDeleted, null);

        // Reset variable so after hook doesn't re-delete
        aliceProjId = null;
    });
});

