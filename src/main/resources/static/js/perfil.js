/* EKKO · Editar perfil: vista previa en vivo y contador */
(() => {
    "use strict";
    const $ = id => document.getElementById(id);
    const name = $("displayName"), bio = $("bio"), url = $("avatarUrl");
    const pName = $("previewName"), pBio = $("previewBio"), pImg = $("previewAvatar"), count = $("bioCount");
    if (!name || !bio || !url || !pImg) return;

    const fallback = pImg.dataset.fallback;
    const fallbackName = pName.dataset.fallbackName || "Tu nombre";

    function render() {
        pName.textContent = name.value.trim() || fallbackName;
        pBio.textContent = bio.value.trim() || "Aquí aparecerá tu biografía.";
        count.textContent = bio.value.length + "/500";
    }

    let timer = null;
    function renderAvatar() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const v = url.value.trim();
            const ok = /^https?:\/\/\S+$/i.test(v);
            const next = ok ? v : fallback;
            if (pImg.getAttribute("src") !== next) pImg.setAttribute("src", next);
        }, 400);
    }

    [name, bio].forEach(el => el.addEventListener("input", render));
    url.addEventListener("input", renderAvatar);
    render();
})();
