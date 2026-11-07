// -----------------------------------------------------------------------------
// firebaseAdmin.js — Firebase Admin SDK Initializer for RippleCheck Backend
//
// Initializes Firebase Admin (v13+ modular API) using one of:
// 1. Service account file path from FIREBASE_SERVICE_ACCOUNT_PATH
// 2. Direct JSON string or base64 string from FIREBASE_SERVICE_ACCOUNT_KEY
// 3. Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS / Google Cloud metadata)
// 4. Project ID fallback for token verification via Google public keys
// -----------------------------------------------------------------------------

"use strict";

const path = require("path");
const fs = require("fs");
const { initializeApp, getApps, cert, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

let appInstance = null;

function initFirebaseAdmin() {
    const existingApps = getApps();
    if (existingApps.length > 0) {
        appInstance = existingApps[0];
        return appInstance;
    }

    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "ripplecheck-4c3ca";

    try {
        if (serviceAccountPath) {
            const resolvedPath = path.resolve(process.cwd(), serviceAccountPath);
            if (fs.existsSync(resolvedPath)) {
                const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
                appInstance = initializeApp({
                    credential: cert(serviceAccount),
                    projectId: serviceAccount.project_id || projectId
                });
                console.log("🔐 Firebase Admin initialized using service account file.");
                return appInstance;
            }
        }

        if (serviceAccountKey) {
            let keyStr = serviceAccountKey.trim();
            if (keyStr.startsWith("{")) {
                const serviceAccount = JSON.parse(keyStr);
                appInstance = initializeApp({
                    credential: cert(serviceAccount),
                    projectId: serviceAccount.project_id || projectId
                });
                console.log("🔐 Firebase Admin initialized using inline service account key.");
                return appInstance;
            } else {
                // Try base64 decoding
                const decoded = Buffer.from(keyStr, "base64").toString("utf8");
                const serviceAccount = JSON.parse(decoded);
                appInstance = initializeApp({
                    credential: cert(serviceAccount),
                    projectId: serviceAccount.project_id || projectId
                });
                console.log("🔐 Firebase Admin initialized using base64 service account key.");
                return appInstance;
            }
        }

        // Try Application Default Credentials or Project ID fallback
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            appInstance = initializeApp({
                credential: applicationDefault(),
                projectId
            });
            console.log("🔐 Firebase Admin initialized using Application Default Credentials.");
            return appInstance;
        }

        // Fallback: initialize with projectId (can verify ID tokens signed for this project)
        appInstance = initializeApp({
            projectId
        });
        console.log(`🔐 Firebase Admin initialized for project '${projectId}' (public key verification).`);
        return appInstance;
    } catch (err) {
        console.warn("⚠️ Firebase Admin initialization warning:", err.message);
        return appInstance;
    }
}

initFirebaseAdmin();

module.exports = {
    getApp: () => appInstance,
    getAuth: () => getAuth(appInstance)
};
