/**
 * Writer Checker — Service Worker
 * Cache-first for local, stale-while-revalidate for external.
 */

const CACHE_NAME = 'writer-checker-v1.2.0';
const ASSETS = [
    './',
    './index.html',
    './guide.html',
    './style.css',
    './js/app.js',
    './js/RuleEngine.js',
    './js/StorageManager.js',
    './js/UIManager.js',
    './manifest.json',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            caches.match('./index.html').then((cached) => cached || fetch(event.request))
        );
        return;
    }

    const url = new URL(event.request.url);
    const isExternal = url.origin !== self.location.origin;

    if (isExternal) {
        // Stale-while-revalidate for external resources (Google Fonts, FontAwesome)
        event.respondWith(
            caches.match(event.request).then((cached) => {
                const fetchPromise = fetch(event.request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                }).catch(() => cached || new Response('', { status: 503 }));
                return cached || fetchPromise;
            })
        );
        return;
    }

    // Cache-first for local assets
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).catch(() => {
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
                return new Response('', { status: 503, statusText: 'Offline' });
            });
        })
    );
});
