/* =========================================================
   EKKO · conversaciones.js
   Lista de conversaciones en tiempo real.
   Los avisos (campana, toast, sonido) los gestiona notificaciones.js
   para no duplicarlos; aquí solo se actualiza la lista.
   ========================================================= */
(() => {
    "use strict";

    const E = window.Ekko || {};
    const currentUserId = Number(document.body.dataset.currentUserId);
    const status = document.getElementById("connectionStatus");

    function setStatus(text, state) {
        if (!status) return;
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

    const conversations = Array.from(document.querySelectorAll("[data-conversation-id]"));

    function totalUnread() {
        return conversations.reduce((sum, el) =>
            sum + (Number(el.querySelector(".unread-count")?.textContent) || 0), 0);
    }

    // Al cargar, el contador global refleja los no leídos reales de la lista.
    if (E.setUnread) E.setUnread(totalUnread());

    if (conversations.length === 0) {
        setStatus("Aún no hay conversaciones.", "offline");
        return;
    }

    let socket = null;
    let buffer = "";
    let retryTimer = null;
    let retryDelay = 1000;
    let manuallyClosed = false;
    let subscriptionSequence = 0;

    function sendFrame(command, headers = {}, body = "") {
        if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("WebSocket no conectado.");
        const headerText = Object.entries(headers).map(([k, v]) => k + ":" + v).join("\n");
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
        retryDelay = 1000;
        setStatus("En línea", "online");
    }

    function formatDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
        });
    }

    function updateConversation(message, conversationId) {
        if (!message || message.id == null) return;

        const element = conversations.find(item => item.dataset.conversationId === String(conversationId));
        if (!element) return;

        const lastMessage = element.querySelector(".last-message");
        const lastMessageAt = element.querySelector(".last-message-at");
        const unreadCount = element.querySelector(".unread-count");
        const unreadLabel = element.querySelector(".unread");

        if (lastMessage) lastMessage.textContent = message.content || "";
        if (lastMessageAt) lastMessageAt.textContent = message.sentAt ? formatDate(message.sentAt) : "";

        const senderId = Number(message.senderId);
        const incoming = Number.isFinite(senderId) && senderId !== currentUserId;

        if (incoming && unreadCount) {
            unreadCount.textContent = String((Number(unreadCount.textContent) || 0) + 1);
            unreadLabel?.classList.add("has-unread");
        }

        // La conversación más reciente sube al comienzo de la lista.
        const parent = element.parentElement;
        if (parent && element !== parent.firstElementChild) {
            parent.insertBefore(element, parent.firstElementChild);
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
            if (index > 0) headers[line.substring(0, index).trim()] = line.substring(index + 1).trim();
        });

        if (command === "CONNECTED") {
            try { subscribeAll(); }
            catch (error) { console.error("Error al suscribir conversaciones.", error); socket?.close(); }
            return;
        }

        if (command === "MESSAGE") {
            try {
                const match = (headers.destination || "").match(/^\/topic\/conversations\/(\d+)$/);
                if (!match) return;
                updateConversation(JSON.parse(body), match[1]);
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

        setStatus("Conectando...", "connecting");
        const scheme = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(scheme + "//" + location.host + "/ws");
        socket = ws;
        buffer = "";

        ws.addEventListener("open", () => {
            if (socket !== ws) return;
            sendFrame("CONNECT", { "accept-version": "1.2", host: location.host, "heart-beat": "0,0" });
        });

        ws.addEventListener("message", event => {
            if (socket !== ws) return;
            buffer += event.data;
            const frames = buffer.split("\0");
            buffer = frames.pop() || "";
            frames.forEach(frame => { if (frame.trim()) processFrame(frame); });
        });

        ws.addEventListener("close", () => {
            if (socket !== ws) return;
            setStatus("Sin conexión. Reconectando...", "offline");
            if (!manuallyClosed) {
                clearTimeout(retryTimer);
                retryTimer = setTimeout(() => {
                    retryDelay = Math.min(retryDelay * 2, 15000);
                    connect();
                }, retryDelay);
            }
        });

        ws.addEventListener("error", error => console.error("Error WebSocket.", error));
    }

    window.addEventListener("beforeunload", () => {
        manuallyClosed = true;
        clearTimeout(retryTimer);
        if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    });

    connect();
})();
