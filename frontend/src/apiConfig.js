// -----------------------------------------------------------------------------
// apiConfig.js — Central API Configuration for RippleCheck Frontend
//
// Reads VITE_API_BASE_URL from the build environment.
// In local development or when VITE_API_BASE_URL is not set, defaults to '/api'
// which is proxied to http://127.0.0.1:3000 by Vite.
// In production, when deployed to a different domain, VITE_API_BASE_URL can point
// to the remote backend (e.g., https://api.ripplecheck.app/api or https://api.ripplecheck.app).
// -----------------------------------------------------------------------------

const rawBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) || '/api';

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
  if (!endpointPath) return normalizedBaseUrl;
  const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  // If the endpoint path already includes /api prefix and normalizedBaseUrl already ends with /api, avoid duplication
  if (normalizedBaseUrl.endsWith('/api') && cleanPath.startsWith('/api/')) {
    return `${normalizedBaseUrl}${cleanPath.slice(4)}`;
  }
  return `${normalizedBaseUrl}${cleanPath}`;
}

export const API_BASE_URL = normalizedBaseUrl;

