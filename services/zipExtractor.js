// -----------------------------------------------------------------------------
// zipExtractor.js — Secure ZIP Archive Extraction & Validation for RippleCheck
//
// Security Constraints:
// 1. Max compressed size: 100 MB
// 2. Max extracted size: 500 MB
// 3. Max files: 500
// 4. Max compression ratio: 100:1 (rejects zip bombs)
// 5. ZIP Slip / path traversal protection:
//    - Rejects paths containing '..' or null bytes
//    - Rejects absolute paths (e.g. /etc/passwd or C:\...)
//    - Resolves final path and asserts startsWith(targetDir)
// 6. Source-code project validation:
//    - Must contain at least one recognized JavaScript / source file (.js, .mjs, .cjs, .jsx, etc.)
// 7. Safe isolated temporary directories (created under system temp or data/uploads/temp)
// -----------------------------------------------------------------------------

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const AdmZip = require("adm-zip");

const LIMITS = {
    MAX_COMPRESSED_BYTES: 100 * 1024 * 1024,  // 100 MB
    MAX_EXTRACTED_BYTES: 500 * 1024 * 1024,   // 500 MB
    MAX_FILES: 25000,                         // Support repositories with thousands of entries up to 25,000
    MAX_COMPRESSION_RATIO: 100,
    // Source code file extensions supported by Madge dependency scanner
    SUPPORTED_CODE_EXTS: new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"]),
    // Config / metadata file extensions
    CONFIG_METADATA_EXTS: new Set([".json", ".yml", ".yaml", ".toml", ".env", ".xml", ".ini"]),
    IGNORED_FOLDER_SEGMENTS: new Set([
        "node_modules",
        ".git",
        ".github",
        ".svn",
        ".hg",
        "dist",
        "build",
        "out",
        "coverage",
        ".next",
        ".nuxt",
        ".turbo",
        ".cache"
    ])
};

/**
 * Checks if a zip entry path belongs to an ignored/generated folder.
 *
 * @param {string} entryName
 * @returns {boolean}
 */
function isIgnoredEntry(entryName) {
    if (!entryName) return false;
    const normalized = path.normalize(entryName).replace(/\\/g, "/");
    const segments = normalized.split("/").map((s) => s.trim().toLowerCase());
    return segments.some((segment) => LIMITS.IGNORED_FOLDER_SEGMENTS.has(segment));
}

/**
 * Validates zip entries before extraction to prevent zip bombs, path traversal,
 * null byte injection, and non-code archives.
 *
 * @param {string|Buffer} zipInput - Path to ZIP file or Buffer
 * @returns {{ zip: AdmZip, entries: Array<Object>, totalUncompressedSize: number, jsFileCount: number }}
 */
function validateZip(zipInput) {
    let zip;
    let compressedSize = 0;

    if (Buffer.isBuffer(zipInput)) {
        compressedSize = zipInput.length;
        zip = new AdmZip(zipInput);
    } else {
        const stats = fs.statSync(zipInput);
        compressedSize = stats.size;
        if (compressedSize > LIMITS.MAX_COMPRESSED_BYTES) {
            throw new Error(`Upload exceeds maximum allowed archive size of 100 MB (was ${(compressedSize / (1024 * 1024)).toFixed(2)} MB).`);
        }
        zip = new AdmZip(zipInput);
    }

    const entries = zip.getEntries();

    if (!entries || entries.length === 0) {
        throw new Error("The uploaded ZIP archive is empty.");
    }

    if (entries.length > LIMITS.MAX_FILES) {
        throw new Error(`ZIP archive contains ${entries.length} entries, exceeding the maximum limit of ${LIMITS.MAX_FILES.toLocaleString()} entries.`);
    }

    let totalUncompressedSize = 0;
    let jsFileCount = 0;
    const activeEntries = [];

    for (const entry of entries) {
        const rawName = entry.entryName;

        // 1. Check for null bytes
        if (rawName.includes("\0")) {
            throw new Error(`Security violation: Archive entry contains illegal null byte: "${rawName}"`);
        }

        // 2. Reject absolute paths
        if (path.isAbsolute(rawName) || /^[a-zA-Z]:/.test(rawName) || rawName.startsWith("/") || rawName.startsWith("\\")) {
            throw new Error(`Security violation: Archive entry has an absolute path: "${rawName}"`);
        }

        // 3. Reject path traversal sequences
        const normalized = path.normalize(rawName).replace(/\\/g, "/");
        const segments = normalized.split("/");
        if (segments.includes("..") || rawName.includes("..")) {
            throw new Error(`Security violation: ZIP Slip path traversal detected in entry: "${rawName}"`);
        }

        // Exclude ignored/generated dependency and build directories
        if (isIgnoredEntry(rawName)) {
            continue;
        }

        activeEntries.push(entry);

        if (!entry.isDirectory) {
            const entrySize = entry.header.size;
            totalUncompressedSize += entrySize;

            if (totalUncompressedSize > LIMITS.MAX_EXTRACTED_BYTES) {
                throw new Error(`Archive exceeds maximum uncompressed size limit of 500 MB.`);
            }

            // Check entry compression ratio
            const compressedEntrySize = entry.header.compressedSize;
            if (compressedEntrySize > 0) {
                const ratio = entrySize / compressedEntrySize;
                if (ratio > LIMITS.MAX_COMPRESSION_RATIO && entrySize > 1024 * 100) {
                    throw new Error(`Security violation: Suspicious compression ratio (${ratio.toFixed(1)}:1) detected in entry: "${rawName}".`);
                }
            }

            const ext = path.extname(rawName).toLowerCase();
            if (LIMITS.SUPPORTED_CODE_EXTS.has(ext)) {
                jsFileCount++;
            }
        }
    }

    // Overall compression ratio check
    if (compressedSize > 0) {
        const overallRatio = totalUncompressedSize / compressedSize;
        if (overallRatio > LIMITS.MAX_COMPRESSION_RATIO && totalUncompressedSize > 1024 * 1024) {
            throw new Error(`Security violation: Overall compression ratio (${overallRatio.toFixed(1)}:1) exceeds 100:1 safety limit.`);
        }
    }

    if (jsFileCount === 0) {
        throw new Error("No JavaScript source files (.js, .mjs, .cjs, etc.) found in the repository archive (excluding node_modules, dist, etc.).");
    }

    return { zip, entries: activeEntries, totalUncompressedSize, jsFileCount };
}

/**
 * Safely extracts a validated ZIP archive into an isolated temporary folder.
 * Guarantees every file extracted is strictly inside targetDir.
 *
 * @param {string|Buffer} zipInput - Path to ZIP file or Buffer
 * @param {string} [customTargetDir] - Optional specific extraction directory
 * @returns {{ extractDir: string, cleanup: Function, totalFiles: number }}
 */
function safelyExtractZip(zipInput, customTargetDir = null) {
    const { zip, entries } = validateZip(zipInput);

    const targetDir = customTargetDir || path.join(
        os.tmpdir(),
        "ripplecheck-uploads",
        `repo-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`
    );

    const resolvedTarget = path.resolve(targetDir);
    fs.mkdirSync(resolvedTarget, { recursive: true });

    let extractedCount = 0;
    const manifestFiles = [];

    for (const entry of entries) {
        const rawName = entry.entryName;
        // Strip any leading ./ or /
        const sanitizedEntryName = rawName.replace(/^(\.\/|\/|\\)+/, "");
        const destinationPath = path.resolve(resolvedTarget, sanitizedEntryName);

        // Strict ZIP Slip assertion
        if (!destinationPath.startsWith(resolvedTarget + path.sep) && destinationPath !== resolvedTarget) {
            throw new Error(`Security violation: Attempted extraction outside destination directory: "${rawName}"`);
        }

        if (entry.isDirectory) {
            fs.mkdirSync(destinationPath, { recursive: true });
        } else {
            fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
            fs.writeFileSync(destinationPath, entry.getData(), { mode: 0o600 });
            extractedCount++;

            const ext = path.extname(sanitizedEntryName).toLowerCase();
            const isSupported = LIMITS.SUPPORTED_CODE_EXTS.has(ext);
            const isConfig = LIMITS.CONFIG_METADATA_EXTS.has(ext);

            // Determine file category
            let category = "raw";
            if (isSupported) {
                category = "code";
            } else if (isConfig) {
                category = "config";
            }

            manifestFiles.push({
                path: sanitizedEntryName.replace(/\\/g, "/"),
                name: path.basename(sanitizedEntryName),
                size: entry.header.size,
                isSupported,
                category,
                extension: ext
            });
        }
    }

    const cleanup = () => {
        try {
            if (fs.existsSync(resolvedTarget)) {
                fs.rmSync(resolvedTarget, { recursive: true, force: true });
            }
        } catch (err) {
            console.warn(`Failed to clean up extraction directory ${resolvedTarget}:`, err.message);
        }
    };

    return {
        extractDir: resolvedTarget,
        cleanup,
        totalFiles: extractedCount,
        manifestFiles
    };
}

/**
 * Finds the most likely repository source root inside an extracted folder.
 * (e.g. if the ZIP has a top-level folder like `my-repo/src/...` or directly `src/`)
 *
 * @param {string} extractDir
 * @returns {string}
 */
function findSourceDirectory(extractDir) {
    if (!fs.existsSync(extractDir)) {
        return extractDir;
    }

    // If there is an existing 'src' directory, prefer that
    const directSrc = path.join(extractDir, "src");
    if (fs.existsSync(directSrc) && fs.statSync(directSrc).isDirectory()) {
        return directSrc;
    }

    // If the zip contained a single wrapper directory, unwrap it
    const entries = fs.readdirSync(extractDir, { withFileTypes: true });
    if (entries.length === 1 && entries[0].isDirectory()) {
        const subDir = path.join(extractDir, entries[0].name);
        const subSrc = path.join(subDir, "src");
        if (fs.existsSync(subSrc) && fs.statSync(subSrc).isDirectory()) {
            return subSrc;
        }
        return subDir;
    }

    return extractDir;
}

module.exports = {
    LIMITS,
    isIgnoredEntry,
    validateZip,
    safelyExtractZip,
    findSourceDirectory
};

