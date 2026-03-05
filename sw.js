/**
 * Writer Checker — Service Worker v1.4.0
 * Network-first for navigation, stale-while-revalidate for local/external assets.
 */

const CACHE_NAME = 'writer-checker-v1.4.0';
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
    // ナビゲーション (ページ読み込み) → Network-first
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // 成功したらキャッシュも更新
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => {
                    // オフライン時のみキャッシュから返す
                    return caches.match(event.request)
                        .then((cached) => cached || caches.match('./index.html'))
                        .then((fallback) => fallback || new Response('Offline', { status: 503 }));
                })
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
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                }).catch(() => cached || new Response('', { status: 503 }));
                return cached || fetchPromise;
            })
        );
        return;
    }

    // ローカルアセット → Stale-while-revalidate (常に最新を取得しつつキャッシュも返す)
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fetchPromise = fetch(event.request).then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                if (cached) return cached;
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
                return new Response('', { status: 503, statusText: 'Offline' });
            });
            return cached || fetchPromise;
        })
    );
});
