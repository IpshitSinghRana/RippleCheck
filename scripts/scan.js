// -----------------------------------------------------------------------------
// scan.js — RippleCheck dependency scanner using Madge
//
// Usage:
//   node scripts/scan.js [sourceDir] [outputFile]
// Or programmatically:
//   const { scanRepository } = require("./scan");
//   const graph = await scanRepository(sourceDir, outputFile);
// -----------------------------------------------------------------------------

"use strict";

const madge = require("madge");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_SRC_DIR = path.join(PROJECT_ROOT, "data", "sample-repo", "src");
const DEFAULT_OUTPUT_FILE = path.join(PROJECT_ROOT, "data", "madge.json");

/**
 * Scans a source directory using Madge AST dependency parsing.
 *
 * @param {string} sourceDir - Target directory containing JavaScript files
 * @param {string} [outputFile] - Optional path to save JSON results
 * @returns {Promise<Object>} - The dependency adjacency graph object
 */
async function scanRepository(sourceDir = DEFAULT_SRC_DIR, outputFile = DEFAULT_OUTPUT_FILE) {
    const resolvedSrc = path.resolve(sourceDir);
    console.log(`Scanning: ${resolvedSrc}`);

    if (!fs.existsSync(resolvedSrc)) {
        throw new Error(`Source directory does not exist: ${resolvedSrc}`);
    }

    const result = await madge(resolvedSrc, {
        fileExtensions: ["js", "jsx", "ts", "tsx", "mjs", "cjs"]
    });
    const graph = result.obj();
    const fileCount = Object.keys(graph).length;

    if (outputFile) {
        const resolvedOut = path.resolve(outputFile);
        fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
        fs.writeFileSync(resolvedOut, JSON.stringify(graph, null, 2), "utf8");
        console.log(`✅ Scan complete. ${fileCount} files scanned.`);
        console.log(`📄 Output saved to: ${resolvedOut}`);
    }

    return graph;
}

// CLI execution
if (require.main === module) {
    const customSrc = process.argv[2] || DEFAULT_SRC_DIR;
    const customOut = process.argv[3] || DEFAULT_OUTPUT_FILE;

    scanRepository(customSrc, customOut).catch((error) => {
        console.error("❌ Scan failed:", error);
        process.exit(1);
    });
}

module.exports = { scanRepository };
