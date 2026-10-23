/* EKKO · Eliminar cuenta: el botón se activa al confirmar */
(() => {
    "use strict";
    const box = document.querySelector('input[name="confirmar"]');
    const btn = document.getElementById("deleteButton");
    if (!box || !btn) return;
    const sync = () => { btn.disabled = !box.checked; };
    box.addEventListener("change", sync);
    sync();
})();
