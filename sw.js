/** Writer Checker Service Worker */
const CACHE_VERSION = '20260805-usability-v1';
const STATIC_CACHE_NAME = `writer-checker-static-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `writer-checker-runtime-${CACHE_VERSION}`;

const APP_SHELL = [
    './', './index.html', './style.css', './style.min.css', './style-v3.css',
    './manifest.json', './robots.txt', './sitemap.xml',
    './js/app.js', './js/PWAManager.js', './js/UIManager.js', './js/StorageManager.js',
    './js/RuleEngine.js', './js/RuleSchema.js', './js/AnalyticsManager.js', './js/tokenizeWorker.js',
    './js/ui/UIShared.js', './js/ui/RuleSetUI.js', './js/ui/RuleEditorUI.js',
    './js/ui/AnalysisCoreUI.js', './js/ui/IssueViewUI.js', './js/ui/FixActionsUI.js',
    './js/ui/IOUI.js', './js/ui/ShellUI.js',
    './vendor/fontawesome/css/all.min.css',
    './vendor/fontawesome/webfonts/fa-solid-900.woff2',
    './vendor/fontawesome/webfonts/fa-regular-400.woff2',
    './vendor/fontawesome/webfonts/fa-brands-400.woff2',
    './icons/pwa-192.png', './icons/pwa-512.png', './icons/apple-touch-icon.png',
    './guide/', './terms/', './privacy/'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(STATIC_CACHE_NAME)
        .then((cache) => cache.addAll(APP_SHELL))
        .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys()
        .then((keys) => Promise.all(keys
            .filter((name) => name.startsWith('writer-checker-') && ![STATIC_CACHE_NAME, RUNTIME_CACHE_NAME].includes(name))
            .map((name) => caches.delete(name))))
        .then(() => self.clients.claim()));
});

async function networkFirst(request) {
    const cache = await caches.open(RUNTIME_CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response?.ok) cache.put(request, response.clone());
        return response;
    } catch {
        return (await cache.match(request)) || caches.match('./index.html', { ignoreSearch: true });
    }
}

async function staleWhileRevalidate(request) {
    const cached = await caches.match(request, { ignoreSearch: true });
    const cache = await caches.open(RUNTIME_CACHE_NAME);
    const updating = fetch(request).then((response) => {
        if (response?.ok) cache.put(request, response.clone());
        return response;
    }).catch(() => cached);
    return cached || updating;
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
        return;
    }
    if (['style', 'script', 'font', 'image'].includes(request.destination)
        || /\.(css|js|woff2|png|jpg|jpeg|svg|webp|json|xml|txt)$/i.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
