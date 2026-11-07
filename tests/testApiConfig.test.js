/**
 * testApiConfig.test.js
 *
 * Regression tests for apiConfig.js URL construction logic.
 *
 * Because apiConfig.js is an ES module that uses import.meta.env (Vite-only),
 * we re-implement and test normalizeApiBase() and apiUrl() logic directly here
 * using the same algorithm, then verify it handles all VITE_API_BASE_URL variants.
 *
 * Run with: node --test tests/testApiConfig.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Mirror of the normalizeApiBase() function from frontend/src/apiConfig.js
// ---------------------------------------------------------------------------
function normalizeApiBase(raw) {
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

// ---------------------------------------------------------------------------
// Mirror of apiUrl() from frontend/src/apiConfig.js
// ---------------------------------------------------------------------------
function makeApiUrl(viteApiBaseUrl) {
  const normalizedBaseUrl = normalizeApiBase(viteApiBaseUrl);
  return function apiUrl(endpointPath) {
    const activeBaseUrl = normalizedBaseUrl;
    if (!endpointPath) return activeBaseUrl;
    const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
    if (activeBaseUrl.endsWith('/api') && cleanPath.startsWith('/api/')) {
      return `${activeBaseUrl}${cleanPath.slice(4)}`;
    }
    return `${activeBaseUrl}${cleanPath}`;
  };
}

// ---------------------------------------------------------------------------
// Tests: normalizeApiBase()
// ---------------------------------------------------------------------------
describe('normalizeApiBase()', () => {
  it('returns /api for falsy values', () => {
    assert.equal(normalizeApiBase(undefined), '/api');
    assert.equal(normalizeApiBase(null), '/api');
    assert.equal(normalizeApiBase(''), '/api');
    assert.equal(normalizeApiBase(false), '/api');
  });

  it('appends /api to bare HTTPS origin (production Render URL)', () => {
    assert.equal(
      normalizeApiBase('https://ripplecheck-api.onrender.com'),
      'https://ripplecheck-api.onrender.com/api'
    );
  });

  it('does NOT double-append /api when URL already ends with /api', () => {
    assert.equal(
      normalizeApiBase('https://ripplecheck-api.onrender.com/api'),
      'https://ripplecheck-api.onrender.com/api'
    );
  });

  it('strips trailing slashes before checking /api suffix', () => {
    assert.equal(
      normalizeApiBase('https://ripplecheck-api.onrender.com/api/'),
      'https://ripplecheck-api.onrender.com/api'
    );
    assert.equal(
      normalizeApiBase('https://ripplecheck-api.onrender.com///'),
      'https://ripplecheck-api.onrender.com/api'
    );
  });

  it('appends /api to bare HTTP localhost URL', () => {
    assert.equal(
      normalizeApiBase('http://127.0.0.1:3000'),
      'http://127.0.0.1:3000/api'
    );
  });

  it('preserves /api relative path unchanged (Vite dev proxy)', () => {
    assert.equal(normalizeApiBase('/api'), '/api');
  });

  it('preserves full Desktop URL that already includes /api', () => {
    assert.equal(
      normalizeApiBase('http://127.0.0.1:34567/api'),
      'http://127.0.0.1:34567/api'
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: apiUrl() with VITE_API_BASE_URL = bare origin (the production bug case)
// ---------------------------------------------------------------------------
describe('apiUrl() — VITE_API_BASE_URL is bare origin (https://ripplecheck-api.onrender.com)', () => {
  const apiUrl = makeApiUrl('https://ripplecheck-api.onrender.com');

  it('resolves /graph correctly', () => {
    assert.equal(
      apiUrl('/graph?projectId=sample-repo'),
      'https://ripplecheck-api.onrender.com/api/graph?projectId=sample-repo'
    );
  });

  it('resolves /projects correctly', () => {
    assert.equal(
      apiUrl('/projects'),
      'https://ripplecheck-api.onrender.com/api/projects'
    );
  });

  it('resolves /projects/upload correctly (the 404 bug)', () => {
    assert.equal(
      apiUrl('/projects/upload'),
      'https://ripplecheck-api.onrender.com/api/projects/upload'
    );
  });

  it('resolves /impact/... correctly', () => {
    assert.equal(
      apiUrl('/impact/src%2Findex.js?projectId=x'),
      'https://ripplecheck-api.onrender.com/api/impact/src%2Findex.js?projectId=x'
    );
  });

  it('resolves /query correctly', () => {
    assert.equal(
      apiUrl('/query'),
      'https://ripplecheck-api.onrender.com/api/query'
    );
  });

  it('resolves /health correctly', () => {
    assert.equal(
      apiUrl('/health'),
      'https://ripplecheck-api.onrender.com/api/health'
    );
  });

  it('never produces a URL without /api in the path', () => {
    const url = apiUrl('/projects/upload');
    assert.ok(url.includes('/api/'), `Expected /api/ in URL, got: ${url}`);
  });

  it('never produces double /api/api in URL', () => {
    const url = apiUrl('/projects/upload');
    assert.ok(!url.includes('/api/api'), `Double /api found in: ${url}`);
  });

  it('deduplicates if caller accidentally passes /api/ prefix', () => {
    // Callers should NOT pass /api prefix, but if they do, no duplication
    const url = apiUrl('/api/projects');
    assert.equal(url, 'https://ripplecheck-api.onrender.com/api/projects');
    assert.ok(!url.includes('/api/api'), `Double /api found in: ${url}`);
  });
});

// ---------------------------------------------------------------------------
// Tests: apiUrl() with VITE_API_BASE_URL already ending in /api
// ---------------------------------------------------------------------------
describe('apiUrl() — VITE_API_BASE_URL already includes /api suffix', () => {
  const apiUrl = makeApiUrl('https://ripplecheck-api.onrender.com/api');

  it('resolves /projects/upload without doubling /api', () => {
    assert.equal(
      apiUrl('/projects/upload'),
      'https://ripplecheck-api.onrender.com/api/projects/upload'
    );
  });

  it('resolves /graph without doubling /api', () => {
    assert.equal(
      apiUrl('/graph?projectId=test'),
      'https://ripplecheck-api.onrender.com/api/graph?projectId=test'
    );
  });

  it('deduplicates /api/projects path', () => {
    const url = apiUrl('/api/projects');
    assert.equal(url, 'https://ripplecheck-api.onrender.com/api/projects');
    assert.ok(!url.includes('/api/api'), `Double /api found in: ${url}`);
  });
});

// ---------------------------------------------------------------------------
// Tests: Vite dev proxy (no VITE_API_BASE_URL set → falls back to /api)
// ---------------------------------------------------------------------------
describe('apiUrl() — no VITE_API_BASE_URL (Vite dev proxy, relative /api)', () => {
  const apiUrl = makeApiUrl(undefined);

  it('resolves /graph as a relative URL', () => {
    assert.equal(apiUrl('/graph?projectId=test'), '/api/graph?projectId=test');
  });

  it('resolves /projects/upload as a relative URL', () => {
    assert.equal(apiUrl('/projects/upload'), '/api/projects/upload');
  });

  it('resolves /health as a relative URL', () => {
    assert.equal(apiUrl('/health'), '/api/health');
  });
});

// ---------------------------------------------------------------------------
// Tests: Desktop Edition dynamic backend URL
// ---------------------------------------------------------------------------
describe('apiUrl() — Desktop Edition dynamic backend (http://127.0.0.1:PORT/api)', () => {
  const apiUrl = makeApiUrl('http://127.0.0.1:34567/api');

  it('resolves /graph', () => {
    assert.equal(apiUrl('/graph?projectId=local-repo'), 'http://127.0.0.1:34567/api/graph?projectId=local-repo');
  });

  it('resolves /projects/upload', () => {
    assert.equal(apiUrl('/projects/upload'), 'http://127.0.0.1:34567/api/projects/upload');
  });

  it('no double /api', () => {
    const url = apiUrl('/projects');
    assert.ok(!url.includes('/api/api'), `Double /api found in: ${url}`);
  });
});

// ---------------------------------------------------------------------------
// Tests: Localhost dev server without /api in URL (auto-append scenario)
// ---------------------------------------------------------------------------
describe('apiUrl() — localhost dev without /api (auto-append)', () => {
  const apiUrl = makeApiUrl('http://localhost:3000');

  it('appends /api automatically to localhost origin', () => {
    assert.equal(apiUrl('/health'), 'http://localhost:3000/api/health');
  });

  it('resolves upload on localhost', () => {
    assert.equal(apiUrl('/projects/upload'), 'http://localhost:3000/api/projects/upload');
  });
});
