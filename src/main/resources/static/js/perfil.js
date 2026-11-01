/* perfil.js · vista previa en vivo y eliminación de foto */
(() => {
    "use strict";

    const $ = id => document.getElementById(id);
    const name = $("displayName"), bio = $("bio"), url = $("avatarUrl");
    const pName = $("previewName"), pBio = $("previewBio"), pImg = $("previewAvatar");
    const count = $("bioCount"), removeButton = $("removeAvatarBtn"), avatarActions = $("avatarActions");

    if (!name || !bio || !url || !pImg) return;

    const fallback = pImg.dataset.fallback;
    const fallbackName = pName?.dataset.fallbackName || "Tu nombre";
    let timer = null;

    function render() {
        if (pName) pName.textContent = name.value.trim() || fallbackName;
        if (pBio) pBio.textContent = bio.value.trim() || "Aquí aparecerá tu biografía.";
        if (count) count.textContent = bio.value.length + "/500";
    }

    function updateRemoveButton() {
        if (avatarActions) avatarActions.hidden = url.value.trim() === "";
    }

    function renderAvatar() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const value = url.value.trim();
            const next = /^https?:\/\/\S+$/i.test(value) ? value : fallback;
            if (pImg.getAttribute("src") !== next) pImg.src = next;
            updateRemoveButton();
        }, 400);
    }

    function removeAvatar() {
        clearTimeout(timer);
        url.value = "";
        pImg.src = fallback;
        updateRemoveButton();
        url.dispatchEvent(new Event("input", { bubbles: true }));
        url.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // El botón no está dentro de un <form data-ekko-confirm>, así que se confirma aquí.
    function askRemove() {
        if (!url.value.trim()) return;
        const opts = {
            title: "¿Eliminar foto de perfil?",
            text: "Se eliminará tu foto de perfil y se usará el avatar predeterminado de Ekko. Guarda los cambios para aplicarlo.",
            okText: "Eliminar foto",
            danger: true
        };
        const answer = window.Ekko && window.Ekko.confirm
            ? window.Ekko.confirm(opts)
            : Promise.resolve(window.confirm(opts.text));
        answer.then(ok => { if (ok) removeAvatar(); });
    }

    removeButton?.addEventListener("click", askRemove);
    name.addEventListener("input", render);
    bio.addEventListener("input", render);
    url.addEventListener("input", renderAvatar);

    pImg.addEventListener("error", () => {
        if (pImg.getAttribute("src") !== fallback) pImg.src = fallback;
    });

    render();
    updateRemoveButton();
})();
