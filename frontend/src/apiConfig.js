// -----------------------------------------------------------------------------
// apiConfig.js — Central API Configuration for RippleCheck Frontend
//
// Reads VITE_API_BASE_URL from the build environment.
// In Desktop Edition, if window.electronAPI is available, queries the dynamically
// allocated local backend port (e.g. http://127.0.0.1:34567/api).
// In local development or when VITE_API_BASE_URL is not set, defaults to '/api'
// which is proxied to http://127.0.0.1:3000 by Vite.
// In production web, points to the remote backend (Render URL).
// -----------------------------------------------------------------------------

const rawBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) || '/api';
let dynamicDesktopBaseUrl = null;

// Query dynamic backend URL from Electron main process via ContextBridge
if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.getBackendUrl === 'function') {
  window.electronAPI.getBackendUrl().then((url) => {
    if (url) {
      dynamicDesktopBaseUrl = url.replace(/\/+$/, '');
      console.log('[RippleCheck Desktop] Bound to local backend:', dynamicDesktopBaseUrl);
    }
  }).catch((err) => {
    console.warn('[RippleCheck Desktop] Could not fetch backend URL via IPC:', err);
  });
}

// Normalize: remove trailing slashes
const normalizedBaseUrl = (rawBaseUrl || '/api').replace(/\/+$/, '');

/**
 * Returns a fully qualified endpoint URL for an API path.
 *
 * Examples:
 *   apiUrl('/projects') -> '/api/projects' (or 'https://api.ripplecheck.app/api/projects')
 *   apiUrl('/graph?projectId=test') -> '/api/graph?projectId=test'
 *
 * @param {string} endpointPath - Path starting with or without leading slash
 * @returns {string}
 */
export function apiUrl(endpointPath) {
  const activeBaseUrl = dynamicDesktopBaseUrl || normalizedBaseUrl;
  if (!endpointPath) return activeBaseUrl;
  const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  // If the endpoint path already includes /api prefix and activeBaseUrl already ends with /api, avoid duplication
  if (activeBaseUrl.endsWith('/api') && cleanPath.startsWith('/api/')) {
    return `${activeBaseUrl}${cleanPath.slice(4)}`;
  }
  return `${activeBaseUrl}${cleanPath}`;
}

export const API_BASE_URL = normalizedBaseUrl;


