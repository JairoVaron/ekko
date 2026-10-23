/* Aplica tema y modo de efectos antes de pintar la página (evita parpadeos). */
(function () {
    var root = document.documentElement, tema = null, fx = null;
    try { tema = localStorage.getItem('ekko-theme'); fx = localStorage.getItem('ekko-fx'); } catch (e) { /* almacenamiento bloqueado */ }
    if (tema !== 'light' && tema !== 'dark') {
        tema = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    root.setAttribute('data-bs-theme', tema);

    // Modo ligero automático en equipos modestos o con ahorro de datos (el usuario puede forzarlo en Configuración)
    var c = navigator.connection || {};
    var debil = c.saveData === true || (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
    if (fx === 'off' || (fx !== 'on' && debil)) { root.classList.add('ek-lite'); }
})();
