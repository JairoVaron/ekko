/* offline.js · reintenta la navegación original */
(function () {
    'use strict';

    var retryButton = document.getElementById('retryConnection') || document.getElementById('retry');
    var message = document.getElementById('offlineMsg');
    var reloading = false;

    function say(text) { if (message) { message.textContent = text; } }

    // Esta página se muestra en lugar de la que falló; recargar vuelve a pedir esa misma dirección.
    function retry() {
        if (reloading) { return; }
        if (!navigator.onLine) {
            say('Todavía no tienes conexión. Comprueba tu red e inténtalo de nuevo.');
            return;
        }
        reloading = true;
        say('Conexión restablecida. Volviendo a Ekko…');
        window.location.reload();
    }

    if (retryButton) { retryButton.addEventListener('click', retry); }
    window.addEventListener('online', retry);
})();
