/* EKKO · Pantalla de inicio */
(function () {
    'use strict';
    var E = window.Ekko || {};

    // Saludo según la hora local
    var g = document.querySelector('[data-ekko-greeting]');
    if (g) {
        var h = new Date().getHours();
        g.textContent = h < 6 ? 'Buenas noches' : h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    }

    // Copiar @usuario al portapapeles
    var handle = document.querySelector('[data-copy-handle]');
    if (handle) {
        handle.addEventListener('click', function () {
            var text = handle.getAttribute('data-copy-handle');
            var done = function () { if (E.toast) { E.toast({ type: 'success', text: text + ' copiado. Compártelo para que te encuentren.' }); } };
            if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done); }
        });
    }

    // Bienvenida (una vez por sesión)
    var welcomed = false;
    try { welcomed = sessionStorage.getItem('ekko-welcome') === '1'; sessionStorage.setItem('ekko-welcome', '1'); } catch (e) { /* noop */ }
    if (!welcomed && E.toast) {
        setTimeout(function () { E.toast({ type: 'success', title: 'Bienvenido a Ekko', text: 'Tus conversaciones fluyen aquí.', sound: 'splash' }); }, 500);
    }
})();
