/* sw.js · Service Worker de Ekko */
'use strict';
const VERSION = 'ekko-v8';
const STATIC_CACHE = VERSION + '-static';
const RUNTIME_CACHE = VERSION + '-runtime';

const OFFLINE_URL = new URL('offline.html', self.registration.scope).href;

const PRECACHE = [
    'offline.html', 'manifest.json',
    'css/core.css', 'css/ekko-fx.css', 'css/layout.css', 'css/auth.css', 'css/home.css',
    'css/chat.css', 'css/contacts.css', 'css/account.css', 'css/offline.css',
    'js/ekko-theme.js', 'js/ekko.js', 'js/notificaciones.js', 'js/pwa.js', 'js/offline.js',
    'images/ekko-logo.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'
].map(path => new URL(path, self.registration.scope).href);

const ALLOWED_EXTERNAL_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => Promise.all(PRECACHE.map(url =>
                cache.add(new Request(url, { cache: 'reload', credentials: 'same-origin' }))
                    .catch(error => console.warn('[Ekko SW] No se pudo precargar:', url, error))
            )))
            .then(() => self.skipWaiting())
            .catch(error => { console.error('[Ekko SW] Error durante la instalación:', error); return self.skipWaiting(); })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(names.map(name => {
                const isEkko = name.startsWith('ekko-') || name.startsWith('ekko_');
                const isCurrent = name === STATIC_CACHE || name === RUNTIME_CACHE;
                return isEkko && !isCurrent ? caches.delete(name) : Promise.resolve(false);
            })))
            .then(() => self.clients.claim())
    );
});

const isSameOrigin = url => url.origin === self.location.origin;
const isAllowedExternalHost = url => ALLOWED_EXTERNAL_HOSTS.indexOf(url.hostname) !== -1;
const isStaticResource = url => {
    const p = url.pathname;
    return p.includes('/css/') || p.includes('/js/') || p.includes('/images/') || p.includes('/icons/') ||
        p.endsWith('/manifest.json') || p.endsWith('/favicon.ico');
};
const isMedia = url => url.pathname.includes('/images/') || url.pathname.includes('/icons/');
// Acepta respuestas del mismo origen y de CDN con CORS (no las opacas ni los errores)
const isCacheable = r => Boolean(r && r.status === 200 && (r.type === 'basic' || r.type === 'cors'));

function putInRuntime(request, response) {
    const copy = response.clone();
    return caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy)).then(() => response);
}

// Navegación: red primero; sin red, página offline
function networkFirst(request) {
    return fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(cached => cached || new Response(
            '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
            '<title>Ekko sin conexión</title></head><body><h1>Sin conexión</h1><p>No fue posible conectar con Ekko. Comprueba tu red e inténtalo de nuevo.</p></body></html>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        ))
    );
}

// Imágenes e iconos: caché primero
function cacheFirst(request) {
    return caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => isCacheable(res) ? putInRuntime(request, res) : res);
    });
}

// CSS, JS y manifiesto: sirve lo guardado y se actualiza en segundo plano
function staleWhileRevalidate(event) {
    const request = event.request;
    return caches.match(request).then(cached => {
        const network = fetch(request).then(res => isCacheable(res) ? putInRuntime(request, res) : res);
        if (cached) {
            event.waitUntil(network.catch(() => {}));
            return cached;
        }
        return network;
    });
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    // Las páginas HTML nunca se guardan: pueden contener datos privados
    if (request.mode === 'navigate') {
        if (isSameOrigin(url)) event.respondWith(networkFirst(request));
        return;
    }

    if (isSameOrigin(url)) {
        if (!isStaticResource(url)) return;
        event.respondWith(isMedia(url) ? cacheFirst(request) : staleWhileRevalidate(event));
        return;
    }

    if (isAllowedExternalHost(url) && isStaticResource(url)) {
        event.respondWith(staleWhileRevalidate(event));
    }
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

// Clic en una notificación del sistema: enfocar Ekko o abrirlo en la conversación
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const data = event.notification.data || {};
    const target = new URL(data.url || 'inicio', data.url ? self.location.origin : self.registration.scope).href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
            for (const client of windows) {
                if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
                    return client.focus().then(c => (c && 'navigate' in c ? c.navigate(target) : c));
                }
            }
            return self.clients.openWindow(target);
        })
    );
});
