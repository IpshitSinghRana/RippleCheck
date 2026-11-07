// -----------------------------------------------------------------------------
// groqProvider.js — Groq Cloud AI Provider placeholder for RippleCheck
// -----------------------------------------------------------------------------

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

/**
 * Placeholder implementation for general text generation using Groq Cloud AI provider.
 *
 * @param {string} prompt - Input prompt text
 * @param {object} [options={}] - Optional generation parameters
 * @returns {Promise<string>}
 */
async function generateText(prompt, options = {}) {
    throw new Error(
        "Groq integration is not implemented yet. Please set AI_PROVIDER=ollama in your .env file."
    );
}

/**
 * Placeholder implementation for Groq Cloud AI provider summarization.
 *
 * @param {string} filePath - Relative path of the file
 * @param {string} sourceCode - Raw file contents
 * @returns {Promise<string>}
 */
async function generateSummary(filePath, sourceCode) {
    throw new Error(
        "Groq integration is not implemented yet. Please set AI_PROVIDER=ollama in your .env file."
    );
}

module.exports = {
    generateText,
    generateSummary,
    modelName: GROQ_MODEL,
};
