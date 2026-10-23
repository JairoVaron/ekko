/* =========================================================
   EKKO · PWA
   Registro del service worker e instalación de la aplicación.
   Botones: [data-ekko-install]
   Estado:   [data-ekko-install-state]
   ========================================================= */
(function () {
    'use strict';

    // Evita inicializar el módulo más de una vez.
    if (window.__ekkoPwaInitialized) {
        return;
    }
    window.__ekkoPwaInitialized = true;

    var E = window.Ekko || {};
    var deferredPrompt = null;
    var installed = false;

    var selectAll = function (selector) {
        return Array.prototype.slice.call(
            document.querySelectorAll(selector)
        );
    };

    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || '') ||
        (/macintosh/i.test(navigator.userAgent || '') &&
            navigator.maxTouchPoints > 1);

    function isStandalone() {
        return (
            (window.matchMedia &&
                window.matchMedia('(display-mode: standalone)').matches) ||
            window.navigator.standalone === true
        );
    }

    function stateText() {
        if (installed || isStandalone()) {
            return 'Ekko ya está instalada en este dispositivo.';
        }

        if (deferredPrompt) {
            return 'Instala Ekko para abrirla como una aplicación.';
        }

        if (isIOS) {
            return 'En iPhone o iPad: pulsa Compartir y selecciona "Añadir a pantalla de inicio".';
        }

        return 'Si tu navegador lo permite, abre su menú y busca "Instalar Ekko" o "Instalar aplicación".';
    }

    function refresh() {
        var standalone = isStandalone();
        var canShowButton = !standalone && !installed &&
            (Boolean(deferredPrompt) || isIOS);

        selectAll('[data-ekko-install]').forEach(function (button) {
            button.hidden = !canShowButton;
        });

        selectAll('[data-ekko-install-state]').forEach(function (element) {
            element.textContent = stateText();
        });
    }

    function showMessage(title, message) {
        if (typeof E.toast === 'function') {
            E.toast({
                type: 'info',
                title: title,
                text: message,
                duration: 9000
            });
        } else {
            window.alert(title + '\n\n' + message);
        }
    }

    // El navegador ofrece la instalación cuando se cumplen sus requisitos.
    window.addEventListener('beforeinstallprompt', function (event) {
        event.preventDefault();
        deferredPrompt = event;
        refresh();
    });

    window.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        installed = true;
        refresh();

        if (typeof E.toast === 'function') {
            E.toast({
                type: 'success',
                title: 'Ekko instalada',
                text: 'Ya puedes abrirla desde tu pantalla de inicio.'
            });
        }
    });

    // Botones de instalación, incluso si hay más de uno en la página.
    document.addEventListener('click', function (event) {
        var target = event.target;
        var button = target && typeof target.closest === 'function'
            ? target.closest('[data-ekko-install]')
            : null;

        if (!button) {
            return;
        }

        if (isStandalone() || installed) {
            showMessage(
                'Ekko ya está instalada',
                'Puedes abrirla desde tu pantalla de inicio o menú de aplicaciones.'
            );
            return;
        }

        if (!deferredPrompt) {
            showMessage('Instalar Ekko', stateText());
            return;
        }

        // Consumir la referencia evita intentar usar el mismo evento dos veces.
        var promptEvent = deferredPrompt;
        deferredPrompt = null;
        refresh();

        Promise.resolve()
            .then(function () {
                return promptEvent.prompt();
            })
            .then(function () {
                return promptEvent.userChoice;
            })
            .then(function (choice) {
                if (choice && choice.outcome === 'accepted') {
                    showMessage(
                        'Instalación solicitada',
                        'Sigue las indicaciones del navegador para terminar.'
                    );
                }
            })
            .catch(function (error) {
                console.warn('No se pudo abrir la instalación de Ekko.', error);
                showMessage(
                    'No se pudo abrir la instalación',
                    'Prueba desde el menú de tu navegador.'
                );
            })
            .finally(function () {
                refresh();
            });
    });

    // Registro del service worker.
    var secure = window.isSecureContext ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1';

    if ('serviceWorker' in navigator && secure) {
        var meta = document.querySelector('meta[name="ekko-sw"]');
        var swUrl = meta ? meta.getAttribute('content') : '/sw.js';

        window.addEventListener('load', function () {
            navigator.serviceWorker.register(swUrl)
                .then(function (registration) {
                    console.info(
                        'Service worker de Ekko registrado:',
                        registration.scope
                    );

                    registration.addEventListener('updatefound', function () {
                        var worker = registration.installing;

                        if (!worker) {
                            return;
                        }

                        worker.addEventListener('statechange', function () {
                            if (
                                worker.state === 'installed' &&
                                navigator.serviceWorker.controller &&
                                typeof E.confirm === 'function'
                            ) {
                                E.confirm({
                                    title: 'Hay una versión nueva',
                                    text: 'Actualiza Ekko para ver las últimas mejoras.',
                                    okText: 'Actualizar'
                                }).then(function (confirmed) {
                                    if (confirmed) {
                                        window.location.reload();
                                    }
                                }).catch(function () {
                                    // No interrumpir la aplicación si se cancela.
                                });
                            }
                        });
                    });
                })
                .catch(function (error) {
                    console.error(
                        'No se pudo registrar el service worker de Ekko:',
                        error
                    );
                });
        });
    } else {
        console.warn(
            'La PWA necesita HTTPS o localhost para registrar el service worker.'
        );
    }

    refresh();
})();
