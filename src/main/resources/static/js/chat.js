/* =========================================================
   EKKO · chat.js
   ========================================================= */

(() => {
    "use strict";

    const E = window.Ekko || {};

    const play = name => {
        if (E.sound) {
            E.sound.play(name);
        }
    };

    const body = document.body;

    const conversationId = Number(body.dataset.conversationId);
    const currentUserId = Number(body.dataset.currentUserId);
    const otherUserId = Number(body.dataset.otherUserId);

    /* ---------- Estado del bloqueo ---------- */

    let blockedByMe = body.dataset.blockedByMe === "true";
    let blockedByOther = body.dataset.blockedByOther === "true";

    const otherAccountDeleted =
        body.dataset.otherAccountDeleted === "true";

    let chatBlocked =
        blockedByMe || blockedByOther || otherAccountDeleted;

    /* ---------- Elementos del DOM ---------- */

    const list = document.getElementById("messageList");
    const form = document.getElementById("messageForm");
    const input = document.getElementById("content");
    const status = document.getElementById("connectionStatus");
    const typingIndicator = document.getElementById("typingIndicator");
    const errorBox = document.getElementById("sendError");
    const scrollBtn = document.getElementById("scrollDown");
    const scrollBadge = document.getElementById("scrollDownCount");
    const emojiBtn = document.getElementById("emojiToggle");
    const emojiPanel = document.getElementById("emojiPanel");
    const counter = document.getElementById("charCounter");
    const sendButton = document.getElementById("sendButton");

    const otherName =
        (document.querySelector(".ek-chat-name span:last-child") || {})
            .textContent || "Ekko";

    function setStatus(text, state) {
        if (!status) return;

        status.textContent = text;
        status.dataset.state = state || "connecting";
    }

    if (
        !conversationId
        || !currentUserId
        || !otherUserId
        || !list
        || !form
        || !input
    ) {
        setStatus("Faltan datos para iniciar el chat.", "offline");

        console.error(
            "Ekko: faltan datos para iniciar la conversación.",
            {
                conversationId,
                currentUserId,
                otherUserId
            }
        );

        return;
    }

    if (E.chats) {
        E.chats.clear(conversationId);
    }

    /* ---------- Destinos STOMP ---------- */

    const topic =
        "/topic/conversations/" + conversationId;

    const statusTopic =
        topic + "/status";

    const typingTopic =
        topic + "/typing";

    const contactsTopic =
        "/user/queue/contacts";

    /* ---------- Estado de conexión ---------- */

    let socket = null;
    let connected = false;
    let retryTimer = null;
    let retryDelay = 1000;
    let buffer = "";
    let manuallyClosed = false;
    let submittingHttp = false;
    let missed = 0;

    /* ---------- Estado de escritura ---------- */

    let typingActive = false;
    let typingStopTimer = null;
    let typingLastSentAt = 0;
    let remoteTypingTimer = null;

    /* ---------- Recibos ---------- */

    const deliveredSent = new Set();
    const readSent = new Set();

    /* ---------- Eliminación ---------- */

    let deleteDialog = null;
    let deleteDialogReturnFocus = null;
    let pressTimer = null;

    /* =====================================================
       UTILIDADES DE INTERFAZ
       ===================================================== */

    /* AVATAR DEL CONTACTO */
    function getAvatarTone(userId) {
        const value = String(userId ?? "");
        let hash = 2166136261;

        for (let i = 0; i < value.length; i++) {
            hash = Math.imul(
                hash ^ value.charCodeAt(i),
                16777619
            );
        }

        return "tone-" + ((hash >>> 0) % 6);
    }

    function setupChatAvatar() {
        const initial = document.querySelector(
            ".ek-chat-head .ek-initial"
        );

        const photo = document.querySelector(
            ".ek-chat-head .ek-avatar-photo"
        );

        if (!initial) return;

        // Mantener el mismo color en todas las vistas.
        const tone = getAvatarTone(
            initial.dataset.userId || otherUserId
        );

        initial.classList.remove(
            "tone-0",
            "tone-1",
            "tone-2",
            "tone-3",
            "tone-4",
            "tone-5"
        );

        initial.classList.add(tone);

        // Asegurar una inicial visible.
        if (!initial.textContent.trim()) {
            const name = initial.dataset.name || otherName;

            initial.textContent =
                name.trim().charAt(0).toUpperCase() || "U";
        }

        // Si no hay fotografía, la inicial queda visible.
        if (!photo) return;

        // Si la fotografía falla, revelamos la inicial.
        photo.addEventListener("error", () => {
            photo.hidden = true;
        });

        // También contemplar imágenes que ya fallaron
        // antes de registrar el evento.
        if (photo.complete && photo.naturalWidth === 0) {
            photo.hidden = true;
        }
    }

    function showError(message) {
        if (!errorBox) return;

        errorBox.textContent = message;
        errorBox.hidden = false;

        play("error");
    }

    function clearError() {
        if (!errorBox) return;

        errorBox.textContent = "";
        errorBox.hidden = true;
    }

    const nearBottom = () =>
        list.scrollHeight - list.scrollTop - list.clientHeight < 140;

    function scrollToBottom(smooth) {
        list.scrollTo({
            top: list.scrollHeight,
            behavior: smooth ? "smooth" : "auto"
        });

        missed = 0;

        if (scrollBtn) {
            scrollBtn.hidden = true;
        }

        if (scrollBadge) {
            scrollBadge.hidden = true;
        }
    }

    function statusLabel(state) {
        return state === "read"
            ? "✓✓ Leído"
            : state === "delivered"
                ? "✓✓ Entregado"
                : "✓ Enviado";
    }

    function formatDate(value) {
        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? ""
            : date.toLocaleString([], {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
            });
    }

    function autosize() {
        if (!input) return;

        input.style.height = "auto";

        input.style.height =
            Math.min(input.scrollHeight, 140) + "px";

        if (counter) {
            const left = 5000 - input.value.length;

            counter.hidden = left > 500;
            counter.textContent =
                input.value.length + "/5000";
        }
    }

    /* =====================================================
       INDICADOR DE ESCRITURA
       ===================================================== */

    function showRemoteTyping() {
        if (chatBlocked || !typingIndicator) return;

        typingIndicator.hidden = false;

        clearTimeout(remoteTypingTimer);

        remoteTypingTimer = setTimeout(() => {
            hideRemoteTyping();
        }, 4000);
    }

    function hideRemoteTyping() {
        clearTimeout(remoteTypingTimer);
        remoteTypingTimer = null;

        if (typingIndicator) {
            typingIndicator.hidden = true;
        }
    }

    function sendTypingState(typing) {
        if (chatBlocked) return;

        if (
            !connected
            || !socket
            || socket.readyState !== WebSocket.OPEN
        ) {
            return;
        }

        try {
            sendFrame(
                "SEND",
                {
                    destination: "/app/chat.typing",
                    "content-type": "application/json"
                },
                JSON.stringify({
                    conversationId,
                    typing
                })
            );

        } catch (error) {
            console.error(
                "No se pudo enviar el estado de escritura.",
                error
            );
        }
    }

    function stopTyping() {
        clearTimeout(typingStopTimer);
        typingStopTimer = null;

        if (!typingActive) return;

        typingActive = false;

        if (!chatBlocked) {
            sendTypingState(false);
        }
    }

    function notifyTyping() {
        if (chatBlocked) return;

        if (!input.value.trim()) {
            stopTyping();
            return;
        }

        const now = Date.now();

        if (!typingActive) {
            typingActive = true;
            typingLastSentAt = now;

            sendTypingState(true);

        } else if (now - typingLastSentAt >= 1200) {
            typingLastSentAt = now;

            sendTypingState(true);
        }

        clearTimeout(typingStopTimer);

        typingStopTimer = setTimeout(() => {
            stopTyping();
        }, 1800);
    }

    function processTypingEvent(payload) {
        if (chatBlocked) {
            hideRemoteTyping();
            return;
        }

        if (
            !payload
            || Number(payload.conversationId) !== conversationId
        ) {
            return;
        }

        const senderId = Number(payload.userId);

        if (!senderId || senderId === currentUserId) {
            return;
        }

        if (payload.typing === true) {
            showRemoteTyping();

        } else if (payload.typing === false) {
            hideRemoteTyping();
        }
    }

    /* =====================================================
       DIÁLOGO DE ELIMINACIÓN
       ===================================================== */

    function closeDeleteDialog() {
        if (!deleteDialog) return;

        deleteDialog.remove();
        deleteDialog = null;

        document.removeEventListener(
            "keydown",
            onDeleteDialogKeydown,
            true
        );

        deleteDialogReturnFocus?.focus?.();
        deleteDialogReturnFocus = null;
    }

    function onDeleteDialogKeydown(event) {
        if (!deleteDialog) return;

        if (event.key === "Escape") {
            event.preventDefault();
            closeDeleteDialog();
            return;
        }

        if (event.key !== "Tab") return;

        const buttons =
            deleteDialog.querySelectorAll("button");

        const first = buttons[0];
        const last = buttons[buttons.length - 1];

        if (!first || !last) return;

        if (
            event.shiftKey
            && document.activeElement === first
        ) {
            event.preventDefault();
            last.focus();

        } else if (
            !event.shiftKey
            && document.activeElement === last
        ) {
            event.preventDefault();
            first.focus();
        }
    }

    function createDialogButton(label, className, onClick) {
        const button = document.createElement("button");

        button.type = "button";

        button.className =
            "ek-dialog-btn" + (className ? " " + className : "");

        button.textContent = label;
        button.addEventListener("click", onClick);

        return button;
    }

    function openDeleteDialog(article, trigger) {
        if (
            deleteDialog
            || !article
            || article.dataset.deleted === "true"
        ) {
            return;
        }

        const messageId = article.dataset.messageId;
        const mine = article.dataset.mine === "true";

        if (!messageId) return;

        deleteDialogReturnFocus = trigger || null;

        const overlay = document.createElement("div");
        overlay.className = "ek-dialog-overlay";

        overlay.addEventListener("click", event => {
            if (event.target === overlay) {
                closeDeleteDialog();
            }
        });

        const box = document.createElement("div");
        box.className = "ek-dialog";

        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");
        box.setAttribute(
            "aria-labelledby",
            "deleteDialogTitle"
        );

        const title = document.createElement("h2");
        title.id = "deleteDialogTitle";
        title.textContent = "¿Eliminar mensaje?";

        const preview = document.createElement("p");
        preview.className = "ek-dialog-preview";

        preview.textContent =
            (
                article.querySelector(".text")?.textContent || ""
            ).slice(0, 160);

        const actions = document.createElement("div");
        actions.className = "ek-dialog-actions";

        if (mine) {
            actions.appendChild(
                createDialogButton(
                    "Eliminar para todos",
                    "is-danger",
                    () => {
                        closeDeleteDialog();
                        requestMessageDeletion(messageId, true);
                    }
                )
            );
        }

        actions.appendChild(
            createDialogButton(
                "Eliminar para mí",
                "is-danger",
                () => {
                    closeDeleteDialog();
                    requestMessageDeletion(messageId, false);
                }
            )
        );

        const cancel = createDialogButton(
            "Cancelar",
            "",
            closeDeleteDialog
        );

        actions.appendChild(cancel);

        box.append(title, preview, actions);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        deleteDialog = overlay;

        document.addEventListener(
            "keydown",
            onDeleteDialogKeydown,
            true
        );

        cancel.focus();
    }

    function removeMessageActions(article) {
        article.querySelector(".message-menu-btn")?.remove();
    }

    function setupMessageActions(article) {
        if (!article || article.dataset.deleted === "true") return;
        if (!article.dataset.messageId) return;
        if (article.querySelector(".message-menu-btn")) return;

        const button = document.createElement("button");

        button.type = "button";
        button.className = "message-menu-btn";

        button.setAttribute(
            "aria-label",
            "Opciones del mensaje"
        );

        button.setAttribute("aria-haspopup", "dialog");

        button.innerHTML =
            '<i class="bi bi-chevron-down" aria-hidden="true"></i>';

        button.addEventListener("click", event => {
            event.stopPropagation();
            openDeleteDialog(article, button);
        });

        article.appendChild(button);
    }

    /* =====================================================
       BLOQUEO Y DESBLOQUEO
       ===================================================== */

    function getBlockStatusContainer() {
        return document.querySelector(".ek-chat-block-status");
    }

    function createBlockStatusContainer() {
        let container = getBlockStatusContainer();

        if (container) return container;

        container = document.createElement("section");
        container.className = "ek-chat-block-status";
        container.setAttribute("aria-live", "polite");

        const header =
            document.querySelector(".ek-chat-header")
            || document.querySelector(".ek-chat-main");

        if (header) {
            header.insertAdjacentElement("afterend", container);
        } else {
            form.insertAdjacentElement("beforebegin", container);
        }

        return container;
    }

    function renderBlockStatus() {
        const blocked =
            blockedByMe
            || blockedByOther
            || otherAccountDeleted;

        let container = getBlockStatusContainer();

        if (!blocked) {
            container?.remove();
            return;
        }

        container = createBlockStatusContainer();
        container.replaceChildren();

        const message = document.createElement("div");
        message.className = "ek-chat-block-message";

        const icon = document.createElement("i");
        icon.className =
            "ek-chat-block-icon bi bi-shield-lock";

        icon.setAttribute("aria-hidden", "true");

        const content = document.createElement("div");
        content.className = "ek-chat-block-content";

        const title = document.createElement("strong");
        const description = document.createElement("p");

        if (otherAccountDeleted) {
            title.textContent = "Cuenta no disponible";

            description.textContent =
                "No puedes enviar mensajes a esta cuenta.";

        } else if (blockedByMe) {
            title.textContent =
                "Has bloqueado a esta persona";

            description.textContent =
                "Desbloquea a esta persona para volver a enviar mensajes.";

        } else {
            title.textContent =
                "Esta persona te ha bloqueado";

            description.textContent =
                "No puedes enviar mensajes mientras el bloqueo esté activo.";
        }

        content.append(title, description);
        message.append(icon, content);
        container.appendChild(message);

        if (blockedByMe) {
            const unblockForm =
                document.createElement("form");

            unblockForm.className = "ek-unblock-form";
            unblockForm.method = "post";

            unblockForm.action =
                "/mensajes/"
                + conversationId
                + "/desbloquear";

            const csrfInput =
                form.querySelector('input[name="_csrf"]');

            if (csrfInput) {
                const token = document.createElement("input");

                token.type = "hidden";
                token.name = "_csrf";
                token.value = csrfInput.value;

                unblockForm.appendChild(token);
            }

            const button = document.createElement("button");

            button.type = "submit";
            button.className = "ek-unblock-btn";
            button.textContent = "Desbloquear";

            unblockForm.appendChild(button);
            container.appendChild(unblockForm);
        }
    }

    function updateComposerState() {
        chatBlocked =
            blockedByMe
            || blockedByOther
            || otherAccountDeleted;

        input.disabled = chatBlocked;

        if (sendButton) {
            sendButton.disabled = chatBlocked;
        }

        if (emojiBtn) {
            emojiBtn.disabled = chatBlocked;
        }

        if (emojiPanel) {
            emojiPanel.hidden = chatBlocked;

            emojiPanel
                .querySelectorAll("button")
                .forEach(button => {
                    button.disabled = chatBlocked;
                });
        }

        form.classList.toggle(
            "ek-chat-composer-blocked",
            chatBlocked
        );

        if (chatBlocked) {
            stopTyping();
            hideRemoteTyping();

            if (deleteDialog) {
                closeDeleteDialog();
            }

            if (emojiPanel) {
                emojiPanel.hidden = true;
            }

            clearError();

        } else {
            clearError();
        }

        renderBlockStatus();
    }

    function processBlockStatusEvent(payload) {
        if (
            !payload
            || payload.type !== "BLOCK_STATUS_UPDATED"
            || Number(payload.otherUserId) !== otherUserId
        ) {
            return;
        }

        const nextBlockedByMe =
            payload.blockedByMe === true;

        const nextBlockedByOther =
            payload.blockedByOther === true;

        const nextBlocked =
            nextBlockedByMe
            || nextBlockedByOther
            || otherAccountDeleted;

        /*
         * Si el bloqueo acaba de activarse, enviamos el evento
         * de finalización de escritura antes de actualizar el estado.
         */
        if (nextBlocked && !chatBlocked && typingActive) {
            stopTyping();
        }

        blockedByMe = nextBlockedByMe;
        blockedByOther = nextBlockedByOther;

        body.dataset.blockedByMe = String(blockedByMe);
        body.dataset.blockedByOther = String(blockedByOther);

        updateComposerState();

        console.info(
            "Ekko: estado de bloqueo actualizado.",
            {
                otherUserId,
                blockedByMe,
                blockedByOther
            }
        );
    }

    /* =====================================================
       DESBLOQUEO AJAX
       ===================================================== */

    document.addEventListener("submit", async event => {
        const target = event.target;

        if (
            !(target instanceof HTMLFormElement)
            || !target.matches(".ek-unblock-form")
        ) {
            return;
        }

        event.preventDefault();

        if (!blockedByMe) return;

        const unblockForm = target;

        const button = unblockForm.querySelector(
            'button[type="submit"]'
        );

        if (!button || button.disabled) return;

        button.disabled = true;
        button.textContent = "Desbloqueando...";

        try {
            /*
             * El formulario conserva su ruta tradicional.
             * Convertimos la ruta a la variante AJAX.
             */
            const asyncUrl = unblockForm.action.replace(
                /\/desbloquear\/?$/,
                "/desbloquear/async"
            );

            const response = await fetch(asyncUrl, {
                method: "POST",
                body: new FormData(unblockForm),
                credentials: "same-origin",
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "Accept": "application/json"
                }
            });

            let result;

            try {
                result = await response.json();
            } catch {
                throw new Error(
                    "El servidor devolvió una respuesta no válida."
                );
            }

            if (
                !response.ok
                || !result
                || result.status !== "success"
            ) {
                throw new Error(
                    result?.message
                    || "No se pudo desbloquear a esta persona."
                );
            }

            /*
             * El servidor confirmó el desbloqueo.
             * Actualizamos esta sesión inmediatamente.
             *
             * El evento BLOCK_STATUS_UPDATED del backend
             * sincronizará también las demás sesiones.
             */
            blockedByMe = false;
            blockedByOther = false;

            body.dataset.blockedByMe = "false";
            body.dataset.blockedByOther = "false";

            updateComposerState();

            play("sent");

        } catch (error) {
            console.error(
                "Ekko: error al desbloquear.",
                error
            );

            button.disabled = false;
            button.textContent = "Desbloquear";

            showError(
                error.message
                || "No se pudo desbloquear a esta persona. Inténtalo nuevamente."
            );
        }
    });

    /* =====================================================
       STOMP
       ===================================================== */

    function sendFrame(command, headers = {}, body = "") {
        if (
            !socket
            || socket.readyState !== WebSocket.OPEN
        ) {
            throw new Error("WebSocket no conectado.");
        }

        const headerText = Object.entries(headers)
            .map(([key, value]) => key + ":" + value)
            .join("\n");

        socket.send(
            command
            + "\n"
            + headerText
            + "\n\n"
            + body
            + "\0"
        );
    }

    /* =====================================================
       ESTADOS DE ENTREGA Y LECTURA
       ===================================================== */

    function updateStatus(receipt) {
        if (
            !receipt
            || receipt.messageId == null
        ) {
            return;
        }

        const element = list.querySelector(
            '[data-message-id="' + String(receipt.messageId) + '"]'
        );

        if (!element || element.dataset.mine !== "true") {
            return;
        }

        let label =
            element.querySelector(".message-status");

        if (!label) {
            label = document.createElement("small");
            label.className = "message-status";

            (
                element.querySelector(".message-meta")
                || element
            ).appendChild(label);
        }

        const state = receipt.readAt
            ? "read"
            : receipt.deliveredAt
                ? "delivered"
                : "sent";

        label.dataset.state = state;
        label.textContent = statusLabel(state);
    }

    /* =====================================================
       ELIMINACIÓN DE MENSAJES
       ===================================================== */

    function requestMessageDeletion(
        messageId,
        deleteForEveryone
    ) {
        if (
            !connected
            || !socket
            || socket.readyState !== WebSocket.OPEN
        ) {
            showError(
                "No hay conexión con el servidor. Intenta nuevamente."
            );

            return;
        }

        try {
            sendFrame(
                "SEND",
                {
                    destination: "/app/chat.delete",
                    "content-type": "application/json"
                },
                JSON.stringify({
                    conversationId,
                    messageId: Number(messageId),
                    deleteForEveryone: Boolean(deleteForEveryone)
                })
            );

            clearError();

        } catch (error) {
            console.error(
                "No se pudo solicitar la eliminación.",
                error
            );

            showError(
                "No se pudo solicitar la eliminación del mensaje."
            );
        }
    }

    function processDeletionEvent(payload) {
        if (
            !payload
            || Number(payload.conversationId) !== conversationId
            || payload.messageId == null
        ) {
            return;
        }

        const messageId = String(payload.messageId);

        const article = list.querySelector(
            '[data-message-id="' + messageId + '"]'
        );

        if (!article) return;

        if (payload.deletedForEveryone === true) {
            const content = article.querySelector(".text");

            if (content) {
                content.textContent =
                    "Este mensaje fue eliminado";
            }

            article.dataset.deleted = "true";

            removeMessageActions(article);

            article.querySelector(
                ".message-status"
            )?.remove();

            return;
        }

        if (Number(payload.userId) === currentUserId) {
            article.remove();

            const remainingMessages =
                list.querySelectorAll(
                    "article[data-message-id]"
                );

            if (remainingMessages.length === 0) {
                let empty =
                    document.getElementById("emptyMessages");

                if (!empty) {
                    empty = document.createElement("p");

                    empty.id = "emptyMessages";

                    empty.textContent =
                        "Todavía no hay mensajes. ¡Envía el primero!";

                    list.appendChild(empty);
                }
            }
        }
    }

    /* =====================================================
       ACCIONES DE MENSAJES
       ===================================================== */

    list.addEventListener("contextmenu", event => {
        const article = event.target.closest(
            "article[data-message-id]"
        );

        if (
            !article
            || article.dataset.deleted === "true"
        ) {
            return;
        }

        event.preventDefault();

        openDeleteDialog(
            article,
            article.querySelector(".message-menu-btn")
        );
    });

    list.addEventListener("touchstart", event => {
        const article = event.target.closest(
            "article[data-message-id]"
        );

        if (
            !article
            || article.dataset.deleted === "true"
        ) {
            return;
        }

        clearTimeout(pressTimer);

        pressTimer = setTimeout(() => {
            openDeleteDialog(article, null);
        }, 550);

    }, { passive: true });

    ["touchend", "touchmove", "touchcancel"].forEach(type => {
        list.addEventListener(
            type,
            () => clearTimeout(pressTimer),
            { passive: true }
        );
    });

    /* =====================================================
       MENSAJES
       ===================================================== */

    function addMessage(message) {
        if (!message || message.id == null) {
            return false;
        }

        const id = String(message.id);

        const existing = list.querySelector(
            '[data-message-id="' + id + '"]'
        );

        if (existing) {
            updateStatus({
                messageId: message.id,
                deliveredAt: message.deliveredAt,
                readAt: message.readAt
            });

            return false;
        }

        document.getElementById("emptyMessages")?.remove();

        const mine =
            Number(message.senderId) === currentUserId;

        const article = document.createElement("article");

        article.className =
            "message "
            + (mine ? "message-mine" : "message-other");

        article.dataset.messageId = id;
        article.dataset.mine = String(mine);

        const senderLine = document.createElement("p");
        senderLine.className = "sender visually-hidden";

        const sender = document.createElement("strong");

        sender.textContent = mine
            ? "Tú"
            : (message.senderUsername || "Usuario");

        senderLine.appendChild(sender);

        const deletedForEveryone =
            message.deletedForEveryone === true;

        article.dataset.deleted =
            String(deletedForEveryone);

        const content = document.createElement("p");
        content.className = "text";

        content.textContent = deletedForEveryone
            ? "Este mensaje fue eliminado"
            : (message.content || "");

        const meta = document.createElement("div");
        meta.className = "message-meta";

        if (message.sentAt) {
            const time = document.createElement("small");

            time.className = "message-time";
            time.textContent = formatDate(message.sentAt);

            meta.appendChild(time);
        }

        if (mine) {
            const state = message.readAt
                ? "read"
                : message.deliveredAt
                    ? "delivered"
                    : "sent";

            const label = document.createElement("small");

            label.className = "message-status";
            label.dataset.state = state;
            label.textContent = statusLabel(state);

            meta.appendChild(label);
        }

        article.append(senderLine, content, meta);
        list.appendChild(article);

        if (!deletedForEveryone) {
            setupMessageActions(article);
        }

        return true;
    }

    /* =====================================================
       RECIBOS DE ENTREGA Y LECTURA
       ===================================================== */

    function sendReceipt(destination, id, set) {
        const key = String(id);

        if (!connected || set.has(key)) {
            return;
        }

        set.add(key);

        try {
            sendFrame(
                "SEND",
                {
                    destination,
                    "content-type": "application/json"
                },
                JSON.stringify({
                    conversationId,
                    messageId: Number(id)
                })
            );

        } catch (error) {
            set.delete(key);

            console.error(
                "No se pudo confirmar el mensaje.",
                error
            );
        }
    }

    function confirmIncomingMessages() {
        if (
            !connected
            || document.visibilityState !== "visible"
        ) {
            return;
        }

        list.querySelectorAll(
            'article[data-message-id][data-mine="false"]'
        ).forEach(element => {
            const id = element.dataset.messageId;

            sendReceipt(
                "/app/chat.delivered",
                id,
                deliveredSent
            );

            sendReceipt(
                "/app/chat.read",
                id,
                readSent
            );
        });
    }

    /* =====================================================
       MENSAJES ENTRANTES
       ===================================================== */

    function onIncoming(payload) {
        const wasNearBottom = nearBottom();
        const created = addMessage(payload);

        if (!created) return;

        const mine =
            Number(payload.senderId) === currentUserId;

        if (!mine) {
            hideRemoteTyping();
        }

        if (mine || wasNearBottom) {
            scrollToBottom(true);

        } else if (scrollBtn) {
            missed++;

            scrollBtn.hidden = false;

            if (scrollBadge) {
                scrollBadge.hidden = false;
                scrollBadge.textContent = String(missed);
            }
        }

        if (!mine) {
            if (document.visibilityState === "visible") {
                play("received");

            } else if (E.notify) {
                E.notify({
                    title: otherName,
                    text: payload.content || "",
                    url: E.appUrl
                        ? E.appUrl("/mensajes/" + conversationId)
                        : null,
                    tag: "chat:" + conversationId,
                    toast: false,
                    track: false
                });
            }
        }
    }

    /* =====================================================
       PROCESAMIENTO DE FRAMES STOMP
       ===================================================== */

    function processFrame(frame) {
        frame = frame.replace(/\r\n/g, "\n");

        const separator = frame.indexOf("\n\n");

        if (separator < 0) return;

        const lines =
            frame.substring(0, separator).split("\n");

        const frameBody =
            frame.substring(separator + 2);

        const command = lines.shift();

        const headers = {};

        lines.forEach(line => {
            const index = line.indexOf(":");

            if (index > 0) {
                headers[
                    line.substring(0, index).trim()
                ] = line.substring(index + 1).trim();
            }
        });

        /* ---------- Conexión establecida ---------- */

        if (command === "CONNECTED") {

            sendFrame("SUBSCRIBE", {
                id: "conversation-" + conversationId,
                destination: topic
            });

            sendFrame("SUBSCRIBE", {
                id: "status-" + conversationId,
                destination: statusTopic
            });

            /*
             * Canal privado de contactos.
             * Recibe CONTACTS_UPDATED y BLOCK_STATUS_UPDATED.
             * Utiliza esta misma conexión WebSocket.
             */
            sendFrame("SUBSCRIBE", {
                id: "contacts-" + currentUserId,
                destination: contactsTopic
            });

            /*
             * Mantener la suscripción incluso si comienza bloqueado.
             * Al desbloquear no necesitaremos reconectar.
             */
            sendFrame("SUBSCRIBE", {
                id: "typing-" + conversationId,
                destination: typingTopic
            });

            connected = true;
            retryDelay = 1000;

            setStatus(
                "En línea · tiempo real",
                "online"
            );

            confirmIncomingMessages();

            if (!chatBlocked && input.value.trim()) {
                typingActive = false;
                notifyTyping();
            }

            return;
        }

        /* ---------- Mensaje recibido ---------- */

        if (command === "MESSAGE") {
            try {
                const payload = JSON.parse(frameBody);

                const destination =
                    headers.destination || "";

                /*
                 * Evento de bloqueo o desbloqueo.
                 * Solo se aplica al otro participante de este chat.
                 */
                if (
                    payload
                    && payload.type === "BLOCK_STATUS_UPDATED"
                ) {
                    processBlockStatusEvent(payload);
                    return;
                }

                /* ---------- Recibos ---------- */

                if (destination === statusTopic) {
                    updateStatus(payload);
                    return;
                }

                /* ---------- Escritura ---------- */

                if (destination === typingTopic) {
                    processTypingEvent(payload);
                    return;
                }

                /* ---------- Historial de conversación ---------- */

                if (destination !== topic) {
                    return;
                }

                /*
                 * Los eventos de eliminación tienen messageId
                 * y conversationId, a diferencia de los mensajes.
                 */
                if (
                    payload
                    && payload.messageId != null
                    && payload.conversationId != null
                ) {
                    processDeletionEvent(payload);
                    return;
                }

                onIncoming(payload);

                if (
                    Number(payload.senderId) !== currentUserId
                    && payload.id != null
                ) {
                    sendReceipt(
                        "/app/chat.delivered",
                        payload.id,
                        deliveredSent
                    );

                    if (
                        document.visibilityState === "visible"
                    ) {
                        sendReceipt(
                            "/app/chat.read",
                            payload.id,
                            readSent
                        );
                    }
                }

            } catch (error) {
                console.error(
                    "Error procesando evento STOMP.",
                    error
                );
            }

            return;
        }

        /* ---------- Error STOMP ---------- */

        if (command === "ERROR") {
            console.error(
                "Error STOMP:",
                frameBody
            );

            setStatus(
                "El servidor rechazó una operación.",
                "offline"
            );
        }
    }

    /* =====================================================
       CONEXIÓN WEBSOCKET
       ===================================================== */

    function connect() {
        if (manuallyClosed) return;

        connected = false;

        setStatus(
            "Conectando al chat...",
            "connecting"
        );

        const scheme =
            location.protocol === "https:"
                ? "wss:"
                : "ws:";

        const ws = new WebSocket(
            scheme + "//" + location.host + "/ws"
        );

        socket = ws;
        buffer = "";

        ws.addEventListener("open", () => {
            if (socket !== ws) return;

            const csrf = form.querySelector(
                'input[name="_csrf"]'
            );

            const headers = {
                "accept-version": "1.2",
                host: location.host,
                "heart-beat": "0,0"
            };

            if (csrf?.value) {
                headers["X-CSRF-TOKEN"] = csrf.value;
            }

            sendFrame("CONNECT", headers);
        });

        ws.addEventListener("message", event => {
            if (socket !== ws) return;

            buffer += event.data;

            const frames = buffer.split("\0");

            buffer = frames.pop() || "";

            frames.forEach(frame => {
                if (frame.trim()) {
                    processFrame(frame);
                }
            });
        });

        ws.addEventListener("close", () => {
            if (socket !== ws) return;

            connected = false;
            typingActive = false;

            clearTimeout(typingStopTimer);
            typingStopTimer = null;

            hideRemoteTyping();

            setStatus(
                "Sin conexión. Reconectando...",
                "offline"
            );

            if (!manuallyClosed) {
                clearTimeout(retryTimer);

                retryTimer = setTimeout(() => {
                    retryDelay = Math.min(
                        retryDelay * 2,
                        15000
                    );

                    connect();
                }, retryDelay);
            }
        });

        ws.addEventListener("error", error => {
            console.error(
                "Error WebSocket.",
                error
            );
        });
    }

    /* =====================================================
       ENVÍO DE MENSAJES
       ===================================================== */

    form.addEventListener("submit", event => {

        if (chatBlocked) {
            event.preventDefault();

            stopTyping();

            showError(
                otherAccountDeleted
                    ? "No puedes enviar mensajes a una cuenta eliminada."
                    : "No puedes enviar mensajes mientras exista un bloqueo."
            );

            return;
        }

        if (submittingHttp) {
            submittingHttp = false;
            stopTyping();
            return;
        }

        const content = input.value.trim();

        if (!content || content.length > 5000) {
            event.preventDefault();

            showError(
                !content
                    ? "Escribe un mensaje antes de enviarlo."
                    : "El mensaje no puede superar los 5000 caracteres."
            );

            return;
        }

        clearError();

        /*
         * Respaldo HTTP cuando no hay conexión STOMP.
         * El formulario conserva su action original.
         */
        if (
            !connected
            || !socket
            || socket.readyState !== WebSocket.OPEN
        ) {
            stopTyping();
            return;
        }

        event.preventDefault();

        try {
            sendFrame(
                "SEND",
                {
                    destination: "/app/chat.send",
                    "content-type": "application/json"
                },
                JSON.stringify({
                    conversationId,
                    content
                })
            );

            stopTyping();

            input.value = "";

            autosize();

            play("sent");

        } catch (error) {
            console.error(error);

            stopTyping();

            showError(
                "No se pudo enviar por WebSocket. Se usará el envío de respaldo."
            );

            submittingHttp = true;

            form.requestSubmit();
        }
    });

    /* ---------- Enter y Shift + Enter ---------- */

    const finePointer =
        window.matchMedia
        && window.matchMedia("(pointer: fine)").matches;

    input.addEventListener("keydown", event => {
        if (chatBlocked) {
            event.preventDefault();
            return;
        }

        if (
            finePointer
            && event.key === "Enter"
            && !event.shiftKey
            && !event.isComposing
        ) {
            event.preventDefault();
            form.requestSubmit();
        }
    });

    input.addEventListener("input", () => {
        autosize();

        if (chatBlocked) return;

        if (errorBox && !errorBox.hidden) {
            clearError();
        }

        notifyTyping();
    });

    input.addEventListener("blur", () => {
        stopTyping();
    });

    /* =====================================================
       EMOJIS
       ===================================================== */

    if (emojiBtn && emojiPanel) {

        "😀 😂 😊 😍 🥰 😎 🤔 😅 😭 😢 😡 🥳 👍 👏 🙏 💪 🔥 ✨ ❤️ 💙 🌊 🐬 🐚 🏝️ ☀️ 🎉 👀 🙌 😴 🤝 💬 ✅"
            .split(" ")
            .forEach(emoji => {

                const button =
                    document.createElement("button");

                button.type = "button";
                button.textContent = emoji;

                button.setAttribute(
                    "aria-label",
                    "Insertar " + emoji
                );

                button.disabled = chatBlocked;

                button.addEventListener("click", () => {
                    if (chatBlocked) return;

                    const start =
                        input.selectionStart ?? input.value.length;

                    const end =
                        input.selectionEnd ?? input.value.length;

                    input.setRangeText(
                        emoji,
                        start,
                        end,
                        "end"
                    );

                    input.focus();

                    autosize();
                    notifyTyping();
                });

                emojiPanel.appendChild(button);
            });

        emojiBtn.addEventListener("click", () => {
            if (chatBlocked) return;

            emojiPanel.hidden = !emojiPanel.hidden;
        });

        document.addEventListener("click", event => {
            if (
                !emojiPanel.hidden
                && !event.target.closest(
                    "#emojiPanel, #emojiToggle"
                )
            ) {
                emojiPanel.hidden = true;
            }
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                emojiPanel.hidden = true;
            }
        });
    }

    /* =====================================================
       DESPLAZAMIENTO Y CICLO DE VIDA
       ===================================================== */

    scrollBtn?.addEventListener("click", () => {
        scrollToBottom(true);
    });

    list.addEventListener("scroll", () => {
        if (nearBottom()) {
            missed = 0;

            if (scrollBtn) {
                scrollBtn.hidden = true;
            }

            if (scrollBadge) {
                scrollBadge.hidden = true;
            }
        }
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            confirmIncomingMessages();
        }
    });

    window.addEventListener("beforeunload", () => {
        manuallyClosed = true;

        clearTimeout(retryTimer);
        clearTimeout(typingStopTimer);
        clearTimeout(remoteTypingTimer);
        clearTimeout(pressTimer);

        /*
         * Avisar que dejamos de escribir antes de cerrar.
         */
        if (
            !chatBlocked
            && connected
            && socket
            && socket.readyState === WebSocket.OPEN
            && typingActive
        ) {
            sendTypingState(false);
        }

        typingActive = false;

        hideRemoteTyping();

        if (
            socket
            && socket.readyState === WebSocket.OPEN
        ) {
            socket.close();
        }
    });

    /* =====================================================
       INICIALIZACIÓN
       ===================================================== */

    list.style.scrollBehavior = "auto";

    // Avatar del otro participante.
    setupChatAvatar();

    scrollToBottom(false);

    window.addEventListener("load", () => {
        scrollToBottom(false);
    });

    setTimeout(() => {
        list.style.scrollBehavior = "";
    }, 400);

    // Acciones para los mensajes que ya estaban cargados.
    list.querySelectorAll(
        'article[data-message-id]'
    ).forEach(article => {
        if (article.dataset.deleted !== "true") {
            setupMessageActions(article);
        }
    });

    // Aplicar el estado inicial del bloqueo.
    updateComposerState();

    autosize();

    // Una única conexión WebSocket para este chat.
    connect();

})();