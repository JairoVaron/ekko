/* EKKO · inicio.js (perfil) */
(function () {
    'use strict';
    var E = window.Ekko || {};
    var say = function (type, text) { if (E.toast) { E.toast({ type: type, text: text }); } };

    function copy(text, okMessage) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                function () { say('success', okMessage); },
                function () { say('error', 'No se pudo copiar. Selecciónalo y cópialo a mano.'); }
            );
        } else {
            say('error', 'Tu navegador no permite copiar desde aquí.');
        }
    }

    // Copiar @usuario
    document.querySelectorAll('[data-copy-handle]').forEach(function (el) {
        el.addEventListener('click', function () {
            var text = el.getAttribute('data-copy-handle');
            copy(text, text + ' copiado. Compártelo para que te encuentren.');
        });
    });

    // Compartir: menú nativo del móvil; si no existe, copia el mensaje
    document.querySelectorAll('[data-share-handle]').forEach(function (el) {
        el.addEventListener('click', function () {
            var handle = el.getAttribute('data-share-handle');
            var message = 'Encuéntrame en Ekko: ' + handle;
            if (navigator.share) {
                navigator.share({ title: 'Ekko', text: message, url: location.origin }).catch(function () { /* cancelado */ });
            } else {
                copy(message + ' · ' + location.origin, 'Mensaje de invitación copiado.');
            }
        });
    });

    // Bienvenida (una vez por sesión)
    var welcomed = false;
    try { welcomed = sessionStorage.getItem('ekko-welcome') === '1'; sessionStorage.setItem('ekko-welcome', '1'); } catch (e) { /* noop */ }
    if (!welcomed && E.toast) {
        setTimeout(function () { E.toast({ type: 'success', title: 'Bienvenido a Ekko', text: 'Tus conversaciones están en Chats.', sound: 'splash' }); }, 500);
    }
})();
