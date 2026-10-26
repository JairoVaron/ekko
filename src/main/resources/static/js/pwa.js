
(function () {
    'use strict';

    if (window.__ekkoPwaInitialized) {
        return;
    }

    window.__ekkoPwaInitialized = true;

    var deferredPrompt = null;
    var installed = false;
    var installButtons = [];
    var serviceWorkerRegistration = null;

    var INSTALL_SELECTOR = '[data-ekko-install]';
    var STATE_SELECTOR = '[data-ekko-install-state]';
    var SW_META_SELECTOR = 'meta[name="ekko-sw"]';

    /*
     * Detectar iOS y aplicaciones ya instaladas.
     */

    function isIOS() {
        return /iphone|ipad|ipod/i.test(
            window.navigator.userAgent
        ) || (
            window.navigator.platform === 'MacIntel' &&
            window.navigator.maxTouchPoints > 1
        );
    }

    function isStandalone() {
        return window.matchMedia(
            '(display-mode: standalone)'
        ).matches || window.navigator.standalone === true;
    }

    /*
     * Mostrar mensajes usando el sistema de Ekko,
     * si está disponible.
     */

    function showMessage(title, message, type) {
        try {
            if (
                window.E &&
                typeof window.E.toast === 'function'
            ) {
                window.E.toast(message, type || 'info');
                return;
            }
        } catch (error) {
            console.warn(
                '[Ekko PWA] No se pudo mostrar la notificación:',
                error
            );
        }

        window.alert(title + '\n\n' + message);
    }

    /*
     * Actualizar los botones y el estado de instalación.
     *
     * Android y Windows:
     * el botón solo aparece cuando existe deferredPrompt.
     *
     * iOS:
     * se permite mostrar el botón de instrucciones manuales.
     */

    function refresh() {
        if (isStandalone()) {
            installed = true;
        }

        var canInstallDirectly = Boolean(deferredPrompt);
        var showManualInstructions = isIOS() && !installed;

        installButtons = Array.prototype.slice.call(
            document.querySelectorAll(INSTALL_SELECTOR)
        );

        installButtons.forEach(function (button) {
            var shouldHide = installed ||
                (!canInstallDirectly && !showManualInstructions);

            button.hidden = shouldHide;

            if (shouldHide) {
                button.setAttribute('aria-hidden', 'true');
            } else {
                button.removeAttribute('aria-hidden');
            }
        });

        document.querySelectorAll(STATE_SELECTOR).forEach(
            function (element) {
                if (installed) {
                    element.textContent =
                        'Ekko ya está instalada en este dispositivo.';
                } else if (canInstallDirectly) {
                    element.textContent =
                        'Instala Ekko directamente desde este botón.';
                } else if (showManualInstructions) {
                    element.textContent =
                        'Puedes añadir Ekko a la pantalla de inicio desde Safari.';
                } else {
                    element.textContent =
                        'La instalación estará disponible cuando el navegador la permita.';
                }
            }
        );
    }

    /*
     * Instrucciones para navegadores sin instalación
     * directa mediante beforeinstallprompt.
     */

    function showInstallInstructions() {
        if (isIOS()) {
            showMessage(
                'Instalar Ekko',
                '1. Abre Ekko en Safari.\n' +
                '2. Pulsa el botón Compartir.\n' +
                '3. Selecciona "Añadir a pantalla de inicio".\n' +
                '4. Confirma la instalación.',
                'info'
            );

            return;
        }

        showMessage(
            'Instalación no disponible en este momento',
            'El navegador no ha proporcionado el diálogo de instalación ' +
            'a Ekko.\n\n' +
            'Recarga la página y vuelve a intentarlo. Si el problema ' +
            'continúa, revisa la sección Application > Manifest de las ' +
            'herramientas de desarrollador.',
            'info'
        );
    }

    /*
     * Evento de instalación de Chromium.
     *
     * Es el mismo mecanismo que utiliza NotaLab.
     * Guardamos el evento para consumirlo después del clic.
     */

    window.addEventListener(
        'beforeinstallprompt',
        function (event) {
            event.preventDefault();

            deferredPrompt = event;
            installed = false;

            console.info(
                '[Ekko PWA] beforeinstallprompt recibido.'
            );

            refresh();
        }
    );

    /*
     * El usuario completó la instalación.
     */

    window.addEventListener(
        'appinstalled',
        function () {
            installed = true;
            deferredPrompt = null;

            console.info(
                '[Ekko PWA] Ekko se instaló correctamente.'
            );

            refresh();

            showMessage(
                'Ekko instalada',
                'La aplicación se ha instalado correctamente.',
                'success'
            );
        }
    );

    /*
     * BOTÓN INSTALAR
     *
     * prompt() se llama directamente desde el clic.
     * No introducir una promesa antes de prompt().
     */

    document.addEventListener('click', function (event) {
        var target = event.target;

        if (!(target instanceof Element)) {
            return;
        }

        var button = target.closest(INSTALL_SELECTOR);

        if (!button) {
            return;
        }

        event.preventDefault();

        if (installed || isStandalone()) {
            installed = true;
            refresh();

            showMessage(
                'Ekko ya está instalada',
                'Puedes abrir Ekko desde el icono de la aplicación.',
                'success'
            );

            return;
        }

        /*
         * iOS no implementa beforeinstallprompt.
         * En ese caso se muestran las instrucciones de Safari.
         */

        if (!deferredPrompt) {
            showInstallInstructions();
            return;
        }

        var promptEvent = deferredPrompt;

        /*
         * El evento no se debe reutilizar.
         */

        deferredPrompt = null;
        refresh();

        var promptPromise;

        try {
            // Ejecutar directamente dentro de la interacción del usuario.
            promptPromise = promptEvent.prompt();
        } catch (error) {
            console.error(
                '[Ekko PWA] No se pudo abrir el diálogo:',
                error
            );

            showMessage(
                'No se pudo abrir la instalación',
                'Recarga la página e inténtalo de nuevo.',
                'error'
            );

            refresh();
            return;
        }

        Promise.resolve(promptPromise)
            .then(function () {
                return promptEvent.userChoice;
            })
            .then(function (choice) {
                if (
                    choice &&
                    choice.outcome === 'accepted'
                ) {
                    console.info(
                        '[Ekko PWA] El usuario aceptó instalar Ekko.'
                    );

                    showMessage(
                        'Instalación aceptada',
                        'El navegador ha aceptado instalar Ekko. ' +
                        'Espera a que finalice el proceso.',
                        'success'
                    );
                } else {
                    console.info(
                        '[Ekko PWA] El usuario canceló la instalación.'
                    );
                }
            })
            .catch(function (error) {
                console.error(
                    '[Ekko PWA] Error durante la instalación:',
                    error
                );

                showMessage(
                    'Error de instalación',
                    'No se pudo completar la solicitud. ' +
                    'Recarga la página y vuelve a intentarlo.',
                    'error'
                );
            })
            .finally(function () {
                refresh();
            });
    });

    /*
     * Obtener la ruta del Service Worker desde el HTML.
     */

    function getServiceWorkerUrl() {
        var meta = document.querySelector(SW_META_SELECTOR);

        if (meta && meta.content && meta.content.trim()) {
            return meta.content.trim();
        }

        return '/sw.js';
    }

    /*
     * Registrar el Service Worker sin alterar el backend.
     */

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.warn(
                '[Ekko PWA] Este navegador no admite Service Worker.'
            );
            return;
        }

        var isSecure = window.isSecureContext ||
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';

        if (!isSecure) {
            console.warn(
                '[Ekko PWA] Se necesita HTTPS para registrar el Service Worker.'
            );
            return;
        }

        window.addEventListener('load', function () {
            navigator.serviceWorker
                .register(getServiceWorkerUrl())
                .then(function (registration) {
                    serviceWorkerRegistration = registration;

                    console.info(
                        '[Ekko PWA] Service Worker registrado:',
                        registration.scope
                    );

                    registration.update().catch(function (error) {
                        console.warn(
                            '[Ekko PWA] No se pudo comprobar la actualización:',
                            error
                        );
                    });
                })
                .catch(function (error) {
                    console.error(
                        '[Ekko PWA] Error registrando el Service Worker:',
                        error
                    );
                });
        });
    }

    /*
     * Actualizar el estado si la aplicación pasa
     * de una pestaña a una ventana instalada.
     */

    function watchDisplayMode() {
        var query = window.matchMedia(
            '(display-mode: standalone)'
        );

        if (typeof query.addEventListener === 'function') {
            query.addEventListener('change', refresh);
        } else if (typeof query.addListener === 'function') {
            query.addListener(refresh);
        }

        window.addEventListener('pageshow', refresh);

        document.addEventListener(
            'visibilitychange',
            function () {
                if (!document.hidden) {
                    refresh();
                }
            }
        );
    }

    /*
     * Inicialización.
     */

    function init() {
        refresh();
        watchDisplayMode();
        registerServiceWorker();

        console.info('[Ekko PWA] Inicializada.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            init,
            { once: true }
        );
    } else {
        init();
    }
})();
