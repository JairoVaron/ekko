(() => {
    "use strict";

    const $ = id => document.getElementById(id);

    const name = $("displayName");
    const bio = $("bio");
    const url = $("avatarUrl");

    const pName = $("previewName");
    const pBio = $("previewBio");
    const pImg = $("previewAvatar");

    const count = $("bioCount");
    const removeButton = $("removeAvatarBtn");
    const avatarActions = $("avatarActions");

    if (!name || !bio || !url || !pImg) {
        return;
    }

    const fallback = pImg.dataset.fallback;
    const fallbackName = pName?.dataset.fallbackName || "Tu nombre";

    let timer = null;

    /*
     * Actualizar nombre, biografía y contador.
     */
    function render() {

        if (pName) {
            pName.textContent =
                name.value.trim() || fallbackName;
        }

        if (pBio) {
            pBio.textContent =
                bio.value.trim() || "Aquí aparecerá tu biografía.";
        }

        if (count) {
            count.textContent = bio.value.length + "/500";
        }
    }

    /*
     * Actualizar la imagen de perfil.
     */
    function renderAvatar() {

        clearTimeout(timer);

        timer = setTimeout(() => {

            const value = url.value.trim();

            const validUrl = /^https?:\/\/\S+$/i.test(value);

            const nextImage = validUrl ? value : fallback;

            if (pImg.getAttribute("src") !== nextImage) {
                pImg.src = nextImage;
            }

            updateRemoveButton();

        }, 400);
    }

    /*
     * Mostrar u ocultar el botón de eliminación.
     */
    function updateRemoveButton() {

        if (!removeButton || !avatarActions) {
            return;
        }

        avatarActions.hidden = url.value.trim() === "";
    }

    /*
     * Eliminar foto después de la confirmación de Ekko.
     */
    function removeAvatar() {

        if (!url.value.trim()) {
            return;
        }

        clearTimeout(timer);

        // Limpiar la URL del formulario.
        url.value = "";

        // Mostrar el avatar predeterminado.
        pImg.src = fallback;

        // Ocultar el botón de eliminación.
        updateRemoveButton();

        // Notificar el cambio a otros scripts.
        url.dispatchEvent(
            new Event("input", { bubbles: true })
        );

        url.dispatchEvent(
            new Event("change", { bubbles: true })
        );
    }

    /*
     * Integración con el sistema global de confirmaciones.
     */
    if (removeButton) {

        removeButton.addEventListener("click", removeAvatar);

    }

    /*
     * Eventos de actualización en vivo.
     */
    name.addEventListener("input", render);

    bio.addEventListener("input", render);

    url.addEventListener("input", renderAvatar);

    /*
     * Si la imagen no carga, utilizar el avatar predeterminado.
     */
    pImg.addEventListener("error", () => {

        if (pImg.getAttribute("src") !== fallback) {
            pImg.src = fallback;
        }

    });

    /*
     * Inicialización.
     */
    render();

    updateRemoveButton();

})();