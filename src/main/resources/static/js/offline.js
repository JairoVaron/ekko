/* EKKO · Página sin conexión: reintenta sola al volver la red */
(function () {
    'use strict';
    var btn = document.getElementById('retry');
    var msg = document.getElementById('offlineMsg');
    function retry() { location.href = new URL('inicio', document.baseURI).href; }
    if (btn) { btn.addEventListener('click', retry); }
    window.addEventListener('online', function () { if (msg) { msg.textContent = 'Conexión restablecida. Volviendo…'; } setTimeout(retry, 600); });
})();
