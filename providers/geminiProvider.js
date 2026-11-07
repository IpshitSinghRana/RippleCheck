// -----------------------------------------------------------------------------
// geminiProvider.js — Google Gemini Production AI Provider for RippleCheck
//
// Implements unified generateText() and generateSummary() interfaces using
// the official @google/genai SDK (GoogleGenAI).
// -----------------------------------------------------------------------------

"use strict";

const { GoogleGenAI } = require("@google/genai");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * Returns an initialized GoogleGenAI client instance or throws a clear error
 * if GEMINI_API_KEY is not configured in the environment.
 * API keys are never logged or exposed.
 *
 * @returns {GoogleGenAI}
 */
function getClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
        throw new Error(
            "GEMINI_API_KEY is not set. Please set GEMINI_API_KEY in your environment or .env file, or switch to AI_PROVIDER=ollama."
        );
    }
    return new GoogleGenAI({ apiKey: apiKey.trim() });
}

/**
 * Normalizes error messages from the Gemini API, identifying rate limits,
 * authentication failures, or network issues while ensuring sensitive tokens
 * are never included in output.
 *
 * @param {Error} err
 * @returns {Error}
 */
function handleGeminiError(err) {
    const rawMessage = err?.message || String(err);

    if (rawMessage.includes("429") || /quota|resource has been exhausted|rate limit/i.test(rawMessage)) {
        return new Error("Gemini API rate limit or quota exceeded. Please retry in a few moments.");
    }
    if (rawMessage.includes("403") || rawMessage.includes("401") || /api key not valid|invalid api key/i.test(rawMessage)) {
        return new Error("Gemini API authentication failed: Invalid or unauthorized GEMINI_API_KEY.");
    }
    if (/network|fetch failed|econnrefused|etimedout/i.test(rawMessage)) {
        return new Error("Failed to connect to Google Gemini API: Network connection issue or timeout.");
    }

    return new Error(`Gemini API error: ${rawMessage}`);
}

/**
 * Generates arbitrary text from a prompt using Google Gemini.
 *
 * @param {string} prompt - Input prompt text
 * @param {object} [options={}] - Optional parameters (e.g. temperature, maxTokens)
 * @returns {Promise<string>} - Generated text trimmed of whitespace
 */
async function generateText(prompt, options = {}) {
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
        throw new Error("Prompt must be a non-empty string.");
    }

    const ai = getClient();
    const config = {};

    if (typeof options.temperature === "number") {
        config.temperature = options.temperature;
    }
    if (typeof options.maxTokens === "number") {
        config.maxOutputTokens = options.maxTokens;
    }

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: Object.keys(config).length > 0 ? config : undefined
        });

        const text = response?.text;
        if (typeof text !== "string" || text.trim().length === 0) {
            throw new Error("Gemini API returned an empty response.");
        }

        return text.trim();
    } catch (err) {
        throw handleGeminiError(err);
    }
}

/**
 * Builds developer-focused source-code summary prompt.
 */
function buildSummaryPrompt(filePath, sourceCode) {
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
 * Generates a 2-4 sentence developer-focused summary for a source code file using Google Gemini.
 *
 * @param {string} filePath - Relative file path (e.g. "app.js")
 * @param {string} sourceCode - Raw file source code
 * @returns {Promise<string>} - Cleaned summary text
 */
async function generateSummary(filePath, sourceCode) {
    if (typeof sourceCode !== "string" || sourceCode.trim().length === 0) {
        return `Empty file: "${filePath}". Contains no executable JavaScript code.`;
    }

    const prompt = buildSummaryPrompt(filePath, sourceCode);
    return generateText(prompt, { temperature: 0.2, maxTokens: 250 });
}

module.exports = {
    generateText,
    generateSummary,
    modelName: GEMINI_MODEL
};
