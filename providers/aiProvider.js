// -----------------------------------------------------------------------------
// aiProvider.js — Common AI Provider Interface and Factory for RippleCheck
//
// Reads AI_PROVIDER from the environment, selects the appropriate provider,
// and exports unified generateText() / generateSummary() functions and
// a getProviderInfo() helper.
// -----------------------------------------------------------------------------

/**
 * Resolves and returns the active AI provider based on AI_PROVIDER environment variable.
 * Defaults to "ollama" if AI_PROVIDER is not set or empty.
 *
 * @returns {{ providerName: string, providerModule: object }}
 */
function getActiveProvider() {
    const rawProvider = process.env.AI_PROVIDER || "ollama";
    const providerName = rawProvider.toLowerCase().trim();

    const registry = {
        ollama: "./ollamaProvider",
        groq:   "./groqProvider",
        gemini: "./geminiProvider",
    };

    if (!Object.prototype.hasOwnProperty.call(registry, providerName)) {
        const supported = Object.keys(registry).join(", ");
        throw new Error(
            `Unsupported AI_PROVIDER "${rawProvider}". Supported providers are: ${supported}`
        );
    }

    const providerModule = require(registry[providerName]);
    return {
        providerName,
        providerModule,
    };
}

/**
 * Generates arbitrary text using the configured AI provider.
 *
 * @param {string} prompt - Input prompt text
 * @param {object} [options={}] - Optional parameters (e.g. temperature, maxTokens)
 * @returns {Promise<string>} - Cleaned generated text
 */
async function generateText(prompt, options = {}) {
    const { providerModule } = getActiveProvider();
    return providerModule.generateText(prompt, options);
}

/**
 * Generates a 1-2 sentence summary for a source code file using the configured AI provider.
 *
 * @param {string} filePath - Relative path of the file
 * @param {string} sourceCode - Raw file contents
 * @returns {Promise<string>} - Cleaned summary text
 */
async function generateSummary(filePath, sourceCode) {
    const { providerModule } = getActiveProvider();
    return providerModule.generateSummary(filePath, sourceCode);
}

/**
 * Returns diagnostic metadata about the currently active AI provider.
 *
 * @returns {{ provider: string, model: string }}
 */
function getProviderInfo() {
    const { providerName, providerModule } = getActiveProvider();
    return {
        provider: providerName,
        model: providerModule.modelName,
    };
}

module.exports = {
    generateText,
    generateSummary,
    getProviderInfo,
};
