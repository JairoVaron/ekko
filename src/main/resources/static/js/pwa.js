/* =========================================================
   EKKO · PWA
   Instalación de la aplicación y service worker.
   Botones: [data-ekko-install]
   Estado:  [data-ekko-install-state]
   ========================================================= */
(function () {
    'use strict';

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

    var isIOS =
        /iphone|ipad|ipod/i.test(navigator.userAgent || '') ||
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
            return 'Ekko está lista para instalarse. Pulsa el botón.';
        }

        if (isIOS) {
            return 'En iPhone o iPad, pulsa Compartir y selecciona "Añadir a pantalla de inicio".';
        }

        return 'Si no aparece la instalación automática, abre el menú de Chrome y busca "Instalar Ekko" o "Instalar aplicación".';
    }

    function refresh() {
        var hideButton = installed || isStandalone();

        selectAll('[data-ekko-install]').forEach(function (button) {
            button.hidden = hideButton;
            button.setAttribute('aria-hidden', String(hideButton));
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

    function showInstallInstructions() {
        if (isIOS) {
            showMessage(
                'Instalar Ekko en iPhone o iPad',
                'Pulsa Compartir en el navegador y selecciona "Añadir a pantalla de inicio".'
            );
            return;
        }

        showMessage(
            'Instalar Ekko',
            'Si la instalación automática no está disponible, abre el menú de Chrome (⋮) y busca "Instalar Ekko" o "Instalar aplicación". Si esa opción tampoco aparece, comprueba que la aplicación cumple los requisitos de instalación del navegador.'
        );
    }

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

    document.addEventListener('click', function (event) {
        var target = event.target;

        var button = target && typeof target.closest === 'function'
            ? target.closest('[data-ekko-install]')
            : null;

        if (!button) {
            return;
        }

        event.preventDefault();

        if (isStandalone() || installed) {
            showMessage(
                'Ekko ya está instalada',
                'Puedes abrirla desde tu pantalla de inicio o menú de aplicaciones.'
            );
            return;
        }

        if (!deferredPrompt) {
            showInstallInstructions();
            return;
        }

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
                        'Instalación aceptada',
                        'El navegador ha aceptado la instalación de Ekko.'
                    );
                } else {
                    showMessage(
                        'Instalación cancelada',
                        'Puedes volver a intentarlo cuando quieras.'
                    );
                }
            })
            .catch(function (error) {
                console.error(
                    'No se pudo abrir la instalación de Ekko:',
                    error
                );

                showInstallInstructions();
            })
            .finally(function () {
                refresh();
            });
    });

    // Registrar el service worker únicamente en contextos seguros.
    var secure = window.isSecureContext ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1';

    if ('serviceWorker' in navigator && secure) {
        var meta = document.querySelector('meta[name="ekko-sw"]');
        var swUrl = meta
            ? meta.getAttribute('content')
            : '/sw.js';

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
                                    // No interrumpir la aplicación.
                                });
                            }
                        });
                    });

                    refresh();
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

    // Actualizar también cuando cambie el modo de visualización.
    if (window.matchMedia) {
        var displayMode = window.matchMedia('(display-mode: standalone)');

        if (typeof displayMode.addEventListener === 'function') {
            displayMode.addEventListener('change', refresh);
        }
    }

    refresh();
})();
