/**
 * Writer Checker Service Worker
 * - ナビゲーション: network-first
 * - 静的アセット: stale-while-revalidate
 */

const CACHE_VERSION = '20260306a';
const STATIC_CACHE_NAME = `writer-checker-static-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `writer-checker-runtime-${CACHE_VERSION}`;

const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './robots.txt',
    './sitemap.xml',
    './js/app.js',
    './js/PWAManager.js',
    './js/UIManager.js',
    './js/StorageManager.js',
    './js/RuleEngine.js',
    './vendor/fontawesome/css/all.min.css',
    './vendor/fontawesome/webfonts/fa-solid-900.woff2',
    './vendor/fontawesome/webfonts/fa-regular-400.woff2',
    './vendor/fontawesome/webfonts/fa-brands-400.woff2',
    './guide/',
    './terms/',
    './privacy/'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys
                .filter((name) => name.startsWith('writer-checker-') && ![STATIC_CACHE_NAME, RUNTIME_CACHE_NAME].includes(name))
                .map((name) => caches.delete(name))))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(request) {
    const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            runtimeCache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await runtimeCache.match(request);
        if (cached) return cached;
        return caches.match('./index.html', { ignoreSearch: true });
    }
}

async function staleWhileRevalidate(request) {
    const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
    const cached = await caches.match(request, { ignoreSearch: true });
    const fetchPromise = fetch(request).then((response) => {
        if (response && response.ok) {
            runtimeCache.put(request, response.clone());
        }
        return response;
    }).catch(() => cached);
    return cached || fetchPromise;
}

function isStaticAssetRequest(request) {
    if (request.destination === 'style' || request.destination === 'script' || request.destination === 'font') {
        return true;
    }
    const url = new URL(request.url);
    return /\.(css|js|woff2|png|jpg|jpeg|svg|webp|json|xml|txt)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
        return;
    }

    if (isStaticAssetRequest(request)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
