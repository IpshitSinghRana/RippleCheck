// -----------------------------------------------------------------------------
// nlToCypher.js — Natural Language to Cypher Translation Service for RippleCheck
//
// Converts natural language questions into executable Cypher queries by
// building a schema-aware prompt, querying the configured AI provider,
// and cleaning the returned Cypher text.
// -----------------------------------------------------------------------------

const { buildCypherPrompt } = require("./cypherPrompt");
const aiProvider = require("../providers/aiProvider");

/**
 * Cleans the raw LLM output into a clean, single Cypher query.
 * Removes outer Markdown code fences, trailing semicolons, and surrounding whitespace.
 * Rejects empty or invalid output.
 *
 * @param {string} rawResponse - The raw response text from the AI provider
 * @returns {string} - Cleaned Cypher query string
 * @throws {Error} - If the raw response or cleaned query is empty
 */
function cleanCypherResponse(rawResponse) {
    if (!rawResponse || typeof rawResponse !== "string") {
        throw new Error("AI provider returned an empty or invalid response.");
    }

    let cleaned = rawResponse.trim();

    // Strip trailing semicolons outside code fence if present
    cleaned = cleaned.replace(/;+\s*$/, "").trim();

    // Remove genuine outer Markdown code fences (e.g. ```cypher ... ``` or ``` ... ```)
    const multiLineFence = /^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n?```$/;
    const singleLineFence = /^```(?:cypher|cql)?\s*([\s\S]*?)\s*```$/i;

    const match = cleaned.match(multiLineFence) || cleaned.match(singleLineFence);
    if (match) {
        cleaned = match[1].trim();
    }

    // Strip trailing semicolons and trailing whitespace inside the extracted query
    cleaned = cleaned.replace(/;+\s*$/, "").trim();

    // Reject empty output
    if (cleaned.length === 0) {
        throw new Error("AI provider returned an empty Cypher query.");
    }

    return cleaned;
}

/**
 * Enforces that every File node pattern in a Cypher query is strictly scoped
 * to the specified projectId, ensuring strict multi-project isolation.
 *
 * @param {string} cypher - The Cypher query string
 * @param {string} projectId - Target projectId
 * @returns {string} - Scoped Cypher query
 */
function enforceProjectScope(cypher, projectId) {
    if (!cypher || typeof cypher !== "string" || !projectId) return cypher;
    const safeId = projectId.replace(/'/g, "\\'");

    // 1. If File has property map: (:File { ... }) or (ident:File { ... })
    let scoped = cypher.replace(/(\(\s*([a-zA-Z0-9_]*)\s*:\s*File\s*\{)([^}]*)\}/g, (match, prefix, varName, inside) => {
        if (/projectId\s*:/i.test(inside)) {
            const updatedInside = inside.replace(/projectId\s*:\s*(?:'[^']*'|"[^"]*"|\$[a-zA-Z0-9_]+)/i, `projectId: '${safeId}'`);
            return `${prefix}${updatedInside}}`;
        }
        const trimmedInside = inside.trim();
        const separator = trimmedInside.length > 0 ? ", " : "";
        return `${prefix}projectId: '${safeId}'${separator}${trimmedInside}}`;
    });

    // 2. If File has NO property map: (:File) or (ident:File) followed by ), comma, or relationship connector
    scoped = scoped.replace(/(\(\s*([a-zA-Z0-9_]*)\s*:\s*File\s*)(\)|-(?:\[|>)|,)/g, (match, prefix, varName, suffix) => {
        const trimmedPrefix = prefix.trimEnd();
        return `${trimmedPrefix} {projectId: '${safeId}'}${suffix}`;
    });

    return scoped;
}

/**
 * Deterministic rule-based Cypher generator used when the AI provider is offline or
 * for standard dependency, dependent, and blast-radius queries.
 *
 * @param {string} question - User question
 * @param {string} projectId - Active project ID
 * @returns {string|null} - Cypher query or null if no rule matched
 */
function generateRuleBasedCypher(question, projectId = "sample-repo") {
    if (!question || typeof question !== "string") return null;
    const q = question.trim();
    const safeProjectId = typeof projectId === "string" && projectId.trim() ? projectId.trim() : "sample-repo";

    const fileMatch = q.match(/\b([a-zA-Z0-9_\-./]+\.(?:js|jsx|ts|tsx|json))\b/i);
    const fileName = fileMatch ? fileMatch[1] : null;
    if (!fileName) return null;

    const lowerQ = q.toLowerCase();

    // 1. Outgoing dependencies (files imported by target)
    if (
        /does\s+.*\bimport\b/i.test(lowerQ) ||
        /\bwhat (does|files does)\b.*\bimport\b/i.test(lowerQ) ||
        /\bdependencies (of|for)\b/i.test(lowerQ) ||
        /\bfiles imported by\b/i.test(lowerQ) ||
        /\bwhat files are imported by\b/i.test(lowerQ)
    ) {
        return `MATCH (f:File {projectId: '${safeProjectId}', name: '${fileName}'})-[:IMPORTS]->(dep:File {projectId: '${safeProjectId}'}) RETURN dep.path AS path, dep.name AS name, dep.summary AS summary`;
    }

    // 2. Incoming direct dependents (files that import target)
    if (
        /\bdirectly depend(s)? on\b/i.test(lowerQ) ||
        /\bfiles (that|which) (directly )?import\b/i.test(lowerQ) ||
        /\bwho imports\b/i.test(lowerQ) ||
        /\bdependents of\b/i.test(lowerQ) ||
        /\bwhat files directly import\b/i.test(lowerQ)
    ) {
        return `MATCH (importer:File {projectId: '${safeProjectId}'})-[:IMPORTS]->(target:File {projectId: '${safeProjectId}', name: '${fileName}'}) RETURN importer.path AS path, importer.name AS name, importer.summary AS summary`;
    }

    // 3. Transitive impact / blast radius
    if (
        /\b(affected|blast radius|break)\b/i.test(lowerQ) ||
        /\bdepend(s)? on\b/i.test(lowerQ)
    ) {
        return `MATCH (affected:File {projectId: '${safeProjectId}'})-[:IMPORTS*1..]->(target:File {projectId: '${safeProjectId}', name: '${fileName}'}) RETURN DISTINCT affected.path AS path, affected.name AS name, affected.summary AS summary`;
    }

    return null;
}

/**
 * Generates a clean Cypher query from a user's natural language question,
 * scoped strictly to the specified projectId.
 *
 * @param {string} userQuestion - The natural language question
 * @param {string} [projectId="sample-repo"] - Active project ID for query isolation
 * @returns {Promise<string>} - Clean, executable Cypher query
 * @throws {Error} - If userQuestion is invalid, or if query generation fails
 */
async function generateCypher(userQuestion, projectId = "sample-repo") {
    if (typeof userQuestion !== "string" || userQuestion.trim().length === 0) {
        throw new Error("userQuestion must be a non-empty string.");
    }

    const safeProjectId = typeof projectId === "string" && projectId.trim() ? projectId.trim() : "sample-repo";

    try {
        // 1. Build prompt with graph schema context, project scope, and guardrails
        const prompt = buildCypherPrompt(userQuestion, safeProjectId);

        // 2. Request completion from active AI provider
        const rawResponse = await aiProvider.generateText(prompt, {
            temperature: 0.1,
            maxTokens: 500,
        });

        // 3. Clean and sanitize response
        const cleanedCypher = cleanCypherResponse(rawResponse);

        if (!cleanedCypher || cleanedCypher.length === 0) {
            throw new Error("AI provider returned an empty Cypher query.");
        }

        // 4. Enforce project scoping on all matched File node patterns
        return enforceProjectScope(cleanedCypher, safeProjectId);
    } catch (error) {
        // Fallback to deterministic rule-based query generator if AI provider is unavailable
        const ruleBased = generateRuleBasedCypher(userQuestion, safeProjectId);
        if (ruleBased) {
            return ruleBased;
        }
        throw new Error(`Failed to generate Cypher query: ${error.message}`);
    }
}

module.exports = {
    generateCypher,
    enforceProjectScope,
    generateRuleBasedCypher
};

