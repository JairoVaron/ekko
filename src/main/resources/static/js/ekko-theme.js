/* ekko-theme.js · aplica el tema guardado antes de pintar la página */
(function () {
    var tema = null;
    try { tema = localStorage.getItem('ekko-theme'); } catch (e) { /* almacenamiento bloqueado */ }
    if (tema !== 'light' && tema !== 'dark') {
        tema = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-bs-theme', tema);
})();
