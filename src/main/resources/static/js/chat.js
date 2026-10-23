/* =========================================================
   EKKO · Conversación en tiempo real (STOMP sobre WebSocket)
   Los datos llegan desde <body data-current-user-id data-conversation-id>
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
    const errorBox = document.getElementById("sendError");
    const scrollBtn = document.getElementById("scrollDown");
    const scrollBadge = document.getElementById("scrollDownCount");
    const emojiBtn = document.getElementById("emojiToggle");
    const emojiPanel = document.getElementById("emojiPanel");
    const counter = document.getElementById("charCounter");
    const otherName = (document.querySelector(".ek-chat-name span:last-child") || {}).textContent || "Ekko";

    function setStatus(text, state) {
        status.textContent = text;
        status.dataset.state = state || "connecting";
    }

    if (!conversationId || !currentUserId || !list || !form || !input) {
        setStatus("Faltan datos para iniciar el chat.", "offline");
        console.error("conversationId o currentUserId inválido.");
        return;
    }

    const topic = "/topic/conversations/" + conversationId;
    const statusTopic = topic + "/status";

    let socket = null;
    let connected = false;
    let retryTimer = null;
    let retryDelay = 1000;
    let buffer = "";
    let manuallyClosed = false;
    let submittingHttp = false;
    let missed = 0;

    const deliveredSent = new Set();
    const readSent = new Set();

    /* ---------- Utilidades de interfaz ---------- */
    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        play("error");
    }

    function clearError() {
        errorBox.textContent = "";
        errorBox.hidden = true;
    }

    const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 140;

    function scrollToBottom(smooth) {
        list.scrollTo({ top: list.scrollHeight, behavior: smooth ? "smooth" : "auto" });
        missed = 0;
        if (scrollBtn) scrollBtn.hidden = true;
        if (scrollBadge) scrollBadge.hidden = true;
    }

    function statusLabel(state) {
        return state === "read" ? "✓✓ Leído" : state === "delivered" ? "✓✓ Entregado" : "✓ Enviado";
    }

    function formatDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
        });
    }

    function autosize() {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 140) + "px";
        if (counter) {
            const left = 5000 - input.value.length;
            counter.hidden = left > 500;
            counter.textContent = input.value.length + "/5000";
        }
    }

    /* ---------- STOMP ---------- */
    function sendFrame(command, headers = {}, body = "") {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket no conectado.");
        }

        const headerText = Object.entries(headers)
            .map(([key, value]) => key + ":" + value)
            .join("\n");

        socket.send(command + "\n" + headerText + "\n\n" + body + "\0");
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
            (element.querySelector(".message-meta") || element).appendChild(label);
        }

        const state = receipt.readAt ? "read" : receipt.deliveredAt ? "delivered" : "sent";
        label.dataset.state = state;
        label.textContent = statusLabel(state);
    }

    /** Devuelve true si el mensaje se añadió (y no existía antes). */
    function addMessage(message) {
        if (!message || message.id == null) return false;

        const id = String(message.id);
        const existing = list.querySelector('[data-message-id="' + id + '"]');

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
        article.className = "message is-new " + (mine ? "message-mine" : "message-other");
        article.dataset.messageId = id;
        article.dataset.mine = String(mine);

        const senderLine = document.createElement("p");
        senderLine.className = "sender visually-hidden";
        const sender = document.createElement("strong");
        sender.textContent = mine ? "Tú" : (message.senderUsername || "Usuario");
        senderLine.appendChild(sender);

        const content = document.createElement("p");
        content.className = "text";
        content.textContent = message.content || "";

        const meta = document.createElement("div");
        meta.className = "message-meta";

        if (message.sentAt) {
            const time = document.createElement("small");
            time.className = "message-time";
            time.textContent = formatDate(message.sentAt);
            meta.appendChild(time);
        }

        if (mine) {
            const state = message.readAt ? "read" : message.deliveredAt ? "delivered" : "sent";
            const label = document.createElement("small");
            label.className = "message-status";
            label.dataset.state = state;
            label.textContent = statusLabel(state);
            meta.appendChild(label);
        }

        article.append(senderLine, content, meta);
        list.appendChild(article);
        return true;
    }

    function sendReceipt(destination, id, set) {
        const key = String(id);
        if (!connected || set.has(key)) return;

        set.add(key);
        try {
            sendFrame("SEND", {
                destination,
                "content-type": "application/json"
            }, JSON.stringify({
                conversationId,
                messageId: Number(id)
            }));
        } catch (error) {
            set.delete(key);
            console.error("No se pudo confirmar el mensaje.", error);
        }
    }

    function confirmIncomingMessages() {
        if (!connected || document.visibilityState !== "visible") return;

        list.querySelectorAll(
            'article[data-message-id][data-mine="false"]'
        ).forEach(element => {
            const id = element.dataset.messageId;
            sendReceipt("/app/chat.delivered", id, deliveredSent);
            sendReceipt("/app/chat.read", id, readSent);
        });
    }

    function onIncoming(payload) {
        const wasNearBottom = nearBottom();
        const created = addMessage(payload);
        if (!created) return;

        const mine = Number(payload.senderId) === currentUserId;

        if (mine || wasNearBottom) {
            scrollToBottom(true);
        } else if (scrollBtn) {
            missed++;
            scrollBtn.hidden = false;
            if (scrollBadge) { scrollBadge.hidden = false; scrollBadge.textContent = String(missed); }
        }

        if (!mine) {
            if (document.visibilityState === "visible") {
                play("received");
            } else if (E.notify) {
                E.notify({ title: otherName, text: payload.content || "", toast: false });
            }
        }
    }

    function processFrame(frame) {
        frame = frame.replace(/\r\n/g, "\n");
        const separator = frame.indexOf("\n\n");
        if (separator < 0) return;

        const headerText = frame.substring(0, separator);
        const body = frame.substring(separator + 2);
        const lines = headerText.split("\n");
        const command = lines.shift();
        const headers = {};

        lines.forEach(line => {
            const index = line.indexOf(":");
            if (index > 0) {
                headers[line.substring(0, index).trim()] =
                    line.substring(index + 1).trim();
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

            connected = true;
            retryDelay = 1000;
            setStatus("En línea · tiempo real", "online");
            confirmIncomingMessages();
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

                if (destination !== topic) return;

                onIncoming(payload);

                if (Number(payload.senderId) !== currentUserId
                        && payload.id != null) {
                    sendReceipt(
                        "/app/chat.delivered", payload.id, deliveredSent
                    );

                    if (document.visibilityState === "visible") {
                        sendReceipt("/app/chat.read", payload.id, readSent);
                    }
                }
            } catch (error) {
                console.error("Error procesando evento STOMP.", error);
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
        const scheme = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(scheme + "//" + location.host + "/ws");
        socket = ws;
        buffer = "";

        ws.addEventListener("open", () => {
            if (socket !== ws) return;

            const csrf = form.querySelector('input[name="_csrf"]');
            const headers = {
                "accept-version": "1.2",
                host: location.host,
                "heart-beat": "0,0"
            };

            if (csrf?.value) headers["X-CSRF-TOKEN"] = csrf.value;

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
            setStatus("Desconectado. Intentando reconectar...", "offline");

            if (!manuallyClosed) {
                clearTimeout(retryTimer);
                retryTimer = setTimeout(() => {
                    retryDelay = Math.min(retryDelay * 2, 15000);
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
            return;
        }

        const content = input.value.trim();

        if (!content || content.length > 5000) {
            event.preventDefault();
            showError(!content
                ? "Escribe un mensaje antes de enviarlo."
                : "El mensaje no puede superar los 5000 caracteres.");
            return;
        }

        clearError();

        // Respaldo HTTP si no hay conexión STOMP.
        if (!connected || !socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }

        event.preventDefault();

        try {
            sendFrame("SEND", {
                destination: "/app/chat.send",
                "content-type": "application/json"
            }, JSON.stringify({ conversationId, content }));

            input.value = "";
            autosize();
            play("sent");
        } catch (error) {
            console.error(error);
            showError("No se pudo enviar por WebSocket. Usa el formulario de respaldo.");
            submittingHttp = true;
            form.requestSubmit();
        }
    });

    // Enter envía (en ordenador); Shift+Enter inserta salto de línea.
    const finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
    input.addEventListener("keydown", event => {
        if (finePointer && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            form.requestSubmit();
        }
    });
    input.addEventListener("input", () => { autosize(); if (errorBox && !errorBox.hidden) clearError(); });

    /* ---------- Emojis ---------- */
    if (emojiBtn && emojiPanel) {
        "😀 😂 😊 😍 🥰 😎 🤔 😅 😭 😢 😡 🥳 👍 👏 🙏 💪 🔥 ✨ ❤️ 💙 🌊 🐬 🐚 🏝️ ☀️ 🎉 👀 🙌 😴 🤝 💬 ✅".split(" ").forEach(emoji => {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = emoji;
            b.setAttribute("aria-label", "Insertar " + emoji);
            b.addEventListener("click", () => {
                const start = input.selectionStart ?? input.value.length;
                const end = input.selectionEnd ?? input.value.length;
                input.setRangeText(emoji, start, end, "end");
                input.focus();
                autosize();
            });
            emojiPanel.appendChild(b);
        });

        emojiBtn.addEventListener("click", () => { emojiPanel.hidden = !emojiPanel.hidden; });
        document.addEventListener("click", e => {
            if (!emojiPanel.hidden && !e.target.closest("#emojiPanel, #emojiToggle")) emojiPanel.hidden = true;
        });
        document.addEventListener("keydown", e => { if (e.key === "Escape") emojiPanel.hidden = true; });
    }

    /* ---------- Desplazamiento y ciclo de vida ---------- */
    scrollBtn?.addEventListener("click", () => scrollToBottom(true));
    list.addEventListener("scroll", () => {
        if (nearBottom()) { missed = 0; if (scrollBtn) scrollBtn.hidden = true; }
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            confirmIncomingMessages();
        }
    });

    window.addEventListener("beforeunload", () => {
        manuallyClosed = true;
        clearTimeout(retryTimer);
        if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    });

    list.style.scrollBehavior = "auto";
    scrollToBottom(false);
    window.addEventListener("load", () => scrollToBottom(false));
    setTimeout(() => { list.style.scrollBehavior = ""; }, 400);
    autosize();
    connect();
})();
