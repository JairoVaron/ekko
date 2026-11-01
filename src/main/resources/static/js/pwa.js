/* pwa.js · instalación de la aplicación y registro del Service Worker */
(function () {
    'use strict';

    if (window.__ekkoPwaInitialized) { return; }
    window.__ekkoPwaInitialized = true;

    var deferredPrompt = null;
    var installed = false;

    var INSTALL_SELECTOR = '[data-ekko-install]';
    var STATE_SELECTOR = '[data-ekko-install-state]';
    var SW_META_SELECTOR = 'meta[name="ekko-sw"]';

    function isIOS() {
        return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
            (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    }

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    // Usa los avisos de Ekko (window.Ekko.toast); si no existen, un alert.
    function showMessage(title, message, type) {
        var E = window.Ekko;
        if (E && typeof E.toast === 'function') {
            E.toast({ type: type || 'info', title: title, text: message, duration: 7000 });
            return;
        }
        window.alert(title + '\n\n' + message);
    }

    function refresh() {
        if (isStandalone()) { installed = true; }

        var canInstallDirectly = Boolean(deferredPrompt);
        var showManualInstructions = isIOS() && !installed;

        document.querySelectorAll(INSTALL_SELECTOR).forEach(function (button) {
            var hide = installed || (!canInstallDirectly && !showManualInstructions);
            button.hidden = hide;
            if (hide) { button.setAttribute('aria-hidden', 'true'); } else { button.removeAttribute('aria-hidden'); }
        });

        document.querySelectorAll(STATE_SELECTOR).forEach(function (element) {
            element.textContent = installed
                ? 'Ekko ya está instalada en este dispositivo.'
                : canInstallDirectly
                    ? 'Instala Ekko directamente desde este botón.'
                    : showManualInstructions
                        ? 'Puedes añadir Ekko a la pantalla de inicio desde Safari.'
                        : 'La instalación estará disponible cuando el navegador la permita.';
        });
    }

    function showInstallInstructions() {
        if (isIOS()) {
            showMessage('Instalar Ekko',
                '1. Abre Ekko en Safari.\n2. Pulsa el botón Compartir.\n3. Elige «Añadir a pantalla de inicio».\n4. Confirma.',
                'info');
            return;
        }
        showMessage('Instalación no disponible ahora',
            'El navegador aún no ofrece instalar Ekko. Recarga la página e inténtalo de nuevo.',
            'info');
    }

    window.addEventListener('beforeinstallprompt', function (event) {
        event.preventDefault();
        deferredPrompt = event;
        installed = false;
        refresh();
    });

    window.addEventListener('appinstalled', function () {
        installed = true;
        deferredPrompt = null;
        refresh();
        showMessage('Ekko instalada', 'La aplicación se instaló correctamente.', 'success');
    });

    // prompt() se llama directamente desde el clic: no meter promesas antes.
    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!(target instanceof Element)) { return; }
        var button = target.closest(INSTALL_SELECTOR);
        if (!button) { return; }

        event.preventDefault();

        if (installed || isStandalone()) {
            installed = true;
            refresh();
            showMessage('Ekko ya está instalada', 'Ábrela desde el icono de la aplicación.', 'success');
            return;
        }

        if (!deferredPrompt) { showInstallInstructions(); return; }

        var promptEvent = deferredPrompt;
        deferredPrompt = null; // el evento no se puede reutilizar
        refresh();

        var promptPromise;
        try {
            promptPromise = promptEvent.prompt();
        } catch (error) {
            console.error('[Ekko PWA] No se pudo abrir el diálogo:', error);
            showMessage('No se pudo abrir la instalación', 'Recarga la página e inténtalo de nuevo.', 'error');
            refresh();
            return;
        }

        Promise.resolve(promptPromise)
            .then(function () { return promptEvent.userChoice; })
            .then(function (choice) {
                if (choice && choice.outcome === 'accepted') {
                    showMessage('Instalación aceptada', 'Espera a que el navegador termine el proceso.', 'success');
                }
            })
            .catch(function (error) {
                console.error('[Ekko PWA] Error durante la instalación:', error);
                showMessage('Error de instalación', 'Recarga la página y vuelve a intentarlo.', 'error');
            })
            .finally(refresh);
    });

    function getServiceWorkerUrl() {
        var meta = document.querySelector(SW_META_SELECTOR);
        return meta && meta.content && meta.content.trim() ? meta.content.trim() : '/sw.js';
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) { return; }
        var secure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!secure) { return; }

        window.addEventListener('load', function () {
            navigator.serviceWorker.register(getServiceWorkerUrl())
                .then(function (registration) {
                    registration.update().catch(function () { /* sin red: se reintenta luego */ });
                })
                .catch(function (error) { console.error('[Ekko PWA] Error registrando el Service Worker:', error); });
        });
    }

    function watchDisplayMode() {
        var query = window.matchMedia('(display-mode: standalone)');
        if (typeof query.addEventListener === 'function') { query.addEventListener('change', refresh); }
        else if (typeof query.addListener === 'function') { query.addListener(refresh); }
        window.addEventListener('pageshow', refresh);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { refresh(); } });
    }

    function init() {
        refresh();
        watchDisplayMode();
        registerServiceWorker();
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init, { once: true }); }
    else { init(); }
})();
