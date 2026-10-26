'use strict';

/*
 * EKKO - Service Worker
 */

const VERSION = 'ekko-v3';

const STATIC_CACHE = VERSION + '-static';
const RUNTIME_CACHE = VERSION + '-runtime';

const OFFLINE_URL = new URL(
    'offline.html',
    self.registration.scope
).href;

/*
 * Recursos locales de Ekko.
 */

const PRECACHE = [
    'offline.html',
    'manifest.json',

    // Hojas de estilo.
    'css/core.css',
    'css/ekko-fx.css',
    'css/layout.css',
    'css/auth.css',
    'css/home.css',
    'css/chat.css',
    'css/contacts.css',
    'css/account.css',
    'css/offline.css',

    // JavaScript.
    'js/ekko-theme.js',
    'js/ekko.js',
    'js/notificaciones.js',
    'js/pwa.js',
    'js/offline.js',

    // Imágenes e iconos.
    'images/ekko-logo.svg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png'
].map(function (path) {
    return new URL(path, self.registration.scope).href;
});

/*
 * Dominios externos cuyos recursos estáticos pueden
 * utilizar el caché cuando el navegador los solicite.
 *
 * No se almacenan aquí páginas HTML externas.
 */

const ALLOWED_EXTERNAL_HOSTS = [
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com'
];

/*
 * INSTALACIÓN
 *
 * Precarga de recursos.
 * Un recurso individual que falle no impide que el resto
 * se almacene ni que el Service Worker se instale.
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

                /*
                 * Intentar activar el Service Worker incluso
                 * si hubo un problema al preparar la caché.
                 */
                return self.skipWaiting();
            })
    );
});

/*
 * ACTIVACIÓN
 *
 * Eliminar únicamente las cachés antiguas que pertenecen
 * a Ekko. No borrar cachés de otras aplicaciones del mismo
 * origen.
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
 *
 * Intentar cargar la página desde el servidor.
 * Si no hay conexión o la solicitud falla, mostrar
 * offline.html como respaldo.
 *
 * No se guardan páginas de inicio de sesión, perfiles,
 * contactos ni conversaciones en la caché.
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
 *
 * Utilizar primero una copia almacenada.
 * Si no existe, solicitar el recurso a la red y guardar
 * únicamente respuestas válidas.
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
 *
 * Devolver inmediatamente la copia disponible mientras
 * se intenta actualizar desde la red.
 *
 * Se usa para los recursos estáticos solicitados que no
 * estén incluidos en la precarga inicial.
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
 *
 * Solo solicitudes GET.
 * Las solicitudes de API, autenticación y WebSocket
 * conservan su comportamiento normal de red.
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
