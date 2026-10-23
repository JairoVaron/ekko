/* EKKO · Contactos: recuerda la pestaña y enfoca la búsqueda */
(() => {
    "use strict";
    const tabs = Array.from(document.querySelectorAll('[data-bs-toggle="tab"]'));
    const search = document.getElementById("q");

    const wanted = location.hash && document.querySelector('[data-bs-target="' + location.hash + '"]');
    if (wanted && !document.querySelector("#tab-buscar.active") && window.bootstrap) {
        window.bootstrap.Tab.getOrCreateInstance(wanted).show();
    }

    tabs.forEach(btn => btn.addEventListener("shown.bs.tab", () => {
        history.replaceState(null, "", btn.getAttribute("data-bs-target"));
        if (btn.getAttribute("data-bs-target") === "#tab-buscar" && search) search.focus();
    }));

    if (search && search.value) search.setSelectionRange(search.value.length, search.value.length);
})();
