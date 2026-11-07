// -----------------------------------------------------------------------------
// aiProvider.js — Common AI Provider Interface and Factory for RippleCheck
//
// Reads AI_PROVIDER from the environment or runtime override, selects the
// appropriate provider (offline Ollama or online Gemini), and exports unified
// generateText(), generateSummary(), getProviderInfo(), and setRuntimeProvider().
// -----------------------------------------------------------------------------

"use strict";

let runtimeProvider = null;

const registry = {
    ollama: "./ollamaProvider",
    groq:   "./groqProvider",
    gemini: "./geminiProvider",
};

/**
 * Resolves and returns the active AI provider.
 * Priority:
 * 1. Runtime provider selection (if set via setRuntimeProvider)
 * 2. process.env.AI_PROVIDER
 * 3. Default to "ollama" (offline mode)
 *
 * @returns {{ providerName: string, providerModule: object }}
 */
function getActiveProvider() {
    // In Desktop Edition, strictly force 'ollama' — offline mode only. Never allow Gemini or cloud fallbacks.
    if (process.env.RIPPLECHECK_EDITION === "desktop") {
        return {
            providerName: "ollama",
            providerModule: require(registry.ollama)
        };
    }

    const rawProvider = runtimeProvider || process.env.AI_PROVIDER || "ollama";
    const providerName = rawProvider.toLowerCase().trim();

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
 * Dynamically switches the active AI provider in memory on the backend.
 *
 * @param {string} providerName - 'ollama' (offline) or 'gemini' (online)
 */
function setRuntimeProvider(providerName) {
    if (process.env.RIPPLECHECK_EDITION === "desktop") {
        throw new Error("RippleCheck Desktop operates exclusively in Offline mode with local Ollama.");
    }
    if (!providerName || typeof providerName !== "string") {
        throw new Error("Provider name must be a non-empty string.");
    }
    const normalized = providerName.toLowerCase().trim();
    if (!Object.prototype.hasOwnProperty.call(registry, normalized)) {
        throw new Error(`Invalid provider: "${providerName}". Supported: ollama, gemini.`);
    }
    runtimeProvider = normalized;
    return getProviderInfo();
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
 * Returns diagnostic metadata about the currently active AI provider and available modes.
 * Never exposes secrets or API keys.
 *
 * @returns {{ provider: string, mode: string, model: string, isConfigured: boolean }}
 */
function getProviderInfo() {
    const { providerName, providerModule } = getActiveProvider();
    const isOnline = providerName === "gemini";
    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);

    return {
        provider: providerName,
        mode: isOnline ? "online" : "offline",
        model: providerModule.modelName,
        isConfigured: isOnline ? hasGeminiKey : true,
        availableProviders: [
            {
                id: "ollama",
                label: "Offline (Ollama)",
                model: "qwen2.5-coder:3b",
                mode: "offline",
                isConfigured: true
            },
            {
                id: "gemini",
                label: "Online (Google Gemini)",
                model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
                mode: "online",
                isConfigured: hasGeminiKey
            }
        ]
    };
}

/**
 * Tests connection health for the currently selected AI provider.
 *
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function checkHealth() {
    const { providerName } = getActiveProvider();
    if (providerName === "gemini") {
        if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_API_KEY.trim()) {
            return { ok: false, message: "GEMINI_API_KEY is not configured on the backend." };
        }
        return { ok: true, message: "Ready (Google Gemini API)" };
    }

    if (providerName === "ollama") {
        const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
        try {
            const baseUrl = new URL(ollamaUrl).origin;
            const res = await fetch(`${baseUrl}/api/tags`, { method: "GET", signal: AbortSignal.timeout(2000) });
            if (res.ok) {
                return { ok: true, message: "Connected (Local Ollama)" };
            }
            return { ok: false, message: `Ollama service returned HTTP ${res.status}` };
        } catch {
            return { ok: false, message: "Ollama not running (localhost:11434)" };
        }
    }

    return { ok: true, message: "Configured" };
}

module.exports = {
    generateText,
    generateSummary,
    getProviderInfo,
    setRuntimeProvider,
    checkHealth
};
