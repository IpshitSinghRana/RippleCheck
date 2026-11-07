// -----------------------------------------------------------------------------
// tests/testCors.test.js — Production CORS Security & Normalization Test Suite
//
// Verifies:
// 1. Confirmed production Vercel origin ('https://ripplecheck-pink.vercel.app') is accepted.
// 2. OPTIONS preflight requests return appropriate CORS headers and status.
// 3. GET, POST, and other HTTP methods work with credentials.
// 4. Localhost and 127.0.0.1 development ports are accepted.
// 5. Normalization handles trailing slashes, surrounding quotes, whitespace, and case.
// 6. Malicious and untrusted origins receive HTTP 403 Forbidden.
// 7. Untrusted requests are blocked before executing application route handlers.
// 8. No wildcard '*' Access-Control-Allow-Origin header is ever returned.
// 9. Requests without Origin header (curl, server-to-server, loopback) are preserved.
// -----------------------------------------------------------------------------

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Load server
const app = require('../server');

describe('Production CORS Security & Origin Normalization', () => {
    let server;
    let baseUrl;

    before((t, done) => {
        // Start ephemeral HTTP listener
        server = app.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            done();
        });
    });

    after((t, done) => {
        if (server) {
            server.close(done);
        } else {
            done();
        }
    });

    // Helper to issue raw HTTP requests with specific Origin and headers
    function sendRequest({ method = 'GET', path = '/api/health', origin = null, headers = {}, body = null }) {
        return new Promise((resolve, reject) => {
            const reqHeaders = { ...headers };
            if (origin !== null) {
                reqHeaders['Origin'] = origin;
            }
            const urlObj = new URL(path, baseUrl);
            const req = http.request(urlObj, {
                method,
                headers: reqHeaders
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                });
            });
            req.on('error', reject);
            if (body) {
                req.write(body);
            }
            req.end();
        });
    }

    test('1. Normalization helper: trims quotes, whitespace, trailing slashes, and lowercases', () => {
        const { normalizeOrigin, parseAllowedOrigins, isOriginAllowed } = app._corsHelpers;

        assert.equal(normalizeOrigin('  https://example.com/  '), 'https://example.com');
        assert.equal(normalizeOrigin('"https://example.com/"'), 'https://example.com');
        assert.equal(normalizeOrigin("'https://EXAMPLE.com/'"), 'https://example.com');
        assert.equal(normalizeOrigin('https://example.com///'), 'https://example.com');

        // Test parseAllowedOrigins with multiple comma-separated origins with quotes, whitespace, and trailing slashes
        const dirtyInput = ' "https://foo.com/",  https://bar.org/  , \'https://BAZ.NET/\' , "https://trailing-slashes.org///" ';
        const parsed = parseAllowedOrigins(dirtyInput);
        assert.ok(parsed.includes('https://ripplecheck-pink.vercel.app'), 'Must include production Vercel default');
        assert.ok(parsed.includes('https://foo.com'), 'Must normalize and include foo.com');
        assert.ok(parsed.includes('https://bar.org'), 'Must normalize and include bar.org');
        assert.ok(parsed.includes('https://baz.net'), 'Must lowercase and include baz.net');
        assert.ok(parsed.includes('https://trailing-slashes.org'), 'Must strip multiple trailing slashes');
    });

    test('2. Production Vercel Origin: GET request succeeds and returns exact CORS origin header', async () => {
        const res = await sendRequest({
            method: 'GET',
            path: '/api/health',
            origin: 'https://ripplecheck-pink.vercel.app'
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['access-control-allow-origin'], 'https://ripplecheck-pink.vercel.app');
        assert.equal(res.headers['access-control-allow-credentials'], 'true');
        assert.notEqual(res.headers['access-control-allow-origin'], '*');
    });

    test('2b. Production Vercel Origin: POST request succeeds and returns exact CORS origin header', async () => {
        const postData = JSON.stringify({ query: 'health-check' });
        const res = await sendRequest({
            method: 'POST',
            path: '/api/ai/provider',
            origin: 'https://ripplecheck-pink.vercel.app',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            body: postData
        });

        // Any non-403 response confirms CORS check passed through to application route
        assert.notEqual(res.statusCode, 403, 'CORS must not reject POST from production Vercel origin');
        assert.equal(res.headers['access-control-allow-origin'], 'https://ripplecheck-pink.vercel.app');
        assert.equal(res.headers['access-control-allow-credentials'], 'true');
        assert.notEqual(res.headers['access-control-allow-origin'], '*');
    });

    test('3. Production Vercel Origin: OPTIONS preflight succeeds with correct CORS headers', async () => {
        const res = await sendRequest({
            method: 'OPTIONS',
            path: '/api/health',
            origin: 'https://ripplecheck-pink.vercel.app',
            headers: {
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type, Authorization'
            }
        });

        assert.equal(res.statusCode, 204);
        assert.equal(res.headers['access-control-allow-origin'], 'https://ripplecheck-pink.vercel.app');
        assert.equal(res.headers['access-control-allow-credentials'], 'true');
        assert.ok(res.headers['access-control-allow-methods'].includes('POST'));
        assert.ok(res.headers['access-control-allow-headers'].toLowerCase().includes('authorization'));
        assert.notEqual(res.headers['access-control-allow-origin'], '*');
    });

    test('4. Localhost and loopback origins are permitted for development', async () => {
        const devOrigins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:3999'
        ];

        for (const origin of devOrigins) {
            const res = await sendRequest({
                method: 'GET',
                path: '/api/health',
                origin
            });
            assert.equal(res.statusCode, 200, `Failed for dev origin: ${origin}`);
            assert.equal(res.headers['access-control-allow-origin'], origin);
        }
    });

    test('5. Untrusted origin is rejected with HTTP 403 Forbidden and no CORS headers', async () => {
        const untrustedOrigin = 'https://malicious-site.com';
        const res = await sendRequest({
            method: 'GET',
            path: '/api/health',
            origin: untrustedOrigin
        });

        assert.equal(res.statusCode, 403);
        assert.equal(res.headers['access-control-allow-origin'], undefined);
        const body = JSON.parse(res.body);
        assert.ok(body.error.includes('Forbidden'));
    });

    test('6. Untrusted origin OPTIONS preflight is rejected with HTTP 403 and blocks route execution', async () => {
        const untrustedOrigin = 'https://attacker.evil.org';
        const res = await sendRequest({
            method: 'OPTIONS',
            path: '/api/graph?projectId=sample-repo',
            origin: untrustedOrigin,
            headers: {
                'Access-Control-Request-Method': 'GET'
            }
        });

        assert.equal(res.statusCode, 403);
        assert.equal(res.headers['access-control-allow-origin'], undefined);
    });

    test('7. Requests without Origin header are allowed (direct curl / server / desktop IPC)', async () => {
        const res = await sendRequest({
            method: 'GET',
            path: '/api/health',
            origin: null
        });

        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.status, 'ok');
    });

    test('8. Case sensitivity: Origin with mixed case is normalized and accepted', async () => {
        const res = await sendRequest({
            method: 'GET',
            path: '/api/health',
            origin: 'HTTPS://RIPPLECHECK-PINK.VERCEL.APP'
        });

        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['access-control-allow-origin'], 'HTTPS://RIPPLECHECK-PINK.VERCEL.APP');
    });
});

