// -----------------------------------------------------------------------------
// processManager.js — Electron Backend Supervisor for RippleCheck Desktop
//
// Responsibilities:
// 1. Discover a free port on 127.0.0.1 dynamically.
// 2. Launch the Express server as a child process with:
//    - HOST=127.0.0.1 (Strict local loopback only)
//    - PORT=<dynamicPort>
//    - RIPPLECHECK_EDITION=desktop
// 3. Monitor backend health via GET http://127.0.0.1:<port>/api/health.
// 4. Terminate child process cleanly when Electron shuts down.
// -----------------------------------------------------------------------------

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const fs = require('fs');

let backendProcess = null;
let backendPort = null;

/**
 * Resolves the Node.js runtime binary to run the background Express server.
 * In packaged Electron apps, a dedicated node.exe is bundled into resources/bin/node.exe
 * to provide a 100% self-contained Node environment matching native N-API modules.
 */
function resolveNodeRuntime() {
  // Check packaged extraResources path: <appDir>/resources/bin/node.exe or ../bin/node.exe
  const packagedCandidates = [
    path.join(process.resourcesPath || '', 'bin', 'node.exe'),
    path.resolve(__dirname, '../../bin/node.exe'),
    path.resolve(__dirname, '../build/bin/node.exe')
  ];

  for (const candidate of packagedCandidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[Desktop ProcessManager] Found dedicated node runtime: ${candidate}`);
      return candidate;
    }
  }

  // Fallback to current process or system node
  return 'node';
}

/**
 * Finds an available port on 127.0.0.1.
 */
function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Polls the backend health endpoint until it responds with 200 OK.
 */
async function waitForBackend(port, timeoutMs = 20000) {
  const startTime = Date.now();
  const healthUrl = `http://127.0.0.1:${port}/api/health`;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'ok') {
          return true;
        }
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for local backend at ${healthUrl} after ${timeoutMs}ms`);
}

/**
 * Starts the local Express backend on a dynamic 127.0.0.1 port.
 */
async function startBackend() {
  backendPort = await getAvailablePort();
  const serverPath = path.resolve(__dirname, '../server.js');

  const env = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(backendPort),
    RIPPLECHECK_EDITION: 'desktop',
    ALLOWED_ORIGINS: `http://127.0.0.1:${backendPort},http://localhost:${backendPort}`,
    ELECTRON_RUN_AS_NODE: '1'
  };

  console.log(`[Desktop ProcessManager] Spawning backend on 127.0.0.1:${backendPort}...`);

  const nodeRuntime = resolveNodeRuntime();
  console.log(`[Desktop ProcessManager] Using Node runtime: ${nodeRuntime}`);

  backendProcess = spawn(nodeRuntime, [serverPath], {
    env,
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[Backend stdout]: ${data.toString().trim()}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend stderr]: ${data.toString().trim()}`);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`[Desktop ProcessManager] Backend process exited with code ${code}, signal ${signal}`);
    backendProcess = null;
  });

  await waitForBackend(backendPort);
  console.log(`[Desktop ProcessManager] Local backend is live and healthy on 127.0.0.1:${backendPort}`);
  return `http://127.0.0.1:${backendPort}/api`;
}

/**
 * Cleanly shuts down the backend process.
 */
function stopBackend() {
  if (backendProcess) {
    console.log('[Desktop ProcessManager] Terminating backend process...');
    backendProcess.kill();
    backendProcess = null;
  }
}

module.exports = {
  startBackend,
  stopBackend,
  getBackendPort: () => backendPort,
  getBackendUrl: () => (backendPort ? `http://127.0.0.1:${backendPort}/api` : null)
};

