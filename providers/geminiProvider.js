// -----------------------------------------------------------------------------
// geminiProvider.js — Google Gemini AI Provider placeholder for RippleCheck
// -----------------------------------------------------------------------------

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

/**
 * Placeholder implementation for general text generation using Google Gemini AI provider.
 *
 * @param {string} prompt - Input prompt text
 * @param {object} [options={}] - Optional generation parameters
 * @returns {Promise<string>}
 */
async function generateText(prompt, options = {}) {
    throw new Error(
        "Gemini integration is not implemented yet. Please set AI_PROVIDER=ollama in your .env file."
    );
}

/**
 * Placeholder implementation for Google Gemini AI provider summarization.
 *
 * @param {string} filePath - Relative path of the file
 * @param {string} sourceCode - Raw file contents
 * @returns {Promise<string>}
 */
async function generateSummary(filePath, sourceCode) {
    throw new Error(
        "Gemini integration is not implemented yet. Please set AI_PROVIDER=ollama in your .env file."
    );
}

module.exports = {
    generateText,
    generateSummary,
    modelName: GEMINI_MODEL,
};
