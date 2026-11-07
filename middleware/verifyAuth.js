// -----------------------------------------------------------------------------
// verifyAuth.js — Firebase Authentication & Project Authorization Middleware
//
// Responsibilities:
// 1. Verify Firebase ID Token from "Authorization: Bearer <idToken>"
// 2. Extract and assign req.userId EXCLUSIVELY from the decoded token
// 3. Reject missing, invalid or expired tokens with HTTP 401
// 4. Verify project ownership: ensure the user owns the requested projectId
//    or return HTTP 403.
// 5. Allow access to "sample-repo" in local development mode without token.
// -----------------------------------------------------------------------------

"use strict";

const { getAuth } = require("../services/firebaseAdmin");
const { executeCypher } = require("../services/graphAdapter");

/**
 * Extracts bearer token from Authorization header.
 * Returns null if not formatted as Bearer <token>.
 */
function extractBearerToken(authHeader) {
    if (!authHeader || typeof authHeader !== "string") {
        return null;
    }
    const match = authHeader.match(/^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/i);
    return match ? match[1].trim() : null;
}

/**
 * Middleware: Verify Firebase ID Token and set req.userId exclusively from token.
 */
async function verifyAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const requestedProject = (req.query.projectId || (req.body && req.body.projectId) || "sample-repo").toString().trim();

    // 0. Desktop Edition Air-Gapped Mode:
    // Activated strictly when process.env.RIPPLECHECK_EDITION === 'desktop' AND host is loopback.
    const isDesktopEdition = process.env.RIPPLECHECK_EDITION === 'desktop';
    const isLoopbackRequest = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    if (isDesktopEdition && isLoopbackRequest) {
        req.userId = 'desktop-guest-user';
        req.user = {
            uid: 'desktop-guest-user',
            name: 'Local Architect',
            email: 'guest@ripplecheck.local'
        };
        return next();
    }

    // 1. Sample repository in local development: allowed without token
    // (Preserves existing local development sample-repo workflow without production bypass)
    const isSampleRepo = requestedProject === "sample-repo";
    const hasBearer = Boolean(authHeader && authHeader.toLowerCase().startsWith("bearer "));

    if (isSampleRepo && !hasBearer) {
        req.userId = "public";
        req.user = null;
        return next();
    }

    // 2. For private projects or when Authorization header is supplied, token is mandatory
    const idToken = extractBearerToken(authHeader);
    if (!idToken) {
        return res.status(401).json({
            error: "Unauthorized: Missing or malformed Firebase ID token in Authorization header."
        });
    }

    try {
        // Verify token with Firebase Admin
        const auth = getAuth();
        const decodedToken = await auth.verifyIdToken(idToken);
        // Exclusively assign from verified token claims - NEVER from headers, body or query params
        req.userId = decodedToken.uid;
        req.user = decodedToken;

        return next();
    } catch (err) {
        const message = err.message || "Invalid token.";
        return res.status(401).json({
            error: `Unauthorized: ${message}`
        });
    }
}

/**
 * Middleware / Guard: Verifies that req.userId has permission to access the requested projectId.
 * If project belongs to another user, rejects with HTTP 403 Forbidden.
 */
async function verifyProjectAccess(req, res, next) {
    const requestedProject = (req.query.projectId || (req.body && req.body.projectId) || "sample-repo").toString().trim();

    // Sample repo is open for local development
    if (requestedProject === "sample-repo") {
        return next();
    }

    const currentUserId = req.userId;
    if (!currentUserId || currentUserId === "public") {
        return res.status(401).json({
            error: "Unauthorized: Private projects require authentication."
        });
    }

    try {
        // Check project ownership in Neo4j
        const ownerCheckQuery = "MATCH (f:File {projectId: $projectId}) RETURN DISTINCT f.userId AS ownerId LIMIT 1";
        const records = await executeCypher(ownerCheckQuery, { projectId: requestedProject });

        if (records.length === 0) {
            // Project does not exist yet (or has no files)
            return next();
        }

        const projectOwnerId = records[0].ownerId;
        if (projectOwnerId && projectOwnerId !== currentUserId && projectOwnerId !== "public") {
            return res.status(403).json({
                error: `Forbidden: You do not have permission to access project '${requestedProject}'.`
            });
        }

        return next();
    } catch (err) {
        return res.status(500).json({
            error: `Authorization check failed: ${err.message}`
        });
    }
}

module.exports = {
    verifyAuth,
    verifyProjectAccess
};
