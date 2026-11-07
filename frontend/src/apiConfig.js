// -----------------------------------------------------------------------------
// apiConfig.js — Central API Configuration for RippleCheck Frontend
//
// Reads VITE_API_BASE_URL from the build environment.
// In Desktop Edition, if window.electronAPI is available, queries the dynamically
// allocated local backend port (e.g. http://127.0.0.1:34567/api).
// In local development or when VITE_API_BASE_URL is not set, defaults to '/api'
// which is proxied to http://127.0.0.1:3000 by Vite.
// In production web, points to the remote backend (Render URL).
//
// IMPORTANT: VITE_API_BASE_URL may be set to either:
//   - The bare origin:   https://ripplecheck-api.onrender.com
//   - Or with /api:      https://ripplecheck-api.onrender.com/api
// Both forms are accepted. normalizeApiBase() ensures the base always ends in /api
// for full HTTP(S) URLs so that all apiUrl() calls produce correct paths.
// -----------------------------------------------------------------------------

/**
 * Normalizes a raw API base URL so that:
 *   - Trailing slashes are removed.
 *   - Full HTTP/HTTPS URLs that don't already end with /api have /api appended.
 *   - Relative paths (e.g. '/api') are returned as-is after stripping trailing slashes.
 *   - Falsy values fall back to '/api'.
 *
 * @param {string|undefined|null|false} raw
 * @returns {string}
 */
export function normalizeApiBase(raw) {
  if (!raw) return '/api';
  const stripped = String(raw).replace(/\/+$/, '');
  if (
    (stripped.startsWith('http://') || stripped.startsWith('https://')) &&
    !stripped.endsWith('/api')
  ) {
    return `${stripped}/api`;
  }
  return stripped;
}

const rawBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) || '';
let dynamicDesktopBaseUrl = null;

// Query dynamic backend URL from Electron main process via ContextBridge
if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.getBackendUrl === 'function') {
  window.electronAPI.getBackendUrl().then((url) => {
    if (url) {
      // Desktop provides a full URL including /api already (e.g. http://127.0.0.1:34567/api)
      dynamicDesktopBaseUrl = normalizeApiBase(url);
      console.log('[RippleCheck Desktop] Bound to local backend:', dynamicDesktopBaseUrl);
    }
  }).catch((err) => {
    console.warn('[RippleCheck Desktop] Could not fetch backend URL via IPC:', err);
  });
}

// Normalize the static base URL — always ends in /api for HTTP(S) URLs
const normalizedBaseUrl = normalizeApiBase(rawBaseUrl);

/**
 * Returns a fully qualified endpoint URL for an API path.
 *
 * All callers pass paths WITHOUT the /api prefix, e.g.:
 *   apiUrl('/projects')             -> 'https://ripplecheck-api.onrender.com/api/projects'
 *   apiUrl('/graph?projectId=test') -> 'https://ripplecheck-api.onrender.com/api/graph?projectId=test'
 *   apiUrl('/projects/upload')      -> 'https://ripplecheck-api.onrender.com/api/projects/upload'
 *
 * @param {string} endpointPath - Path starting with or without leading slash (no /api prefix)
 * @returns {string}
 */
export function apiUrl(endpointPath) {
  const activeBaseUrl = dynamicDesktopBaseUrl || normalizedBaseUrl;
  if (!endpointPath) return activeBaseUrl;
  const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  // Guard: if caller accidentally includes /api/ prefix and base already ends with /api, deduplicate
  if (activeBaseUrl.endsWith('/api') && cleanPath.startsWith('/api/')) {
    return `${activeBaseUrl}${cleanPath.slice(4)}`;
  }
  return `${activeBaseUrl}${cleanPath}`;
}

export const API_BASE_URL = normalizedBaseUrl;


