
(function () {
    'use strict';

    const retryButton =
        document.getElementById('retryConnection') ||
        document.getElementById('retry');

    const message = document.getElementById('offlineMsg');

    let redirecting = false;

    function retryConnection() {
        if (!navigator.onLine || redirecting) {
            return;
        }

        redirecting = true;

        if (message) {
            message.textContent =
                'Conexión restablecida. Volviendo a Ekko…';
        }

        window.location.assign(
            new URL('inicio', document.baseURI).href
        );
    }

    if (retryButton) {
        retryButton.addEventListener('click', function () {
            if (!navigator.onLine) {
                if (message) {
                    message.textContent =
                        'Todavía no tienes conexión. Comprueba tu red e inténtalo nuevamente.';
                }

                return;
            }

            retryConnection();
        });
    }

    window.addEventListener('online', function () {
        if (message) {
            message.textContent =
                'Conexión restablecida. Volviendo a Ekko…';
        }

        retryConnection();
    });

})();
