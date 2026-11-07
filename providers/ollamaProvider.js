// -----------------------------------------------------------------------------
// ollamaProvider.js — Ollama AI Provider for RippleCheck
//
// Communicates with a local Ollama instance using the /api/generate endpoint.
// Supports general text generation and source-code summarization.
// -----------------------------------------------------------------------------

const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:3b";

/**
 * Builds a developer-focused prompt instructing the model to generate a 2–4 sentence summary
 * covering the file's purpose, key exports/functions, inputs/outputs, and dependencies.
 *
 * @param {string} filePath - Relative file path (e.g. "app.js")
 * @param {string} sourceCode - Raw file source code
 * @returns {string} - Formatted prompt string
 */
function buildPrompt(filePath, sourceCode) {
    return [
        `You are a senior software engineer doing code review.`,
        `Analyze this JavaScript file: "${filePath}"`,
        ``,
        `Write a developer-focused summary of 2–4 sentences that covers:`,
        `1. The file's specific purpose and role in the application.`,
        `2. The key functions or classes it exports and what they do (include important inputs, outputs, or side effects).`,
        `3. Important dependencies this file uses and how it uses them.`,
        ``,
        `Rules:`,
        `- Base your answer strictly on the provided source code.`,
        `- Do not invent functionality or mention features not present in the code.`,
        `- Do not use vague terms like "handles", "manages", "deals with" without specifics.`,
        `- Return only the plain-text summary. No markdown, no bullet points, no quotes.`,
        ``,
        `Source Code:`,
        `\`\`\`javascript`,
        sourceCode,
        `\`\`\``
    ].join("\n");
}

/**
 * Generates arbitrary text from a prompt using local Ollama.
 *
 * @param {string} prompt - Input prompt text
 * @param {object} [options={}] - Optional parameters (e.g. temperature, maxTokens)
 * @returns {Promise<string>} - Generated text trimmed of whitespace
 */
async function generateText(prompt, options = {}) {
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
        throw new Error("Prompt must be a non-empty string.");
    }

    const payload = {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
    };

    const requestOptions = {};
    if (typeof options.temperature === "number") {
        requestOptions.temperature = options.temperature;
    }
    if (typeof options.maxTokens === "number") {
        requestOptions.num_predict = options.maxTokens;
    } else if (typeof options.num_predict === "number") {
        requestOptions.num_predict = options.num_predict;
    }

    if (Object.keys(requestOptions).length > 0) {
        payload.options = requestOptions;
    }

    const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
            `Ollama API returned HTTP ${response.status} (${response.statusText}): ${errorText}`
        );
    }

    const data = await response.json();
    if (!data || typeof data.response !== "string") {
        throw new Error("Malformed response from Ollama API: missing 'response' field.");
    }

    return data.response.trim();
}

/**
 * Generates a 2-4 sentence developer-focused summary for a source code file using local Ollama.
 * Uses generateText() internally.
 *
 * @param {string} filePath - Relative path of the file
 * @param {string} sourceCode - Raw file contents
 * @returns {Promise<string>} - Cleaned summary text
 */
async function generateSummary(filePath, sourceCode) {
    const prompt = buildPrompt(filePath, sourceCode);

    let summary = await generateText(prompt);

    // Strip wrapping double or single quotes if the model wrapped the summary
    if (
        (summary.startsWith('"') && summary.endsWith('"')) ||
        (summary.startsWith("'") && summary.endsWith("'"))
    ) {
        summary = summary.slice(1, -1).trim();
    }

    return summary;
}

module.exports = {
    generateText,
    generateSummary,
    modelName: OLLAMA_MODEL,
};
