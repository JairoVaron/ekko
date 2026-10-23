/* =========================================================
   EKKO · Lista de conversaciones en tiempo real
   ========================================================= */
(() => {
    "use strict";

    const E = window.Ekko || {};

    const currentUserId = Number(document.body.dataset.currentUserId);
    const status = document.getElementById("connectionStatus");

    function setStatus(text, state) {
        status.textContent = text;
        status.dataset.state = state || "connecting";
    }

    /* ---------- Filtro local por nombre ---------- */
    const filter = document.getElementById("conversationFilter");
    const noMatches = document.getElementById("noMatches");
    filter?.addEventListener("input", () => {
        const q = filter.value.trim().toLowerCase();
        let visible = 0;
        document.querySelectorAll("[data-conversation-id]").forEach(el => {
            const hit = !q || (el.dataset.search || "").includes(q);
            el.classList.toggle("is-hidden", !hit);
            if (hit) visible++;
        });
        if (noMatches) noMatches.hidden = visible > 0;
    });

    if (!currentUserId || !Number.isFinite(currentUserId)) {
        setStatus("No se pudo identificar al usuario.", "offline");
        return;
    }

    const conversations = Array.from(
        document.querySelectorAll("[data-conversation-id]")
    );

    function totalUnread() {
        return conversations.reduce((sum, el) =>
            sum + (Number(el.querySelector(".unread-count")?.textContent) || 0), 0);
    }

    if (E.setUnread) E.setUnread(totalUnread());

    if (conversations.length === 0) {
        setStatus("No hay conversaciones para escuchar.", "offline");
        return;
    }

    let socket = null;
    let connected = false;
    let buffer = "";
    let retryTimer = null;
    let retryDelay = 1000;
    let manuallyClosed = false;
    let subscriptionSequence = 0;

    function sendFrame(command, headers = {}, body = "") {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket no conectado.");
        }

        const headerText = Object.entries(headers)
            .map(([key, value]) => key + ":" + value)
            .join("\n");

        socket.send(command + "\n" + headerText + "\n\n" + body + "\0");
    }

    function subscribeAll() {
        conversations.forEach(element => {
            const id = element.dataset.conversationId;
            if (!id) return;

            sendFrame("SUBSCRIBE", {
                id: "list-" + id + "-" + (++subscriptionSequence),
                destination: "/topic/conversations/" + id
            });
        });

        connected = true;
        retryDelay = 1000;
        setStatus("En línea · lista en tiempo real", "online");
    }

    function updateConversation(message, conversationId) {
        if (!message || message.id == null) return;

        const element = conversations.find(item =>
            item.dataset.conversationId === String(conversationId)
        );

        if (!element) return;

        const lastMessage = element.querySelector(".last-message");
        const lastMessageAt = element.querySelector(".last-message-at");
        const unreadCount = element.querySelector(".unread-count");
        const unreadLabel = element.querySelector(".unread");

        if (lastMessage) {
            lastMessage.textContent = message.content || "";
        }

        if (lastMessageAt) {
            if (message.sentAt) {
                const date = new Date(message.sentAt);
                lastMessageAt.textContent = Number.isNaN(date.getTime())
                    ? "" : date.toLocaleString([], {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                    });
            } else {
                lastMessageAt.textContent = "";
            }
        }

        const senderId = Number(message.senderId);
        const incoming = Number.isFinite(senderId)
            && senderId !== currentUserId;

        if (incoming && unreadCount) {
            const previous = Number(unreadCount.textContent) || 0;
            unreadCount.textContent = String(previous + 1);
            unreadLabel?.classList.add("has-unread");

            if (E.notify) {
                E.notify({
                    title: element.dataset.otherName || "Nuevo mensaje",
                    text: message.content || ""
                });
                E.setUnread(totalUnread());
            }
        }

        // Mueve la conversación más reciente al comienzo de la lista.
        const parent = element.parentElement;
        if (parent && element !== parent.firstElementChild) {
            parent.insertBefore(element, parent.firstElementChild);
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
            try {
                subscribeAll();
            } catch (error) {
                console.error("Error al suscribir conversaciones.", error);
                socket?.close();
            }
            return;
        }

        if (command === "MESSAGE") {
            try {
                const destination = headers.destination || "";
                const match = destination.match(
                    /^\/topic\/conversations\/(\d+)$/
                );

                if (!match) return;

                const conversationId = match[1];
                const message = JSON.parse(body);
                updateConversation(message, conversationId);
            } catch (error) {
                console.error("No se pudo actualizar la lista.", error);
            }
            return;
        }

        if (command === "ERROR") {
            console.error("Error STOMP:", body);
            setStatus("El servidor rechazó una suscripción.", "offline");
        }
    }

    function connect() {
        if (manuallyClosed) return;

        connected = false;
        setStatus("Conectando...", "connecting");
        const scheme = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(scheme + "//" + location.host + "/ws");

        socket = ws;
        buffer = "";

        ws.addEventListener("open", () => {
            if (socket !== ws) return;

            const headers = {
                "accept-version": "1.2",
                host: location.host,
                "heart-beat": "0,0"
            };

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

    window.addEventListener("beforeunload", () => {
        manuallyClosed = true;
        clearTimeout(retryTimer);
        if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    });

    connect();
})();
