/* =========================================================
   EKKO · perfil.js
   Vista previa y gestión de fotografía de perfil
   ========================================================= */

(() => {

    "use strict";

    if (window.__ekkoProfileInitialized) {
        return;
    }

    window.__ekkoProfileInitialized = true;

    const $ = id => document.getElementById(id);

    /* =====================================================
       ELEMENTOS DEL DOM
       ===================================================== */

    const form = $("profileForm");

    const name = $("displayName");
    const bio = $("bio");

    const fileInput = $("avatarFile");
    const removeInput = $("removeAvatar");

    const previewName = $("previewName");
    const previewBio = $("previewBio");

    const avatarContainer = $("previewAvatarContainer");
    const previewAvatar = $("previewAvatar");
    const previewInitial = $("previewInitial");

    const bioCount = $("bioCount");

    const removeButton = $("removeAvatarBtn");
    const avatarActions = $("avatarActions");

    const avatarError = $("avatarClientError");

    if (
        !form ||
        !name ||
        !bio ||
        !fileInput ||
        !removeInput ||
        !avatarContainer ||
        !previewAvatar ||
        !previewInitial
    ) {
        return;
    }

    /* =====================================================
       CONFIGURACIÓN
       ===================================================== */

    const username =
        previewName.dataset.fallbackName || "";

    const userId =
        avatarContainer.dataset.userId || "";

    const MAX_FILE_SIZE = 5 * 1024 * 1024;

    const ALLOWED_TYPES = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    const originalHasAvatar =
        avatarContainer.dataset.hasAvatar === "true";

    const originalAvatarSrc = originalHasAvatar
        ? previewAvatar.getAttribute("src") || ""
        : "";

    const originalRemovalValue =
        removeInput.value === "true";

    let selectedFile = false;
    let removeRequested = originalRemovalValue;

    let pendingRemovalBeforeSelection =
        originalRemovalValue;

    let previewObjectUrl = null;

    /* =====================================================
       COLOR DETERMINISTA DEL AVATAR
       ===================================================== */

    function getAvatarTone(value) {

        const text = String(value ?? "");

        let hash = 2166136261;

        for (let i = 0; i < text.length; i++) {

            hash ^= text.charCodeAt(i);

            hash = Math.imul(hash, 16777619);
        }

        return (hash >>> 0) % 6;
    }

    const avatarTone = getAvatarTone(userId);

    function applyAvatarTone() {

        previewInitial.classList.remove(
            "tone-0",
            "tone-1",
            "tone-2",
            "tone-3",
            "tone-4",
            "tone-5"
        );

        previewInitial.classList.add(
            `tone-${avatarTone}`
        );
    }

    /* =====================================================
       INFORMACIÓN DEL PERFIL
       ===================================================== */

    function getCurrentDisplayName() {

        return name.value.trim() || username || "Usuario";
    }

    function getCurrentInitial() {

        const displayName = getCurrentDisplayName();

        return Array.from(displayName)[0] || "?";
    }

    function renderProfile() {

        previewName.textContent =
            getCurrentDisplayName();

        previewBio.textContent =
            bio.value.trim() ||
            "Aquí aparecerá tu biografía.";

        if (bioCount) {

            bioCount.textContent =
                `${bio.value.length}/500`;
        }

    }

    /* =====================================================
       MENSAJES DE VALIDACIÓN
       ===================================================== */

    function showAvatarError(message) {

        if (!avatarError) {
            return;
        }

        avatarError.textContent = message;
        avatarError.hidden = false;
    }

    function clearAvatarError() {

        if (!avatarError) {
            return;
        }

        avatarError.textContent = "";
        avatarError.hidden = true;
    }

    /* =====================================================
       GESTIÓN DE URLS TEMPORALES
       ===================================================== */

    function releasePreviewObjectUrl() {

        if (!previewObjectUrl) {
            return;
        }

        URL.revokeObjectURL(previewObjectUrl);

        previewObjectUrl = null;
    }

    /* =====================================================
       ESTADO VISUAL DE LA INICIAL
       ===================================================== */

    function showInitial() {

        releasePreviewObjectUrl();

        previewAvatar.hidden = true;

        previewInitial.textContent =
            getCurrentInitial().toLocaleUpperCase("es");

        applyAvatarTone();

        previewInitial.hidden = false;

    }

    /* =====================================================
       ESTADO VISUAL DE LA FOTOGRAFÍA
       ===================================================== */

    function showImage(src) {

        if (!src) {

            showInitial();

            return;
        }

        previewInitial.hidden = true;

        previewAvatar.hidden = false;

        previewAvatar.src = src;

    }

    /* =====================================================
       RESTAURAR FOTOGRAFÍA ORIGINAL
       ===================================================== */

    function restoreCurrentAvatar() {

        releasePreviewObjectUrl();

        if (originalHasAvatar && !removeRequested) {

            showImage(originalAvatarSrc);

        } else {

            showInitial();
        }

    }

    /* =====================================================
       BOTÓN DE ELIMINACIÓN
       ===================================================== */

    function updateRemoveButton() {

        if (!avatarActions) {
            return;
        }

        avatarActions.hidden =
            !selectedFile &&
            (!originalHasAvatar || removeRequested);

    }

    /* =====================================================
       RESTAURAR ESTADO ANTERIOR A LA SELECCIÓN
       ===================================================== */

    function restoreSelectionState() {

        selectedFile = false;

        removeRequested =
            pendingRemovalBeforeSelection;

        removeInput.value =
            String(removeRequested);

        restoreCurrentAvatar();

        updateRemoveButton();

    }

    /* =====================================================
       VALIDACIÓN DE ARCHIVOS
       ===================================================== */

    function validateFile(file) {

        if (!ALLOWED_TYPES.includes(file.type)) {

            return "Solo se permiten imágenes JPEG, PNG y WebP.";
        }

        if (file.size === 0) {

            return "El archivo seleccionado está vacío.";
        }

        if (file.size > MAX_FILE_SIZE) {

            return "La fotografía no puede superar los 5 MB.";
        }

        return null;
    }

    /* =====================================================
       SELECCIÓN DE IMAGEN
       ===================================================== */

    function handleFileSelection() {

        clearAvatarError();

        const file = fileInput.files?.[0];

        if (!file) {

            restoreSelectionState();

            return;
        }

        const previousRemoval = selectedFile
            ? pendingRemovalBeforeSelection
            : removeRequested;

        const validationError = validateFile(file);

        if (validationError) {

            fileInput.value = "";

            selectedFile = false;

            removeRequested = previousRemoval;

            pendingRemovalBeforeSelection =
                previousRemoval;

            removeInput.value =
                String(removeRequested);

            restoreCurrentAvatar();

            updateRemoveButton();

            showAvatarError(validationError);

            return;
        }

        releasePreviewObjectUrl();

        pendingRemovalBeforeSelection =
            previousRemoval;

        selectedFile = true;

        removeRequested = false;

        removeInput.value = "false";

        previewObjectUrl = URL.createObjectURL(file);

        showImage(previewObjectUrl);

        updateRemoveButton();

    }

    /* =====================================================
       ELIMINACIÓN DE FOTOGRAFÍA
       ===================================================== */

    function removeAvatar() {

        clearAvatarError();

        /*
         * CASO 1:
         * Hay una fotografía nueva seleccionada.
         * Se cancela y se recupera el estado anterior.
         */

        if (selectedFile) {

            fileInput.value = "";

            restoreSelectionState();

            return;
        }

        /*
         * CASO 2:
         * Existe una fotografía guardada.
         * Se solicita eliminarla al guardar.
         */

        if (originalHasAvatar && !removeRequested) {

            removeRequested = true;

            removeInput.value = "true";

            showInitial();

            updateRemoveButton();

        }

    }

    /* =====================================================
       CONFIRMACIÓN DE ELIMINACIÓN
       ===================================================== */

    function askRemoveAvatar() {

        if (
            !selectedFile &&
            (!originalHasAvatar || removeRequested)
        ) {
            return;
        }

        const cancellingSelection = selectedFile;

        const options = {

            title: cancellingSelection
                ? "¿Cancelar nueva fotografía?"
                : "¿Eliminar foto de perfil?",

            text: cancellingSelection
                ? "Se descartará la fotografía seleccionada y se conservará el estado anterior."
                : "Tu fotografía se eliminará al guardar los cambios y se mostrará tu inicial.",

            okText: cancellingSelection
                ? "Cancelar fotografía"
                : "Eliminar foto",

            danger: !cancellingSelection

        };

        const confirmation =
            window.Ekko && typeof window.Ekko.confirm === "function"
                ? window.Ekko.confirm(options)
                : Promise.resolve(window.confirm(options.text));

        Promise.resolve(confirmation)
            .then(confirmed => {

                if (confirmed) {
                    removeAvatar();
                }

            })
            .catch(() => {
                // No modificar el formulario si se cancela.
            });

    }

    /* =====================================================
       VALIDACIÓN DEL FORMULARIO
       ===================================================== */

    form.addEventListener("submit", event => {

        clearAvatarError();

        const displayName = name.value.trim();

        if (!displayName) {

            event.preventDefault();

            name.focus();

            return;
        }

        if (displayName.length > 60) {

            event.preventDefault();

            showAvatarError(
                "El nombre visible no puede superar los 60 caracteres."
            );

            name.focus();

            return;
        }

        if (bio.value.length > 500) {

            event.preventDefault();

            showAvatarError(
                "La biografía no puede superar los 500 caracteres."
            );

            bio.focus();

            return;
        }

        const file = fileInput.files?.[0];

        if (file) {

            const validationError = validateFile(file);

            if (validationError) {

                event.preventDefault();

                showAvatarError(validationError);

                fileInput.focus();

                return;
            }

        }

    });

    /* =====================================================
       ERROR DE CARGA DE IMAGEN
       ===================================================== */

    previewAvatar.addEventListener("error", () => {

        if (previewAvatar.hidden) {
            return;
        }

        /*
         * Solo cambiamos la representación visual.
         * No modificamos el estado real del formulario.
         */

        previewAvatar.hidden = true;

        previewInitial.textContent =
            getCurrentInitial().toLocaleUpperCase("es");

        applyAvatarTone();

        previewInitial.hidden = false;

    });

    /* =====================================================
       EVENTOS
       ===================================================== */

    name.addEventListener("input", () => {

        renderProfile();

        /*
         * Si se muestra una inicial, esta debe seguir
         * el nombre visible que el usuario está escribiendo.
         */

        if (
            previewInitial.hidden === false &&
            !selectedFile
        ) {

            previewInitial.textContent =
                getCurrentInitial().toLocaleUpperCase("es");

            applyAvatarTone();

        }

    });

    bio.addEventListener("input", renderProfile);

    fileInput.addEventListener(
        "change",
        handleFileSelection
    );

    removeButton?.addEventListener(
        "click",
        askRemoveAvatar
    );

    /* =====================================================
       INICIALIZACIÓN
       ===================================================== */

    applyAvatarTone();

    renderProfile();

    if (!originalHasAvatar || originalRemovalValue) {

        showInitial();

    } else {

        previewInitial.hidden = true;

    }

    updateRemoveButton();

    /* =====================================================
       LIMPIEZA
       ===================================================== */

    window.addEventListener("pagehide", () => {

        releasePreviewObjectUrl();

    });

})();