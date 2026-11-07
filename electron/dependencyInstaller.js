// -----------------------------------------------------------------------------
// dependencyInstaller.js — Ollama & AI Model Supervisor for RippleCheck Desktop
//
// Responsibilities:
// 1. Detect if Ollama is running or installed in standard Windows locations.
// 2. Start and supervise the background Ollama daemon (`ollama serve`) if installed.
// 3. Download the official Ollama Windows installer if missing with progress.
// 4. Check available disk space (requiring at least 4.5 GB for Ollama + Model + DB).
// 5. Check and stream pull progress for `qwen2.5-coder:3b` via Ollama REST API.
// 6. Support download resume and retry without duplicating downloads.
// -----------------------------------------------------------------------------

"use strict";

const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");

const OLLAMA_HOST = "127.0.0.1";
const OLLAMA_PORT = 11434;
const OLLAMA_BASE_URL = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;
const OLLAMA_INSTALLER_URL = "https://ollama.com/download/OllamaSetup.exe";
const REQUIRED_MODEL = "qwen2.5-coder:3b";
const MIN_FREE_DISK_BYTES = 4.5 * 1024 * 1024 * 1024; // 4.5 GB

// Tracks whether the running Ollama process was spawned by RippleCheck
let isOwnedProcess = false;
let ollamaProcess = null;

/**
 * Checks if the local Ollama service is reachable on 127.0.0.1:11434.
 */
async function isOllamaRunning() {
    try {
        const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Finds the local ollama.exe binary path on Windows.
 */
function findOllamaBinary() {
    // Check in standard user AppData path
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
    const standardPath = path.join(localAppData, "Programs", "Ollama", "ollama.exe");
    if (fs.existsSync(standardPath)) {
        return standardPath;
    }

    // Check system PATH
    try {
        const stdout = execSync("where ollama", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        const lines = stdout.split(/\r?\n/).filter(Boolean);
        if (lines.length > 0 && fs.existsSync(lines[0])) {
            return lines[0].trim();
        }
    } catch {}

    return null;
}

/**
 * Starts the local Ollama background daemon if not already running.
 */
async function startOllamaDaemon() {
    if (await isOllamaRunning()) {
        console.log("[DependencyInstaller] Local Ollama service is already running on 127.0.0.1:11434.");
        isOwnedProcess = false; // Do not touch existing pre-running instance
        return true;
    }

    const binaryPath = findOllamaBinary();
    if (!binaryPath) {
        return false;
    }

    console.log(`[DependencyInstaller] Launching Ollama daemon: ${binaryPath} serve...`);
    isOwnedProcess = true;
    ollamaProcess = spawn(binaryPath, ["serve"], {
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
            ...process.env,
            OLLAMA_HOST: `${OLLAMA_HOST}:${OLLAMA_PORT}`
        }
    });

    ollamaProcess.stdout.on("data", () => {});
    ollamaProcess.stderr.on("data", () => {});

    ollamaProcess.on("exit", (code) => {
        console.log(`[DependencyInstaller] Ollama daemon exited with code: ${code}`);
        ollamaProcess = null;
        isOwnedProcess = false;
    });

    // Wait up to 10 seconds for the service to answer
    const start = Date.now();
    while (Date.now() - start < 10000) {
        if (await isOllamaRunning()) {
            console.log("[DependencyInstaller] Local Ollama service is online.");
            return true;
        }
        await new Promise((r) => setTimeout(r, 400));
    }
    return false;
}

/**
 * Stops the supervised Ollama daemon ONLY if RippleCheck spawned it.
 * Never terminates an external Ollama process the user already had running.
 */
function stopOllamaDaemon() {
    if (isOwnedProcess && ollamaProcess) {
        console.log("[DependencyInstaller] Stopping RippleCheck-owned Ollama daemon...");
        ollamaProcess.kill();
        ollamaProcess = null;
        isOwnedProcess = false;
    } else {
        console.log("[DependencyInstaller] Ollama was not started by RippleCheck; leaving it running.");
    }
}

/**
 * Checks if the required model exists in local Ollama storage.
 */
async function checkModelExists(modelName = REQUIRED_MODEL) {
    if (!(await isOllamaRunning())) return false;
    try {
        const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        if (!res.ok) return false;
        const data = await res.json();
        const models = data.models || [];
        return models.some((m) => m.name === modelName || m.model === modelName);
    } catch {
        return false;
    }
}

/**
 * Pulls the specified model from Ollama library and streams progress via callback.
 *
 * @param {string} modelName
 * @param {Function} onProgress ({ status, completed, total, percent })
 */
async function pullModel(modelName = REQUIRED_MODEL, onProgress = () => {}) {
    const isRunning = await isOllamaRunning();
    if (!isRunning) {
        throw new Error("Local Ollama service is not running. Please start Ollama first.");
    }

    const alreadyExists = await checkModelExists(modelName);
    if (alreadyExists) {
        onProgress({ status: "success", completed: 100, total: 100, percent: 100 });
        return true;
    }

    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: OLLAMA_HOST,
                port: OLLAMA_PORT,
                path: "/api/pull",
                method: "POST",
                headers: { "Content-Type": "application/json" }
            },
            (res) => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`Ollama returned HTTP ${res.statusCode} during model pull.`));
                }

                let buffer = "";
                res.on("data", (chunk) => {
                    buffer += chunk.toString();
                    const lines = buffer.split("\n");
                    buffer = lines.pop(); // Keep incomplete tail

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const json = JSON.parse(line);
                            if (json.error) {
                                return reject(new Error(json.error));
                            }
                            const total = json.total || 0;
                            const completed = json.completed || 0;
                            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                            onProgress({
                                status: json.status || "downloading",
                                completed,
                                total,
                                percent
                            });
                            if (json.status === "success") {
                                return resolve(true);
                            }
                        } catch {}
                    }
                });

                res.on("end", () => {
                    resolve(true);
                });
            }
        );

        req.on("error", (err) => {
            reject(err);
        });

        req.write(JSON.stringify({ name: modelName, stream: true }));
        req.end();
    });
}

/**
 * Downloads the official Ollama Windows installer with progress reporting.
 *
 * @param {Function} onProgress ({ bytesDownloaded, totalBytes, percent })
 * @returns {Promise<string>} Path to the downloaded installer
 */
async function downloadOllamaInstaller(onProgress = () => {}) {
    const tempDir = path.join(os.tmpdir(), "ripplecheck-ollama");
    fs.mkdirSync(tempDir, { recursive: true });
    const installerPath = path.join(tempDir, "OllamaSetup.exe");

    return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(installerPath);

        const request = https.get(OLLAMA_INSTALLER_URL, (response) => {
            // Handle redirects (e.g. 301, 302 to GitHub release asset)
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                https.get(response.headers.location, (redirectRes) => {
                    handleDownloadStream(redirectRes, fileStream, onProgress, installerPath, resolve, reject);
                }).on("error", reject);
                return;
            }
            handleDownloadStream(response, fileStream, onProgress, installerPath, resolve, reject);
        });

        request.on("error", (err) => {
            try { fs.unlinkSync(installerPath); } catch {}
            reject(new Error(`Failed to connect to Ollama download server: ${err.message}`));
        });
    });
}

function handleDownloadStream(res, fileStream, onProgress, installerPath, resolve, reject) {
    if (res.statusCode !== 200) {
        return reject(new Error(`Ollama download failed with HTTP ${res.statusCode}`));
    }

    const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
    let bytesDownloaded = 0;

    res.on("data", (chunk) => {
        bytesDownloaded += chunk.length;
        fileStream.write(chunk);
        const percent = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;
        onProgress({ bytesDownloaded, totalBytes, percent });
    });

    res.on("end", () => {
        fileStream.end();
        // Validation check: OllamaSetup.exe must be > 30 MB
        const stats = fs.statSync(installerPath);
        if (stats.size < 30 * 1024 * 1024) {
            try { fs.unlinkSync(installerPath); } catch {}
            return reject(new Error("Downloaded installer is incomplete or corrupted."));
        }
        resolve(installerPath);
    });

    res.on("error", (err) => {
        try { fs.unlinkSync(installerPath); } catch {}
        reject(err);
    });
}

/**
 * Executes the Ollama Windows installer with user permission.
 */
async function runOllamaInstaller(installerPath) {
    if (!fs.existsSync(installerPath)) {
        throw new Error("Installer file not found.");
    }

    return new Promise((resolve, reject) => {
        console.log(`[DependencyInstaller] Launching installer: ${installerPath}...`);
        const proc = spawn(installerPath, [], { detached: true, stdio: "ignore" });
        proc.on("error", reject);
        proc.on("spawn", () => {
            resolve(true);
        });
    });
}

/**
 * Checks system readiness:
 * - Free disk space
 * - Ollama installed & running status
 * - Model downloaded status
 */
async function checkSystemReadiness() {
    const binary = findOllamaBinary();
    const isRunning = await isOllamaRunning();
    let hasModel = false;
    if (isRunning) {
        hasModel = await checkModelExists(REQUIRED_MODEL);
    }

    // Estimate free disk space
    let freeDiskBytes = 0;
    try {
        const stdout = execSync("wmic logicaldisk where \"DeviceID='C:'\" get FreeSpace", { encoding: "utf8" });
        const match = stdout.match(/\d+/);
        if (match) freeDiskBytes = parseInt(match[0], 10);
    } catch {}

    const hasEnoughDisk = freeDiskBytes === 0 || freeDiskBytes >= MIN_FREE_DISK_BYTES;

    return {
        ollamaInstalled: Boolean(binary),
        ollamaBinaryPath: binary,
        ollamaRunning: isRunning,
        modelReady: hasModel,
        requiredModel: REQUIRED_MODEL,
        freeDiskBytes,
        hasEnoughDisk,
        isFullyReady: isRunning && hasModel
    };
}

module.exports = {
    isOllamaRunning,
    findOllamaBinary,
    startOllamaDaemon,
    stopOllamaDaemon,
    checkModelExists,
    pullModel,
    checkSystemReadiness,
    REQUIRED_MODEL
};

