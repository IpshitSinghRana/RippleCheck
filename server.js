// -----------------------------------------------------------------------------
// server.js — RippleCheck Express API Server
//
// Usage:
//   node server.js
// -----------------------------------------------------------------------------

"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const fs = require("fs");
const os = require("os");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const multer = require("multer");
const aiProvider = require("./providers/aiProvider");
const { generateCypher } = require("./services/nlToCypher");
const { executeCypher } = require("./services/graphAdapter");
const { verifyAuth, verifyProjectAccess } = require("./middleware/verifyAuth");
const { safelyExtractZip, findSourceDirectory, LIMITS } = require("./services/zipExtractor");
const { scanRepository } = require("./scripts/scan");
const { loadGraph } = require("./scripts/load-graph");
const { summarize } = require("./scripts/summarize");
const {
    generateSecureProjectId,
    initProjectSchema,
    createProject,
    listUserProjects,
    getProjectById,
    deleteProject
} = require("./services/projectStore");

// Initialize Neo4j project constraints and sample-repo record
initProjectSchema().catch((err) => {
    console.warn("⚠️ Project schema initialization warning:", err.message);
});

// Configure Multer for disk-backed temporary storage (with 100 MB limit)
const uploadDir = path.join(os.tmpdir(), "ripplecheck-uploads", "multipart-temp");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
    dest: uploadDir,
    limits: {
        fileSize: LIMITS.MAX_COMPRESSED_BYTES,
        files: 1
    }
});

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// -----------------------------------------------------------------------------
// CORS Configuration & Origin Validation Guard
// -----------------------------------------------------------------------------

// Confirmed default production origin
const DEFAULT_ALLOWED_ORIGINS = [
    "https://ripplecheck-pink.vercel.app"
];

/**
 * Normalizes an origin URL string:
 * - Trims whitespace
 * - Strips leading/trailing single/double quotes
 * - Strips trailing slashes
 * - Converts to lower-case
 *
 * @param {string} raw - Raw origin string
 * @returns {string} Normalized origin
 */
function normalizeOrigin(raw) {
    if (!raw || typeof raw !== "string") return "";
    return raw
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\/+$/, "")
        .toLowerCase();
}

/**
 * Parses and normalizes comma-separated origins from environment.
 * Always includes DEFAULT_ALLOWED_ORIGINS.
 *
 * @param {string} [rawEnvOrigins] - Raw comma-separated string from process.env.ALLOWED_ORIGINS
 * @returns {string[]} Array of unique, normalized allowed origins
 */
function parseAllowedOrigins(rawEnvOrigins = process.env.ALLOWED_ORIGINS) {
    const custom = (rawEnvOrigins || "")
        .split(",")
        .map(normalizeOrigin)
        .filter(Boolean);
    const defaults = DEFAULT_ALLOWED_ORIGINS.map(normalizeOrigin);
    return Array.from(new Set([...defaults, ...custom]));
}

/**
 * Evaluates whether an incoming Origin is authorized.
 *
 * @param {string} [origin] - Incoming Origin header
 * @param {string[]} [allowedList] - List of configured origins
 * @returns {boolean} True if permitted, false otherwise
 */
function isOriginAllowed(origin, allowedList = parseAllowedOrigins()) {
    if (!origin) return true; // Direct server-to-server, curl, or loopback without Origin header
    const cleanOrigin = normalizeOrigin(origin);
    // Localhost and loopback IPv4/IPv6 with optional ports
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(cleanOrigin)) {
        return true;
    }
    return allowedList.includes(cleanOrigin);
}

// 1. Preflight & Direct CORS Guard Middleware
// Explicitly validates Origin and blocks untrusted requests with HTTP 403 Forbidden
// before executing any application logic or route handlers.
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !isOriginAllowed(origin)) {
        console.warn(`[CORS Guard] Blocked unauthorized request from origin: ${origin}`);
        return res.status(403).json({
            error: "Forbidden: Origin not allowed by CORS policy."
        });
    }
    next();
});

// 2. Standard CORS headers configuration for authorized origins
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || isOriginAllowed(origin)) {
            return callback(null, origin || true);
        }
        return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400
}));

// Export helper functions for automated testing
app._corsHelpers = {
    normalizeOrigin,
    parseAllowedOrigins,
    isOriginAllowed,
    DEFAULT_ALLOWED_ORIGINS
};

// Middleware: parse incoming JSON request bodies
app.use(express.json());

// Health check endpoint (reports service and database connectivity)
app.get("/api/health", async (req, res) => {
    try {
        const isDesktop = process.env.RIPPLECHECK_EDITION === "desktop";
        if (isDesktop) {
            return res.json({
                status: "ok",
                edition: "desktop",
                database: "ladybugdb"
            });
        }

        const { verifyNeo4jConnection } = require("./services/cypherExecutor");
        const dbStatus = await verifyNeo4jConnection();

        if (!dbStatus.ok) {
            return res.status(503).json({
                status: "degraded",
                edition: "web",
                database: {
                    status: "disconnected",
                    error: dbStatus.error
                }
            });
        }

        return res.json({
            status: "ok",
            edition: "web",
            database: {
                status: "connected",
                target: dbStatus.database,
                server: dbStatus.serverInfo ? dbStatus.serverInfo.agent : "Neo4j"
            }
        });
    } catch (err) {
        return res.status(500).json({
            status: "error",
            error: err.message
        });
    }
});

// AI Provider settings and diagnostic status endpoint
app.get("/api/ai/provider", async (req, res) => {
    try {
        const info = aiProvider.getProviderInfo();
        const health = await aiProvider.checkHealth();
        res.json({
            ...info,
            status: health.ok ? "connected" : "error",
            statusMessage: health.message
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Set active AI provider (offline Ollama vs. online Gemini)
app.post("/api/ai/provider", async (req, res) => {
    const { provider } = req.body || {};
    if (!provider || typeof provider !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'provider' parameter." });
    }
    try {
        aiProvider.setRuntimeProvider(provider);
        const info = aiProvider.getProviderInfo();
        const health = await aiProvider.checkHealth();
        res.json({
            ...info,
            status: health.ok ? "connected" : "error",
            statusMessage: health.message
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Authenticated POST /api/projects/upload endpoint
app.post("/api/projects/upload", verifyAuth, (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({
                    error: "Upload rejected: File size exceeds the 100 MB limit."
                });
            }
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ error: `Upload failed: ${err.message}` });
        }
        next();
    });
}, async (req, res) => {
    let extraction = null;
    const uploadedFilePath = req.file ? req.file.path : null;

    try {
        // Enforce user authentication: userId derived exclusively from token
        const userId = req.userId;
        if (!userId || userId === "public") {
            return res.status(401).json({
                error: "Unauthorized: Uploading repositories requires an authenticated user account."
            });
        }

        if (!req.file || !req.file.path) {
            return res.status(400).json({
                error: "No file uploaded. Please upload a .zip archive."
            });
        }

        // Validate MIME type and file extension
        const originalName = req.file.originalname || "repository.zip";
        const isZipName = originalName.toLowerCase().endsWith(".zip");
        if (!isZipName) {
            return res.status(400).json({
                error: "Invalid file format: Only .zip files are accepted."
            });
        }

        // Generate a 128-bit cryptographically secure, unique projectId on the backend
        const rawName = path.basename(originalName, path.extname(originalName)) || "project";
        const projectId = generateSecureProjectId(rawName);
        const projectName = rawName;

        // 1. Safe extraction (handles zip bombs, directory traversal, null bytes, absolute paths)
        extraction = safelyExtractZip(uploadedFilePath);

        // 2. Discover source code root
        const sourceDir = findSourceDirectory(extraction.extractDir);

        // 3. Scan dependencies using Madge (code is parsed via AST, NEVER executed)
        const madgeGraph = await scanRepository(sourceDir, null);
        const scannedFileCount = Object.keys(madgeGraph).length;

        if (scannedFileCount === 0) {
            return res.status(400).json({
                error: "No JavaScript dependencies or modules could be parsed from the provided archive."
            });
        }

        // 4. Load into Neo4j scoped by projectId and userId
        const loadResult = await loadGraph({
            madgeData: madgeGraph,
            projectId,
            userId
        });

        // 5. Generate AI summaries for the uploaded files
        try {
            await summarize(sourceDir, projectId);
        } catch (summaryErr) {
            console.warn(`[Project ${projectId}] AI summarization encountered an issue: ${summaryErr.message}`);
        }

        // 6. Save persistent project metadata to Neo4j associated with authenticated userId
        const savedProject = await createProject({
            projectId,
            userId,
            projectName,
            originalZipName: originalName,
            fileCount: loadResult.totalFiles,
            dependencyCount: loadResult.totalRelationships,
            manifest: extraction.manifestFiles || [],
            analysisStatus: "completed"
        });

        return res.json({
            success: true,
            project: {
                id: savedProject.projectId,
                projectId: savedProject.projectId,
                name: savedProject.projectName,
                projectName: savedProject.projectName,
                originalZipName: savedProject.originalZipName,
                fileCount: savedProject.fileCount,
                dependencyCount: savedProject.dependencyCount,
                createdAt: savedProject.createdAt,
                lastScannedAt: savedProject.lastScannedAt,
                analysisStatus: savedProject.analysisStatus
            }
        });
    } catch (err) {
        console.error("Repository analysis error:", err.message);
        return res.status(400).json({
            error: err.message || "Failed to process and analyze repository archive."
        });
    } finally {
        // Safe retention cleanup: delete temporary extraction files
        if (extraction && typeof extraction.cleanup === "function") {
            extraction.cleanup();
        }
        // Safe retention cleanup: delete uploaded multipart temp file from disk
        if (uploadedFilePath) {
            try {
                if (fs.existsSync(uploadedFilePath)) {
                    fs.unlinkSync(uploadedFilePath);
                }
            } catch (unlinkErr) {
                console.warn(`Failed to unlink temp upload file ${uploadedFilePath}:`, unlinkErr.message);
            }
        }
    }
});

// GET /api/projects — List current user's projects + sample repository
app.get("/api/projects", verifyAuth, async (req, res) => {
    try {
        const userId = req.userId || "public";
        const projects = await listUserProjects(userId);
        return res.json({
            projects: projects.map((p) => ({
                id: p.projectId,
                projectId: p.projectId,
                name: p.projectName,
                projectName: p.projectName,
                originalZipName: p.originalZipName,
                fileCount: p.fileCount,
                dependencyCount: p.dependencyCount,
                createdAt: p.createdAt,
                lastScannedAt: p.lastScannedAt,
                analysisStatus: p.analysisStatus,
                isDefault: p.projectId === "sample-repo"
            }))
        });
    } catch (err) {
        return res.status(500).json({
            error: err.message || "Failed to retrieve user projects."
        });
    }
});

// GET /api/projects/:projectId — Retrieve details for a project
app.get("/api/projects/:projectId", verifyAuth, async (req, res) => {
    try {
        const projectId = req.params.projectId;
        const userId = req.userId;

        const project = await getProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: `Project '${projectId}' not found.` });
        }

        // Server-side ownership verification
        if (project.projectId !== "sample-repo" && project.userId !== userId) {
            return res.status(403).json({ error: "Forbidden: You do not have permission to view this project." });
        }

        return res.json({
            project: {
                id: project.projectId,
                projectId: project.projectId,
                name: project.projectName,
                projectName: project.projectName,
                originalZipName: project.originalZipName,
                fileCount: project.fileCount,
                dependencyCount: project.dependencyCount,
                createdAt: project.createdAt,
                lastScannedAt: project.lastScannedAt,
                analysisStatus: project.analysisStatus,
                isDefault: project.projectId === "sample-repo"
            }
        });
    } catch (err) {
        return res.status(500).json({
            error: err.message || "Failed to retrieve project details."
        });
    }
});

// DELETE /api/projects/:projectId — Delete owned project and its graph data
app.delete("/api/projects/:projectId", verifyAuth, async (req, res) => {
    try {
        const projectId = req.params.projectId;
        const userId = req.userId;

        if (!userId || userId === "public") {
            return res.status(401).json({ error: "Unauthorized: Deleting projects requires authentication." });
        }

        if (projectId === "sample-repo") {
            return res.status(400).json({ error: "The default sample repository cannot be deleted." });
        }

        const project = await getProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: `Project '${projectId}' not found.` });
        }

        if (project.userId !== userId) {
            return res.status(403).json({ error: "Forbidden: You do not have permission to delete this project." });
        }

        const result = await deleteProject(projectId, userId);

        return res.json({
            success: true,
            message: `Project '${projectId}' and its graph data have been permanently deleted.`,
            stats: result
        });
    } catch (err) {
        return res.status(500).json({
            error: err.message || "Failed to delete project."
        });
    }
});

// Full graph visualization data endpoint (protected with verifyAuth + verifyProjectAccess)
app.get("/api/graph", verifyAuth, verifyProjectAccess, async (req, res) => {
    try {
        const projectId = req.query.projectId ? String(req.query.projectId).trim() : "sample-repo";

        const nodesQuery = "MATCH (f:File {projectId: $projectId}) RETURN f.path AS path, f.name AS name, f.summary AS summary, f.projectId AS projectId";
        const edgesQuery = "MATCH (a:File {projectId: $projectId})-[:IMPORTS]->(b:File {projectId: $projectId}) RETURN a.path AS source, b.path AS target";

        const [nodes, edges, projectRecord] = await Promise.all([
            executeCypher(nodesQuery, { projectId }),
            executeCypher(edgesQuery, { projectId }),
            getProjectById(projectId)
        ]);

        let manifest = [];
        if (projectRecord && projectRecord.manifest) {
            try {
                manifest = typeof projectRecord.manifest === "string" ? JSON.parse(projectRecord.manifest) : projectRecord.manifest;
            } catch (_) {}
        }

        return res.json({
            projectId,
            nodes,
            edges,
            manifest
        });
    } catch (err) {
        return res.status(500).json({
            error: err.message || "Failed to retrieve graph data."
        });
    }
});

// ---------------------------------------------------------------------------
// Helper: extract an ordered array of file paths from a Neo4j Path object.
// A path  affected → intermediate → … → target  becomes
// ["affected.path", "intermediate.path", …, "target.path"].
// ---------------------------------------------------------------------------
function extractDependencyPath(pathObj) {
    if (!pathObj) return [];
    if (Array.isArray(pathObj)) return pathObj;
    if (pathObj.start && Array.isArray(pathObj.segments)) {
        const result = [pathObj.start.properties?.path || pathObj.start.properties?.name || "unknown"];
        for (const seg of pathObj.segments) {
            result.push(seg.end?.properties?.path || seg.end?.properties?.name || "unknown");
        }
        return result;
    }
    return [];
}

// Transitive blast radius / impact analysis endpoint for a specific file (protected)
app.get("/api/impact/:fileName", verifyAuth, verifyProjectAccess, async (req, res) => {
    const { fileName } = req.params;
    const projectId = req.query.projectId ? String(req.query.projectId).trim() : "sample-repo";

    if (!fileName || fileName.trim().length === 0) {
        return res.status(400).json({
            error: "Invalid request: 'fileName' parameter must be provided."
        });
    }

    const targetFileName = fileName.trim();

    try {
        // 1. Verify that the requested file exists in the specific project
        const fileCheckQuery = "MATCH (target:File {projectId: $projectId, name: $fileName}) RETURN target.path AS path, target.name AS name, target.summary AS summary, target.projectId AS projectId LIMIT 1";
        const fileRecords = await executeCypher(fileCheckQuery, { projectId, fileName: targetFileName });

        if (fileRecords.length === 0) {
            return res.status(404).json({
                error: `File '${targetFileName}' not found in project '${projectId}'.`
            });
        }

        const changedFile = fileRecords[0];

        // 2. Find all transitive dependents with full dependency paths strictly within the project
        const impactQuery = "MATCH p = (affected:File {projectId: $projectId})-[:IMPORTS*1..]->(target:File {projectId: $projectId, name: $fileName}) RETURN affected.path AS path, affected.name AS name, affected.summary AS summary, length(p) AS hops, p ORDER BY hops ASC, affected.name ASC";
        const rawRecords = await executeCypher(impactQuery, { projectId, fileName: targetFileName });

        // 3. Deduplicate: keep only the shortest path per affected file
        const seen = new Map();
        for (const record of rawRecords) {
            const key = record.path;
            if (!seen.has(key)) {
                const extracted = extractDependencyPath(record.p);
                const dependencyPath = extracted.length > 0 ? extracted : [record.path, changedFile.path];
                const hops = Number(record.hops) || (dependencyPath.length > 1 ? dependencyPath.length - 1 : 1);
                const impactType = hops === 1 ? "direct" : "indirect";

                seen.set(key, {
                    path: record.path,
                    name: record.name,
                    summary: record.summary,
                    impactType,
                    dependencyPath,
                    hops,
                    unresolvedImport: impactType === "direct" ? changedFile.name : null,
                    consequence: impactType === "direct"
                        ? `Direct broken import: Module '${changedFile.name}' will fail to resolve (MODULE_NOT_FOUND). Compilation or module loading fails immediately.`
                        : `Cascade failure: Runtime calls through intermediate dependencies (${dependencyPath.slice(1, -1).join(" → ")}) will fail when accessing functionality previously provided by '${changedFile.name}'.`
                });
            }
        }

        const affectedFiles = Array.from(seen.values());

        return res.json({
            file: changedFile,
            affectedFiles
        });
    } catch (err) {
        return res.status(500).json({
            error: err.message || "Failed to analyze impact for file."
        });
    }
});

// ---------------------------------------------------------------------------
// Intent detection for natural language queries
// Supports:
// 1. delete_simulation: "What happens if I delete auth.js?", "Simulate deleting utils.js"
// 2. modify_impact: "What files could break if I modify database.js?", "Blast radius of changing utils.js"
// 3. rename: "What imports need updating if I rename auth.js?", "If I rename utils.js"
// 4. file_explanation: "What does utils.js do?", "What is the purpose of index.js?"
// 5. fallback: normal dependency queries routed to NL-to-Cypher.
// ---------------------------------------------------------------------------

/**
 * Extracts a referenced JS filename (e.g., "auth.js") from question text.
 *
 * @param {string} question
 * @returns {string|null}
 */
function extractFilename(question) {
    const fileMatch = question.match(/\b([a-zA-Z0-9_\-]+\.js)\b/i);
    return fileMatch ? fileMatch[1] : null;
}

/**
 * Analyzes the user question and detects intent.
 *
 * @param {string} question
 * @returns {{ intent: string, targetFile: string|null }}
 */
function detectQueryIntent(question) {
    const q = question.toLowerCase();
    const targetFile = extractFilename(question);

    // 1. Delete Simulation
    const deletePatterns = [
        /\b(delete|deleting|remove|removing|drop|dropping)\b.*\b([a-zA-Z0-9_\-]+\.js)\b/i,
        /\b([a-zA-Z0-9_\-]+\.js)\b.*\b(is deleted|is removed|were deleted|were removed|was deleted|was removed|get deleted|gets deleted)\b/i,
        /\b(simulate|simulation)\b.*\b(delete|deletion|removal)\b/i,
        /\b(what happens|what breaks|what will break|consequences)\b.*\b(if i|if we)?\s*(delete|remove)\b/i
    ];
    if (targetFile && deletePatterns.some((p) => p.test(q))) {
        return { intent: "delete_simulation", targetFile };
    }

    // 2. Rename Intent
    const renamePatterns = [
        /\b(rename|renaming)\b.*\b([a-zA-Z0-9_\-]+\.js)\b/i,
        /\b([a-zA-Z0-9_\-]+\.js)\b.*\b(is renamed|were renamed|was renamed|gets renamed)\b/i,
        /\bwhat (imports|files|paths) need (updating|to update|changed)\b.*\b(rename|renaming)\b/i,
        /\b(if i|if we)\s*(rename|move)\b.*\b([a-zA-Z0-9_\-]+\.js)\b/i
    ];
    if (targetFile && renamePatterns.some((p) => p.test(q))) {
        return { intent: "rename", targetFile };
    }

    // 3. Modify Impact / Blast Radius
    const modifyPatterns = [
        /\b(modify|modifying|change|changing|edit|editing|update|updating|refactor|refactoring)\b.*\b([a-zA-Z0-9_\-]+\.js)\b/i,
        /\b([a-zA-Z0-9_\-]+\.js)\b.*\b(is modified|is changed|were modified|were changed|changes|is updated)\b/i,
        /\b(blast radius|impact of|affected by modifying|break if i modify|break if we modify|files could break if)\b/i
    ];
    if (targetFile && modifyPatterns.some((p) => p.test(q))) {
        return { intent: "modify_impact", targetFile };
    }

    // 4. File Explanation
    const explanationPatterns = [
        /what (does|will|is|can)\s+([a-zA-Z0-9_\-]+\.js)\b/i,
        /\b(explain|describe|tell me about)\s+([a-zA-Z0-9_\-]+\.js)\b/i,
        /purpose of\s+([a-zA-Z0-9_\-]+\.js)\b/i,
        /what('s| is) the (purpose|role|function|responsibility) of\s+([a-zA-Z0-9_\-]+\.js)\b/i,
        /how does\s+([a-zA-Z0-9_\-]+\.js)\s+work/i
    ];
    if (targetFile && explanationPatterns.some((p) => p.test(q))) {
        return { intent: "file_explanation", targetFile };
    }

    return { intent: "dependency_query", targetFile: null };
}

// Helper to format raw Neo4j records into clean, serializable objects for NL query results
function formatQueryResult(records) {
    if (!Array.isArray(records)) return [];
    return records.map((record) => {
        if (!record || typeof record !== "object") return record;
        const normalized = {};
        for (const [key, val] of Object.entries(record)) {
            if (val && typeof val === "object" && val.properties && typeof val.properties === "object") {
                // If it's a Neo4j Node object, flatten properties
                normalized[key] = val.properties;
                if (!("path" in normalized) && val.properties.path) normalized.path = val.properties.path;
                if (!("name" in normalized) && val.properties.name) normalized.name = val.properties.name;
                if (!("summary" in normalized) && val.properties.summary) normalized.summary = val.properties.summary;
            } else if (val && typeof val === "object" && "low" in val && "high" in val) {
                normalized[key] = val.low;
            } else {
                normalized[key] = val;
            }
        }
        return normalized;
    });
}

// Natural language query endpoint (protected)
app.post("/api/query", verifyAuth, verifyProjectAccess, async (req, res) => {
    const { question, projectId: bodyProjectId } = req.body || {};
    const projectId = bodyProjectId ? String(bodyProjectId).trim() : "sample-repo";

    if (typeof question !== "string" || question.trim().length === 0) {
        return res.status(400).json({
            error: "Invalid request: 'question' must be a non-empty string."
        });
    }

    const trimmedQuestion = question.trim();

    try {
        const { intent, targetFile } = detectQueryIntent(trimmedQuestion);

        // If a specific target file is referenced, check if it exists in the active project
        let targetNode = null;
        if (targetFile && intent !== "dependency_query") {
            const checkRecords = await executeCypher(
                "MATCH (f:File {projectId: $projectId, name: $name}) RETURN f.name AS name, f.path AS path, f.summary AS summary, f.projectId AS projectId LIMIT 1",
                { projectId, name: targetFile }
            );
            if (checkRecords.length > 0) {
                targetNode = checkRecords[0];
            } else if (intent === "file_explanation") {
                return res.status(404).json({
                    error: `File '${targetFile}' not found in project '${projectId}'.`,
                    targetFile,
                    intent,
                    projectId
                });
            }
        }

        // 1. DELETE SIMULATION INTENT (with existing targetNode)
        if (intent === "delete_simulation" && targetNode) {
            const impactQuery = "MATCH p = (affected:File {projectId: $projectId})-[:IMPORTS*1..]->(target:File {projectId: $projectId, name: $fileName}) RETURN affected.path AS path, affected.name AS name, affected.summary AS summary, length(p) AS hops, p ORDER BY hops ASC, affected.name ASC";
            const rawRecords = await executeCypher(impactQuery, { projectId, fileName: targetNode.name });

            const seen = new Map();
            for (const record of rawRecords) {
                if (!seen.has(record.path)) {
                    const extracted = extractDependencyPath(record.p);
                    const dependencyPath = extracted.length > 0 ? extracted : [record.path, targetNode.path];
                    const hops = Number(record.hops) || (dependencyPath.length > 1 ? dependencyPath.length - 1 : 1);
                    seen.set(record.path, {
                        path: record.path,
                        name: record.name,
                        summary: record.summary,
                        impactType: hops === 1 ? "direct" : "indirect",
                        dependencyPath,
                        hops,
                        unresolvedImport: hops === 1 ? targetNode.name : null,
                        consequence: hops === 1
                            ? `Direct broken import: Module '${targetNode.name}' will fail to resolve (MODULE_NOT_FOUND). Compilation or module loading fails immediately.`
                            : `Cascade failure: Runtime calls through intermediate dependencies (${dependencyPath.slice(1, -1).join(" → ")}) will fail when accessing functionality previously provided by '${targetNode.name}'.`
                    });
                }
            }
            const affectedFiles = Array.from(seen.values());
            const direct = affectedFiles.filter((f) => f.hops === 1);
            const transitive = affectedFiles.filter((f) => f.hops >= 2);

            let message = "";
            if (affectedFiles.length === 0) {
                message = `Deleting ${targetNode.name} has no downstream impact. It is not imported by any other files.`;
            } else {
                message = `Deleting ${targetNode.name} would break ${direct.length} direct importer${direct.length === 1 ? "" : "s"} (${direct.map((d) => d.name).join(", ")}) with unresolved import errors, and cause cascade failures in ${transitive.length} transitive dependent${transitive.length === 1 ? "" : "s"}${transitive.length > 0 ? ` (${transitive.map((t) => t.name).join(", ")})` : ""}.`;
            }

            return res.json({
                question: trimmedQuestion,
                intent: "delete_simulation",
                targetFile: targetNode.name,
                file: targetNode,
                cypher: `MATCH p = (affected:File {projectId: '${projectId}'})-[:IMPORTS*1..]->(target:File {projectId: '${projectId}', name: '${targetNode.name}'}) RETURN affected.path AS path, affected.name AS name, affected.summary AS summary, length(p) AS hops ORDER BY hops ASC, affected.name ASC`,
                message,
                affectedFiles,
                results: affectedFiles
            });
        }

        // 2. MODIFY IMPACT INTENT (with existing targetNode)
        if (intent === "modify_impact" && targetNode) {
            const impactQuery = "MATCH p = (affected:File {projectId: $projectId})-[:IMPORTS*1..]->(target:File {projectId: $projectId, name: $fileName}) RETURN affected.path AS path, affected.name AS name, affected.summary AS summary, length(p) AS hops, p ORDER BY hops ASC, affected.name ASC";
            const rawRecords = await executeCypher(impactQuery, { projectId, fileName: targetNode.name });

            const seen = new Map();
            for (const record of rawRecords) {
                if (!seen.has(record.path)) {
                    const extracted = extractDependencyPath(record.p);
                    const dependencyPath = extracted.length > 0 ? extracted : [record.path, targetNode.path];
                    const hops = Number(record.hops) || (dependencyPath.length > 1 ? dependencyPath.length - 1 : 1);
                    seen.set(record.path, {
                        path: record.path,
                        name: record.name,
                        summary: record.summary,
                        impactType: hops === 1 ? "direct" : "indirect",
                        dependencyPath,
                        hops
                    });
                }
            }
            const affectedFiles = Array.from(seen.values());
            const direct = affectedFiles.filter((f) => f.hops === 1);
            const transitive = affectedFiles.filter((f) => f.hops >= 2);

            let message = "";
            if (affectedFiles.length === 0) {
                message = `Modifying ${targetNode.name} has a blast radius of 0 files. No downstream files import it.`;
            } else {
                message = `Modifying ${targetNode.name} has a total blast radius of ${affectedFiles.length} file${affectedFiles.length === 1 ? "" : "s"}: ${direct.length} direct consumer${direct.length === 1 ? "" : "s"} (${direct.map((d) => d.name).join(", ")}) and ${transitive.length} transitive dependent${transitive.length === 1 ? "" : "s"}${transitive.length > 0 ? ` (${transitive.map((t) => t.name).join(", ")})` : ""}.`;
            }

            return res.json({
                question: trimmedQuestion,
                intent: "modify_impact",
                targetFile: targetNode.name,
                file: targetNode,
                cypher: `MATCH p = (affected:File {projectId: '${projectId}'})-[:IMPORTS*1..]->(target:File {projectId: '${projectId}', name: '${targetNode.name}'}) RETURN affected.path AS path, affected.name AS name, affected.summary AS summary, length(p) AS hops ORDER BY hops ASC, affected.name ASC`,
                message,
                affectedFiles,
                results: affectedFiles
            });
        }

        // 3. RENAME INTENT (with existing targetNode)
        if (intent === "rename" && targetNode) {
            const directImportersQuery = "MATCH (importer:File {projectId: $projectId})-[:IMPORTS]->(target:File {projectId: $projectId, name: $fileName}) RETURN importer.name AS name, importer.path AS path, importer.summary AS summary ORDER BY importer.name ASC";
            const directImporters = await executeCypher(directImportersQuery, { projectId, fileName: targetNode.name });

            let message = "";
            if (directImporters.length === 0) {
                message = `No files import ${targetNode.name}. You can safely rename this file without updating any import statements.`;
            } else {
                const names = directImporters.map((i) => i.name).join(", ");
                message = `Renaming ${targetNode.name} requires updating import statements in ${directImporters.length} direct importer${directImporters.length === 1 ? "" : "s"}: ${names}. Transitive dependents do not need import path changes as long as the direct importers are updated.`;
            }

            return res.json({
                question: trimmedQuestion,
                intent: "rename",
                targetFile: targetNode.name,
                file: targetNode,
                cypher: `MATCH (importer:File {projectId: '${projectId}'})-[:IMPORTS]->(target:File {projectId: '${projectId}', name: '${targetNode.name}'}) RETURN importer.name AS name, importer.path AS path, importer.summary AS summary ORDER BY importer.name ASC`,
                message,
                directImporters,
                results: directImporters
            });
        }

        // 4. FILE EXPLANATION INTENT
        if (intent === "file_explanation" && targetNode && targetNode.summary) {
            return res.json({
                question: trimmedQuestion,
                intent: "file_explanation",
                targetFile: targetNode.name,
                file: targetNode,
                explanation: targetNode.summary,
                message: `${targetNode.name}: ${targetNode.summary}`,
                results: [targetNode]
            });
        }

        // 5. STANDARD DEPENDENCY QUERY (NL-to-Cypher)
        // Scoped strictly to the active authenticated projectId
        const cypher = await generateCypher(trimmedQuestion, projectId);
        const rawResults = await executeCypher(cypher);
        const results = formatQueryResult(rawResults);

        return res.json({
            question: trimmedQuestion,
            intent: "dependency_query",
            cypher,
            results
        });
    } catch (err) {
        // If cypherValidator rejected the query, return a 400 Bad Request
        const message = err.message || "An error occurred while processing the query.";
        const isValidationError =
            message.includes("not permitted") ||
            message.includes("Disallowed") ||
            message.includes("must explicitly specify") ||
            message.includes("must start with") ||
            message.includes("Unclosed") ||
            message.includes("Malformed") ||
            message.includes("Query must");

        const statusCode = isValidationError ? 400 : 500;

        return res.status(statusCode).json({
            error: message
        });
    }
});

// Start listening only when executed directly (allows importing in tests)
if (require.main === module) {
    app.listen(PORT, HOST, () => {
        console.log(`🚀 RippleCheck server running on http://localhost:${PORT} (${HOST})`);
    });
}

module.exports = app;

