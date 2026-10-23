/* =========================================================
   EKKO · Service Worker
   - Las páginas HTML siempre consultan la red.
   - Si no hay conexión, muestra offline.html.
   - Los recursos estáticos usan stale-while-revalidate.
   - No almacena conversaciones ni respuestas privadas.
   ========================================================= */

const VERSION = 'ekko-v2';
const STATIC_CACHE = VERSION + '-static';
const RUNTIME_CACHE = VERSION + '-runtime';
const BASE = self.registration.scope;

const url = function (path) {
    return new URL(path, BASE).href;
};

const PRECACHE = [
    'offline.html',
    'css/ekko.css',
    'css/offline.css',
    'js/ekko-theme.js',
    'js/offline.js',
    'images/ekko-logo.svg',
    'icons/icon-192.png',
    'manifest.json'
].map(url);

const CDN_HOSTS = [
    'cdn.jsdelivr.net',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

const STATIC_PREFIXES = [
    'css/',
    'js/',
    'images/',
    'icons/'
].map(url);

STATIC_PREFIXES.push(url('manifest.json'));

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(function (cache) {
                // Cada recurso se intenta guardar individualmente.
                return Promise.all(
                    PRECACHE.map(function (resource) {
                        return cache.add(resource).catch(function (error) {
                            console.warn(
                                'No se pudo precargar el recurso:',
                                resource,
                                error
                            );
                        });
                    })
                );
            })
            .then(function () {
                return self.skipWaiting();
            })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(
                    keys
                        .filter(function (key) {
                            return !key.startsWith(VERSION);
                        })
                        .map(function (key) {
                            return caches.delete(key);
                        })
                );
            })
            .then(function () {
                return self.clients.claim();
            })
    );
});

function staleWhileRevalidate(request) {
    return caches.open(RUNTIME_CACHE).then(function (cache) {
        return cache.match(request).then(function (cached) {
            var network = fetch(request)
                .then(function (response) {
                    if (
                        response &&
                        (response.ok || response.type === 'opaque')
                    ) {
                        cache.put(request, response.clone()).catch(function () {
                            // La aplicación puede seguir usando la respuesta.
                        });
                    }

                    return response;
                })
                .catch(function () {
                    return cached;
                });

            return cached || network;
        });
    });
}

self.addEventListener('fetch', function (event) {
    var request = event.request;

    if (request.method !== 'GET') {
        return;
    }

    var target = new URL(request.url);

    // No interceptar WebSocket ni solicitudes a otros orígenes,
    // salvo los CDN estáticos permitidos más abajo.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(function () {
                return caches.match(url('offline.html'))
                    .then(function (offlinePage) {
                        return offlinePage || new Response(
                            'No hay conexión. Vuelve a intentarlo cuando tengas internet.',
                            {
                                status: 503,
                                headers: {
                                    'Content-Type': 'text/plain; charset=utf-8'
                                }
                            }
                        );
                    });
            })
        );
        return;
    }

    var sameOriginStatic =
        target.origin === self.location.origin &&
        STATIC_PREFIXES.some(function (prefix) {
            return request.url.startsWith(prefix);
        });

    var cdn = CDN_HOSTS.includes(target.hostname);

    if (sameOriginStatic || cdn) {
        event.respondWith(staleWhileRevalidate(request));
    }

    // Las demás solicitudes siguen su comportamiento normal.
});

self.addEventListener('message', function (event) {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
