#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://katakatalab.com/writer-checker/';
const baseUrl = process.argv[2] || process.env.WRITER_CHECKER_BASE_URL || DEFAULT_BASE_URL;

function toAbsolute(pathOrUrl) {
    return new URL(pathOrUrl, baseUrl).toString();
}

async function fetchWithCheck(url, expectedType = null) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${url}`);
    }
    if (expectedType) {
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes(expectedType)) {
            throw new Error(`Unexpected content-type "${contentType}" for ${url}`);
        }
    }
    return res;
}

function findAsset(html, pattern, name) {
    const matched = html.match(pattern);
    if (!matched || !matched[1]) {
        throw new Error(`${name} not found in index.html`);
    }
    return matched[1];
}

async function main() {
    const indexUrl = toAbsolute('./');
    const indexRes = await fetchWithCheck(indexUrl, 'text/html');
    const html = await indexRes.text();

    const stylePath = findAsset(html, /<link[^>]+href="([^"]*style\.css\?v=[^"]+)"/i, 'style.css');
    const appPath = findAsset(html, /<script[^>]+src="([^"]*js\/app\.js\?v=[^"]+)"/i, 'app.js');

    const checks = [
        [toAbsolute(stylePath), 'text/css'],
        [toAbsolute(appPath), 'application/javascript'],
        [toAbsolute('js/UIManager.js'), 'application/javascript'],
        [toAbsolute('js/StorageManager.js'), 'application/javascript'],
        [toAbsolute('js/RuleEngine.js'), 'application/javascript'],
        [toAbsolute('js/PWAManager.js'), 'application/javascript'],
        [toAbsolute('manifest.json'), null],
        [toAbsolute('sw.js'), null],
        [toAbsolute('robots.txt'), 'text/plain'],
        [toAbsolute('sitemap.xml'), 'text/xml']
    ];

    for (const [url, type] of checks) {
        await fetchWithCheck(url, type);
        console.log(`OK ${url}`);
    }

    console.log('Production verify passed.');
}

main().catch((err) => {
    console.error(`Production verify failed: ${err.message}`);
    process.exit(1);
});
