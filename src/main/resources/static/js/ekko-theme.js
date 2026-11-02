/* ekko-theme.js · aplica el tema antes de pintar.
   Sin elección guardada: modo neón (oscuro). «auto» sigue al sistema. */
(function () {
    var tema = null;
    try { tema = localStorage.getItem('ekko-theme'); } catch (e) { /* almacenamiento bloqueado */ }
    if (tema === 'auto') {
        tema = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else if (tema !== 'light' && tema !== 'dark') {
        tema = 'dark';
    }
    document.documentElement.setAttribute('data-bs-theme', tema);
})();
