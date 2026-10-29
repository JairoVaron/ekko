'use strict';
const VERSION = 'ekko-v3';

const STATIC_CACHE = VERSION + '-static';
const RUNTIME_CACHE = VERSION + '-runtime';

const OFFLINE_URL = new URL(
    'offline.html',
    self.registration.scope
).href;

/*
 * Recursos locales
 */
const PRECACHE = [
    'offline.html',
    'manifest.json',

    'css/core.css',
    'css/ekko-fx.css',
    'css/layout.css',
    'css/auth.css',
    'css/home.css',
    'css/chat.css',
    'css/contacts.css',
    'css/account.css',
    'css/offline.css',

    'js/ekko-theme.js',
    'js/ekko.js',
    'js/notificaciones.js',
    'js/pwa.js',
    'js/offline.js',

    'images/ekko-logo.svg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png'
].map(function (path) {
    return new URL(path, self.registration.scope).href;
});

const ALLOWED_EXTERNAL_HOSTS = [
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com'
];

/*
 * INSTALACIÓN
 */
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(function (cache) {
                return Promise.all(
                    PRECACHE.map(function (url) {
                        return cache.add(
                            new Request(url, {
                                cache: 'reload',
                                credentials: 'same-origin'
                            })
                        ).catch(function (error) {
                            console.warn(
                                '[Ekko SW] No se pudo precargar:',
                                url,
                                error
                            );
                        });
                    })
                );
            })
            .then(function () {
                return self.skipWaiting();
            })
            .catch(function (error) {
                console.error(
                    '[Ekko SW] Error durante la instalación:',
                    error
                );
                return self.skipWaiting();
            })
    );
});

/*
 * ACTIVACIÓN
 */
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (cacheNames) {
                return Promise.all(
                    cacheNames.map(function (cacheName) {
                        const isEkkoCache =
                            cacheName.startsWith('ekko-') ||
                            cacheName.startsWith('ekko_');

                        const isCurrentCache =
                            cacheName === STATIC_CACHE ||
                            cacheName === RUNTIME_CACHE;

                        if (isEkkoCache && !isCurrentCache) {
                            return caches.delete(cacheName);
                        }

                        return Promise.resolve(false);
                    })
                );
            })
            .then(function () {
                return self.clients.claim();
            })
            .then(function () {
                console.info(
                    '[Ekko SW] Service Worker activado:',
                    VERSION
                );
            })
    );
});

/*
 * UTILIDADES
 */
function isSameOrigin(url) {
    return url.origin === self.location.origin;
}

function isAllowedExternalHost(url) {
    return ALLOWED_EXTERNAL_HOSTS.indexOf(url.hostname) !== -1;
}

function isStaticResource(url) {
    const path = url.pathname;

    return (
        path.includes('/css/') ||
        path.includes('/js/') ||
        path.includes('/images/') ||
        path.includes('/icons/') ||
        path.endsWith('/manifest.json') ||
        path.endsWith('/favicon.ico')
    );
}

function isNavigationRequest(request) {
    return request.mode === 'navigate';
}

function isCacheableResponse(response) {
    return Boolean(
        response &&
        response.status === 200 &&
        response.type === 'basic'
    );
}

/*
 * NAVEGACIÓN: NETWORK-FIRST
 */
function networkFirst(request) {
    return fetch(request)
        .catch(function (error) {
            console.warn(
                '[Ekko SW] Falló la navegación de red:',
                error
            );

            return caches.match(OFFLINE_URL)
                .then(function (offlineResponse) {
                    if (offlineResponse) {
                        return offlineResponse;
                    }

                    return new Response(
                        '<!doctype html>' +
                        '<html lang="es">' +
                        '<head>' +
                        '<meta charset="utf-8">' +
                        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
                        '<title>Ekko sin conexión</title>' +
                        '</head>' +
                        '<body>' +
                        '<h1>Sin conexión</h1>' +
                        '<p>No ha sido posible conectar con Ekko.</p>' +
                        '<p>Comprueba tu conexión e inténtalo de nuevo.</p>' +
                        '</body>' +
                        '</html>',
                        {
                            status: 200,
                            headers: {
                                'Content-Type': 'text/html; charset=utf-8'
                            }
                        }
                    );
                });
        });
}

/*
 * RECURSOS ESTÁTICOS: CACHE-FIRST
 */
function cacheFirst(request) {
    return caches.match(request)
        .then(function (cachedResponse) {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(request)
                .then(function (networkResponse) {
                    if (!isCacheableResponse(networkResponse)) {
                        return networkResponse;
                    }

                    const responseToReturn = networkResponse.clone();

                    return caches.open(RUNTIME_CACHE)
                        .then(function (cache) {
                            return cache.put(
                                request,
                                responseToReturn
                            ).then(function () {
                                return networkResponse;
                            });
                        });
                });
        });
}

/*
 * RECURSOS ESTÁTICOS: STALE-WHILE-REVALIDATE
 */
function staleWhileRevalidate(request) {
    return caches.match(request)
        .then(function (cachedResponse) {
            const networkPromise = fetch(request)
                .then(function (networkResponse) {
                    if (!isCacheableResponse(networkResponse)) {
                        return networkResponse;
                    }

                    const responseToReturn = networkResponse.clone();

                    return caches.open(RUNTIME_CACHE)
                        .then(function (cache) {
                            return cache.put(
                                request,
                                responseToReturn
                            ).then(function () {
                                return networkResponse;
                            });
                        });
                });

            if (cachedResponse) {
                /*
                 * No bloquear la respuesta almacenada por
                 * una actualización de red que falle.
                 */
                networkPromise.catch(function (error) {
                    console.warn(
                        '[Ekko SW] No se pudo actualizar el recurso:',
                        request.url,
                        error
                    );
                });

                return cachedResponse;
            }

            return networkPromise;
        });
}

/*
 * INTERCEPTAR SOLICITUDES
 */
self.addEventListener('fetch', function (event) {
    const request = event.request;

    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);

    /*
     * No interceptar protocolos que no sean HTTP/HTTPS.
     */
    if (
        url.protocol !== 'http:' &&
        url.protocol !== 'https:'
    ) {
        return;
    }

    /*
     * Navegaciones internas: red primero.
     *
     * No se almacenan documentos HTML que puedan contener
     * datos privados del usuario.
     */

    if (isNavigationRequest(request)) {
        if (isSameOrigin(url)) {
            event.respondWith(networkFirst(request));
        }

        return;
    }

    /*
     * Recursos del mismo origen: gestionar únicamente
     * recursos estáticos.
     */

    if (isSameOrigin(url)) {
        if (!isStaticResource(url)) {
            return;
        }

        /*
         * Recursos incluidos en la precarga:
         * utilizar caché primero.
         */
        if (PRECACHE.indexOf(url.href) !== -1) {
            event.respondWith(cacheFirst(request));
            return;
        }

        /*
         * Recursos estáticos adicionales:
         * caché con actualización en segundo plano.
         */
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    /*
     * Recursos estáticos de CDN permitidos.
     *
     * No se cachean respuestas opacas ni errores HTTP.
     */

    if (isAllowedExternalHost(url) && isStaticResource(url)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});

/*
 * MENSAJES
 *
 * Permite solicitar la activación inmediata desde una
 * página que explícitamente envíe SKIP_WAITING.
 */

self.addEventListener('message', function (event) {
    if (
        event.data &&
        event.data.type === 'SKIP_WAITING'
    ) {
        event.waitUntil(self.skipWaiting());
    }
});
