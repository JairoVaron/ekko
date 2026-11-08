/* =========================================================
   EKKO · chat.js
   ========================================================= */
(() => {
    "use strict";

    const E = window.Ekko || {};
    const play = name => { if (E.sound) E.sound.play(name); };

    const conversationId = Number(document.body.dataset.conversationId);
    const currentUserId = Number(document.body.dataset.currentUserId);

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

    const otherName =
        (document.querySelector(".ek-chat-name span:last-child") || {})
            .textContent || "Ekko";

    function setStatus(text, state) {
        if (!status) return;
        status.textContent = text;
        status.dataset.state = state || "connecting";
    }

    if (!conversationId || !currentUserId || !list || !form || !input) {
        if (status) setStatus("Faltan datos para iniciar el chat.", "offline");
        console.error("conversationId o currentUserId inválido.");
        return;
    }

    if (E.chats) E.chats.clear(conversationId);

    const topic = "/topic/conversations/" + conversationId;
    const statusTopic = topic + "/status";
    const typingTopic = topic + "/typing";

    let socket = null;
    let connected = false;
    let retryTimer = null;
    let retryDelay = 1000;
    let buffer = "";
    let manuallyClosed = false;
    let submittingHttp = false;
    let missed = 0;

    // Estado del indicador de escritura.
    let typingActive = false;
    let typingStopTimer = null;
    let typingLastSentAt = 0;
    let remoteTypingTimer = null;

    const deliveredSent = new Set();
    const readSent = new Set();

    /* ---------- Utilidades de interfaz ---------- */

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

        if (scrollBtn) scrollBtn.hidden = true;
        if (scrollBadge) scrollBadge.hidden = true;
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
        input.style.height = "auto";
        input.style.height =
            Math.min(input.scrollHeight, 140) + "px";

        if (counter) {
            const left = 5000 - input.value.length;
            counter.hidden = left > 500;
            counter.textContent = input.value.length + "/5000";
        }
    }

    /* ---------- Indicador de escritura ---------- */

    function showRemoteTyping() {
        if (!typingIndicator) return;

        typingIndicator.hidden = false;

        clearTimeout(remoteTypingTimer);

        // Protección ante desconexiones o eventos perdidos.
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
        if (!connected || !socket || socket.readyState !== WebSocket.OPEN) {
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
        sendTypingState(false);
    }

    function notifyTyping() {
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
            // Renueva el evento sin enviar uno por cada pulsación.
            typingLastSentAt = now;
            sendTypingState(true);
        }

        clearTimeout(typingStopTimer);

        typingStopTimer = setTimeout(() => {
            stopTyping();
        }, 1800);
    }

    function processTypingEvent(payload) {
        if (!payload || payload.conversationId !== conversationId) {
            return;
        }

        const senderId = Number(payload.userId);

        // Nunca mostrar nuestro propio indicador.
        if (!senderId || senderId === currentUserId) {
            return;
        }

        if (payload.typing === true) {
            showRemoteTyping();
        } else if (payload.typing === false) {
            hideRemoteTyping();
        }
    }

    /* ---------- STOMP ---------- */

    function sendFrame(command, headers = {}, body = "") {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket no conectado.");
        }

        const headerText = Object.entries(headers)
            .map(([k, v]) => k + ":" + v)
            .join("\n");

        socket.send(
            command + "\n" + headerText + "\n\n" + body + "\0"
        );
    }

    function updateStatus(receipt) {
        if (!receipt || receipt.messageId == null) return;

        const element = list.querySelector(
            '[data-message-id="' + String(receipt.messageId) + '"]'
        );

        if (!element || element.dataset.mine !== "true") return;

        let label = element.querySelector(".message-status");

        if (!label) {
            label = document.createElement("small");
            label.className = "message-status";

            (element.querySelector(".message-meta") || element)
                .appendChild(label);
        }

        const state = receipt.readAt
            ? "read"
            : receipt.deliveredAt
                ? "delivered"
                : "sent";

        label.dataset.state = state;
        label.textContent = statusLabel(state);
    }

    /* ---------- Eliminación de mensajes ---------- */
    function requestMessageDeletion(messageId, deleteForEveryone) {
        if (!connected || !socket || socket.readyState !== WebSocket.OPEN) {
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

    /* ---------- Eliminación de mensajes  ---------- */
    let deleteDialog = null;
    let deleteDialogReturnFocus = null;
    let pressTimer = null;

    function closeDeleteDialog() {
        if (!deleteDialog) return;

        deleteDialog.remove();
        deleteDialog = null;

        document.removeEventListener("keydown", onDeleteDialogKeydown, true);

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

        // Mantiene el foco dentro del diálogo.
        const buttons = deleteDialog.querySelectorAll("button");
        const first = buttons[0];
        const last = buttons[buttons.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function createDialogButton(label, className, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ek-dialog-btn" + (className ? " " + className : "");
        button.textContent = label;
        button.addEventListener("click", onClick);
        return button;
    }

    function openDeleteDialog(article, trigger) {
        if (deleteDialog || !article || article.dataset.deleted === "true") {
            return;
        }

        const messageId = article.dataset.messageId;
        const mine = article.dataset.mine === "true";

        if (!messageId) return;

        deleteDialogReturnFocus = trigger || null;

        const overlay = document.createElement("div");
        overlay.className = "ek-dialog-overlay";

        overlay.addEventListener("click", event => {
            if (event.target === overlay) closeDeleteDialog();
        });

        const box = document.createElement("div");
        box.className = "ek-dialog";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");
        box.setAttribute("aria-labelledby", "deleteDialogTitle");

        const title = document.createElement("h2");
        title.id = "deleteDialogTitle";
        title.textContent = "¿Eliminar mensaje?";

        const preview = document.createElement("p");
        preview.className = "ek-dialog-preview";
        preview.textContent =
            (article.querySelector(".text")?.textContent || "").slice(0, 160);

        const actions = document.createElement("div");
        actions.className = "ek-dialog-actions";

        if (mine) {
            actions.appendChild(
                createDialogButton("Eliminar para todos", "is-danger", () => {
                    closeDeleteDialog();
                    requestMessageDeletion(messageId, true);
                })
            );
        }

        actions.appendChild(
            createDialogButton("Eliminar para mí", "is-danger", () => {
                closeDeleteDialog();
                requestMessageDeletion(messageId, false);
            })
        );

        const cancel = createDialogButton("Cancelar", "", closeDeleteDialog);
        actions.appendChild(cancel);

        box.append(title, preview, actions);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        deleteDialog = overlay;
        document.addEventListener("keydown", onDeleteDialogKeydown, true);

        // El foco inicial va a "Cancelar" para evitar borrados accidentales.
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
        button.setAttribute("aria-label", "Opciones del mensaje");
        button.setAttribute("aria-haspopup", "dialog");
        button.innerHTML = '<i class="bi bi-chevron-down" aria-hidden="true"></i>';

        button.addEventListener("click", event => {
            event.stopPropagation();
            openDeleteDialog(article, button);
        });

        article.appendChild(button);
    }

    // Clic derecho (escritorio) y pulsación larga (Android).
    list.addEventListener("contextmenu", event => {
        const article = event.target.closest("article[data-message-id]");

        if (!article || article.dataset.deleted === "true") return;

        event.preventDefault();
        openDeleteDialog(article, article.querySelector(".message-menu-btn"));
    });

    // Pulsación larga manual (iOS no dispara "contextmenu").
    list.addEventListener("touchstart", event => {
        const article = event.target.closest("article[data-message-id]");

        if (!article || article.dataset.deleted === "true") return;

        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => openDeleteDialog(article, null), 550);
    }, { passive: true });

    ["touchend", "touchmove", "touchcancel"].forEach(type => {
        list.addEventListener(type, () => clearTimeout(pressTimer), { passive: true });
    });

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
                content.textContent = "Este mensaje fue eliminado";
            }

            article.dataset.deleted = "true";

            removeMessageActions(article);

            article.querySelector(".message-status")?.remove();

            return;
        }

        // La eliminación individual solo afecta al usuario que la solicitó.
        if (Number(payload.userId) === currentUserId) {
            article.remove();

            const remainingMessages =
                list.querySelectorAll(
                    "article[data-message-id]"
                );

            if (remainingMessages.length === 0) {
                let empty = document.getElementById("emptyMessages");

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

    /** Devuelve true si el mensaje se añadió (y no existía antes). */
    function addMessage(message) {
        if (!message || message.id == null) return false;

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

        const mine = Number(message.senderId) === currentUserId;

        const article = document.createElement("article");
        article.className = "message " +
            (mine ? "message-mine" : "message-other");

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

    function sendReceipt(destination, id, set) {
        const key = String(id);

        if (!connected || set.has(key)) return;

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
        if (!connected || document.visibilityState !== "visible") {
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

    function onIncoming(payload) {
        const wasNearBottom = nearBottom();
        const created = addMessage(payload);

        if (!created) return;

        const mine = Number(payload.senderId) === currentUserId;

        // Si llega un mensaje, el indicador deja de ser necesario.
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

    function processFrame(frame) {
        frame = frame.replace(/\r\n/g, "\n");

        const separator = frame.indexOf("\n\n");
        if (separator < 0) return;

        const lines = frame.substring(0, separator).split("\n");
        const body = frame.substring(separator + 2);
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

        if (command === "CONNECTED") {
            sendFrame("SUBSCRIBE", {
                id: "conversation-" + conversationId,
                destination: topic
            });

            sendFrame("SUBSCRIBE", {
                id: "status-" + conversationId,
                destination: statusTopic
            });

            sendFrame("SUBSCRIBE", {
                id: "typing-" + conversationId,
                destination: typingTopic
            });

            connected = true;
            retryDelay = 1000;

            setStatus("En línea · tiempo real", "online");

            confirmIncomingMessages();

            // Si se recupera la conexión mientras el usuario escribe,
            // se vuelve a anunciar el estado.
            if (input.value.trim()) {
                typingActive = false;
                notifyTyping();
            }

            return;
        }

        if (command === "MESSAGE") {
            try {
                const payload = JSON.parse(body);
                const destination = headers.destination || "";

                if (destination === statusTopic) {
                    updateStatus(payload);
                    return;
                }

                if (destination === typingTopic) {
                    processTypingEvent(payload);
                    return;
                }

                if (destination !== topic) return;
                // Los eventos de eliminación tienen messageId
                // y conversationId, a diferencia de los mensajes.
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

                    if (document.visibilityState === "visible") {
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

        if (command === "ERROR") {
            console.error("Error STOMP:", body);
            setStatus("El servidor rechazó una operación.", "offline");
        }
    }

    function connect() {
        if (manuallyClosed) return;

        connected = false;
        setStatus("Conectando al chat...", "connecting");

        const scheme = location.protocol === "https:"
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
                if (frame.trim()) processFrame(frame);
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
            console.error("Error WebSocket.", error);
        });
    }

    /* ---------- Envío ---------- */

    form.addEventListener("submit", event => {
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

        // Respaldo HTTP si no hay conexión STOMP.
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

    // Enter envía (en ordenador); Shift+Enter inserta salto de línea.
    const finePointer = window.matchMedia
        && window.matchMedia("(pointer: fine)").matches;

    input.addEventListener("keydown", event => {
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

        if (errorBox && !errorBox.hidden) {
            clearError();
        }

        notifyTyping();
    });

    input.addEventListener("blur", () => {
        stopTyping();
    });

    /* ---------- Emojis ---------- */

    if (emojiBtn && emojiPanel) {
        "😀 😂 😊 😍 🥰 😎 🤔 😅 😭 😢 😡 🥳 👍 👏 🙏 💪 🔥 ✨ ❤️ 💙 🌊 🐬 🐚 🏝️ ☀️ 🎉 👀 🙌 😴 🤝 💬 ✅"
            .split(" ")
            .forEach(emoji => {

                const b = document.createElement("button");
                b.type = "button";
                b.textContent = emoji;
                b.setAttribute(
                    "aria-label",
                    "Insertar " + emoji
                );

                b.addEventListener("click", () => {
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

                emojiPanel.appendChild(b);
            });

        emojiBtn.addEventListener("click", () => {
            emojiPanel.hidden = !emojiPanel.hidden;
        });

        document.addEventListener("click", e => {
            if (
                !emojiPanel.hidden
                && !e.target.closest("#emojiPanel, #emojiToggle")
            ) {
                emojiPanel.hidden = true;
            }
        });

        document.addEventListener("keydown", e => {
            if (e.key === "Escape") {
                emojiPanel.hidden = true;
            }
        });
    }

    /* ---------- Desplazamiento y ciclo de vida ---------- */

    scrollBtn?.addEventListener("click", () => {
        scrollToBottom(true);
    });

    list.addEventListener("scroll", () => {
        if (nearBottom()) {
            missed = 0;

            if (scrollBtn) {
                scrollBtn.hidden = true;
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

        // Intento de avisar al otro participante antes de cerrar.
        if (
            connected
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

    list.style.scrollBehavior = "auto";

    scrollToBottom(false);

    window.addEventListener("load", () => {
        scrollToBottom(false);
    });

    setTimeout(() => {
        list.style.scrollBehavior = "";
    }, 400);

    // Acciones de eliminación para el historial inicial.
    list.querySelectorAll(
        'article[data-message-id]'
    ).forEach(article => {
        if (article.dataset.deleted !== "true") {
            setupMessageActions(article);
        }
    });

    autosize();
    connect();

})();