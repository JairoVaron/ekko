(function () {
    'use strict';

    /*
     * EKKO - Progressive Web App (PWA)
     */

    if (window.__ekkoPwaInitialized) {
        return;
    }

    window.__ekkoPwaInitialized = true;

    var deferredPrompt = null;
    var installed = false;
    var serviceWorkerRegistration = null;
    var updateNotificationShown = false;

    var INSTALL_SELECTOR = '[data-ekko-install]';
    var STATE_SELECTOR = '[data-ekko-install-state]';
    var SW_META_SELECTOR = 'meta[name="ekko-sw"]';

    /*
     * Detectar plataformas y modos de visualización.
     */

    function isIOS() {
        return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
            (
                window.navigator.platform === 'MacIntel' &&
                window.navigator.maxTouchPoints > 1
            );
    }

    function isStandalone() {
        return window.matchMedia(
            '(display-mode: standalone)'
        ).matches ||
            window.matchMedia(
                '(display-mode: minimal-ui)'
            ).matches ||
            window.navigator.standalone === true;
    }

    function isSecureContextSupported() {
        return window.isSecureContext ||
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';
    }

    /*
     * Mostrar mensajes.
     * Si Ekko dispone de un sistema de notificaciones,
     * se intenta utilizarlo. Si no, se usa alert().
     */

    function showMessage(title, message, type) {
        var fullMessage = title + '\n\n' + message;

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
                'No se pudo mostrar la notificación de Ekko:',
                error
            );
        }

        window.alert(fullMessage);
    }

    /*
     * Actualizar el estado visual del botón y del texto
     * informativo, sin ocultar el botón cuando el navegador
     * todavía no ofrece la instalación.
     */

    function refresh() {
        var standalone = isStandalone();

        if (standalone) {
            installed = true;
        }

        var installButtons = document.querySelectorAll(
            INSTALL_SELECTOR
        );

        installButtons.forEach(function (button) {
            var shouldHide = installed || standalone;

            button.hidden = shouldHide;
            button.setAttribute(
                'aria-hidden',
                shouldHide ? 'true' : 'false'
            );

            if (shouldHide) {
                button.setAttribute('aria-disabled', 'true');
            } else {
                button.removeAttribute('aria-disabled');
            }
        });

        var stateElements = document.querySelectorAll(
            STATE_SELECTOR
        );

        stateElements.forEach(function (element) {
            if (installed || standalone) {
                element.textContent = 'Ekko está instalada en este dispositivo.';
            } else if (deferredPrompt) {
                element.textContent = 'Ekko está lista para instalarse.';
            } else if (isIOS()) {
                element.textContent =
                    'Puedes instalar Ekko desde el menú Compartir de Safari.';
            } else {
                element.textContent =
                    'La instalación estará disponible cuando el navegador la permita.';
            }
        });
    }

    /*
     * Instrucciones manuales de instalación.
     */

    function showInstallInstructions() {
        var title = 'Cómo instalar Ekko';
        var message;

        if (isStandalone() || installed) {
            showMessage(
                'Ekko ya está instalada',
                'Puedes abrir Ekko desde el icono de la aplicación.',
                'success'
            );
            return;
        }

        if (isIOS()) {
            message =
                'Para instalar Ekko en tu iPhone o iPad:\n\n' +
                '1. Abre esta página en Safari.\n' +
                '2. Pulsa el botón Compartir.\n' +
                '3. Busca la opción "Añadir a pantalla de inicio".\n' +
                '4. Confirma la operación.\n\n' +
                'Si la opción no aparece, comprueba que estás ' +
                'usando Safari y que la página se ha cargado correctamente.';
        } else {
            message =
                'El navegador todavía no ha habilitado la instalación directa.\n\n' +
                'Puedes comprobar estas opciones:\n\n' +
                '1. Abre Ekko desde Chrome o Edge actualizado.\n' +
                '2. Abre el menú del navegador (⋮ o ⋯).\n' +
                '3. Busca "Instalar Ekko", "Instalar aplicación" ' +
                'o "Añadir a pantalla de inicio".\n' +
                '4. Si no aparece, recarga la página y vuelve a intentarlo.\n\n' +
                'Si la opción sigue sin aparecer, revisa que el sitio ' +
                'use HTTPS, que el manifiesto y sus iconos carguen ' +
                'correctamente y que el Service Worker esté activo.';
        }

        showMessage(title, message, 'info');
    }

    /*
     * Capturar la posibilidad real de instalación que ofrece
     * el navegador. No se puede fabricar este evento desde JS.
     */

    window.addEventListener(
        'beforeinstallprompt',
        function (event) {
            event.preventDefault();

            deferredPrompt = event;
            installed = false;

            console.info(
                '[Ekko PWA] El navegador permite instalar Ekko.'
            );

            refresh();
        }
    );

    /*
     * Detectar cuando el usuario termina de instalar la app.
     */

    window.addEventListener(
        'appinstalled',
        function () {
            installed = true;
            deferredPrompt = null;

            console.info(
                '[Ekko PWA] Instalación completada.'
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
     * Gestionar el botón de instalación.
     *
     * IMPORTANTE:
     * prompt() se ejecuta directamente dentro del evento de clic.
     * No se coloca dentro de Promise.then(), porque el navegador
     * puede exigir que la llamada ocurra durante la interacción
     * directa del usuario.
     */

    document.addEventListener('click', function (event) {
        var button = event.target.closest(INSTALL_SELECTOR);

        if (!button) {
            return;
        }

        event.preventDefault();

        if (installed || isStandalone()) {
            installed = true;
            refresh();

            showMessage(
                'Ekko ya está instalada',
                'Busca el icono de Ekko en tu dispositivo para abrirla.',
                'success'
            );

            return;
        }

        if (!deferredPrompt) {
            showInstallInstructions();
            refresh();
            return;
        }

        var promptEvent = deferredPrompt;

        /*
         * El evento de instalación solo se puede utilizar
         * una vez. Se espera un nuevo evento si fuera necesario.
         */

        deferredPrompt = null;
        refresh();

        var promptPromise;

        try {
            // Debe ejecutarse directamente como respuesta al clic.
            promptPromise = promptEvent.prompt();
        } catch (error) {
            console.error(
                '[Ekko PWA] No se pudo abrir el diálogo de instalación:',
                error
            );

            showInstallInstructions();
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
                    showMessage(
                        'Instalación aceptada',
                        'El navegador ha aceptado la instalación de Ekko. ' +
                        'Espera a que termine el proceso.',
                        'success'
                    );
                } else {
                    showMessage(
                        'Instalación cancelada',
                        'No se ha instalado Ekko. Puedes volver a intentarlo ' +
                        'cuando quieras.',
                        'info'
                    );
                }
            })
            .catch(function (error) {
                console.error(
                    '[Ekko PWA] Error durante la instalación:',
                    error
                );

                showInstallInstructions();
            })
            .finally(function () {
                refresh();
            });
    });

    /*
     * Obtener la ruta del Service Worker desde el fragmento
     * HTML. Si no existe la etiqueta, utilizar /sw.js.
     */

    function getServiceWorkerUrl() {
        var meta = document.querySelector(SW_META_SELECTOR);

        if (
            meta &&
            meta.content &&
            meta.content.trim()
        ) {
            return meta.content.trim();
        }

        return '/sw.js';
    }

    /*
     * Gestionar actualizaciones del Service Worker.
     */

    function watchForUpdates(registration) {
        registration.addEventListener(
            'updatefound',
            function () {
                var newWorker = registration.installing;

                if (!newWorker) {
                    return;
                }

                newWorker.addEventListener(
                    'statechange',
                    function () {
                        if (
                            newWorker.state === 'installed' &&
                            navigator.serviceWorker.controller &&
                            !updateNotificationShown
                        ) {
                            updateNotificationShown = true;

                            var reloadPage = window.confirm(
                                'Hay una nueva versión de Ekko disponible.\n\n' +
                                '¿Quieres recargar la página para actualizarla?'
                            );

                            if (reloadPage) {
                                window.location.reload();
                            } else {
                                updateNotificationShown = false;
                            }
                        }
                    }
                );
            }
        );
    }

    /*
     * Registrar el Service Worker.
     *
     * Esto habilita las funciones PWA y el funcionamiento
     * offline cuando los recursos y las rutas están preparados.
     */

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.warn(
                '[Ekko PWA] Este navegador no admite Service Workers.'
            );
            return;
        }

        if (!isSecureContextSupported()) {
            console.warn(
                '[Ekko PWA] El Service Worker requiere HTTPS ' +
                'o un entorno local compatible.'
            );
            return;
        }

        var serviceWorkerUrl = getServiceWorkerUrl();

        window.addEventListener('load', function () {
            navigator.serviceWorker
                .register(serviceWorkerUrl)
                .then(function (registration) {
                    serviceWorkerRegistration = registration;

                    console.info(
                        '[Ekko PWA] Service Worker registrado:',
                        registration.scope
                    );

                    watchForUpdates(registration);

                    /*
                     * Consultar si hay una nueva versión.
                     * No se fuerza la actualización en cada visita.
                     */

                    registration.update().catch(function (error) {
                        console.warn(
                            '[Ekko PWA] No se pudo comprobar si hay actualizaciones:',
                            error
                        );
                    });
                })
                .catch(function (error) {
                    console.error(
                        '[Ekko PWA] Error al registrar el Service Worker:',
                        error
                    );
                });
        });
    }

    /*
     * Actualizar el estado si el usuario cambia entre
     * la pestaña del navegador y la aplicación instalada.
     */

    function watchDisplayMode() {
        var standaloneQuery = window.matchMedia(
            '(display-mode: standalone)'
        );

        if (typeof standaloneQuery.addEventListener === 'function') {
            standaloneQuery.addEventListener('change', refresh);
        } else if (typeof standaloneQuery.addListener === 'function') {
            standaloneQuery.addListener(refresh);
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

        console.info('[Ekko PWA] Inicialización completada.');
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
