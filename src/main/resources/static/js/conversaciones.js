/* =========================================================
   EKKO · conversaciones.js
   Gestión de conversaciones en tiempo real.
   ========================================================= */

(() => {
    "use strict";

    /* =====================================================
       1. EVITAR INICIALIZACIÓN DUPLICADA
       ===================================================== */

    if (window.__ekkoConversationsInitialized) {
        return;
    }

    window.__ekkoConversationsInitialized = true;

    /* =====================================================
       2. ELEMENTOS DEL DOCUMENTO
       ===================================================== */

    const E = window.Ekko || {};

    const currentUserId = Number(
        document.body?.dataset.currentUserId
    );

    const status = document.getElementById(
        "connectionStatus"
    );

    const filter = document.getElementById(
        "conversationFilter"
    );

    const noMatches = document.getElementById(
        "noMatches"
    );

    const conversationList = document.querySelector(
        ".ek-conv-list"
    );

    const conversations = Array.from(
        document.querySelectorAll(
            ".ek-conv[data-conversation-id]"
        )
    );

    /* =====================================================
       3. CONFIGURACIÓN
       ===================================================== */

    const CONFIG = {
        websocketPath: "/ws",

        // Tiempo sin recibir eventos antes de ocultar
        // automáticamente el indicador de escritura.
        typingTimeout: 4500,

        // Reconexión progresiva.
        initialRetryDelay: 1000,
        maxRetryDelay: 15000
    };

    /* =====================================================
       4. ESTADO
       ===================================================== */

    let socket = null;
    let buffer = "";

    let retryTimer = null;
    let retryDelay = CONFIG.initialRetryDelay;

    let manuallyClosed = false;
    let subscriptionSequence = 0;

    // Un temporizador independiente por conversación.
    const typingTimers = new Map();

    /* =====================================================
       5. ESTADO DE CONEXIÓN
       ===================================================== */

    function setStatus(message, state = "connecting") {
        if (!status) {
            return;
        }

        status.textContent = message;
        status.dataset.state = state;
    }

    /* =====================================================
       6. VALIDACIÓN DEL USUARIO
       ===================================================== */

    if (
        !Number.isSafeInteger(currentUserId) ||
        currentUserId <= 0
    ) {
        setStatus(
            "No se pudo identificar al usuario.",
            "offline"
        );

        console.error(
            "Ekko: currentUserId no es válido. " +
            "Comprueba data-current-user-id en el body."
        );

        return;
    }

    /* =====================================================
       7. UTILIDADES
       ===================================================== */

    function findConversation(conversationId) {
        const id = String(conversationId);

        return conversations.find(element => {
            return String(
                element.dataset.conversationId
            ) === id;
        }) || null;
    }

    function formatDate(value) {
        if (!value) {
            return "";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        return date.toLocaleString("es-CO", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function getMessageSenderId(message) {
        const value = message?.senderId;

        if (value === null || value === undefined) {
            return null;
        }

        const id = Number(value);

        if (
            !Number.isSafeInteger(id) ||
            id <= 0
        ) {
            return null;
        }

        return id;
    }

    function getUnreadCount(element) {
        const counter = element.querySelector(
            ".unread-count"
        );

        if (!counter) {
            return 0;
        }

        return Math.max(
            0,
            Number(counter.textContent) || 0
        );
    }

    /* =====================================================
       8. CONTADORES GLOBALES
       ===================================================== */

    function updateGlobalUnreadCount() {
        if (
            !E.chats ||
            typeof E.chats.set !== "function"
        ) {
            return;
        }

        const unreadMap = {};

        conversations.forEach(element => {
            const id = element.dataset.conversationId;

            if (!id) {
                return;
            }

            const count = getUnreadCount(element);

            if (count > 0) {
                unreadMap[id] = count;
            }
        });

        E.chats.set(unreadMap);
    }

    function updateUnreadUI(element, newCount) {
        const counter = element.querySelector(
            ".unread-count"
        );

        const unreadPill = element.querySelector(
            ".unread"
        );

        const count = Math.max(
            0,
            Number(newCount) || 0
        );

        if (counter) {
            counter.textContent = String(count);
        }

        if (unreadPill) {
            unreadPill.classList.toggle(
                "has-unread",
                count > 0
            );
        }

        updateGlobalUnreadCount();
    }

    /* =====================================================
       9. FILTRO DE CONVERSACIONES
       ===================================================== */

    function applyConversationFilter() {
        if (!filter) {
            return;
        }

        const query = filter.value
            .trim()
            .toLocaleLowerCase("es");

        let visible = 0;

        conversations.forEach(element => {
            const searchText = (
                element.dataset.search ||
                element.dataset.otherName ||
                ""
            ).toLocaleLowerCase("es");

            const matches =
                !query || searchText.includes(query);

            element.classList.toggle(
                "is-hidden",
                !matches
            );

            if (matches) {
                visible++;
            }
        });

        if (noMatches) {
            noMatches.hidden = visible > 0;
        }
    }

    filter?.addEventListener(
        "input",
        applyConversationFilter
    );

    /* =====================================================
       10. INDICADORES DE ESCRITURA
       ===================================================== */

    function clearTypingTimer(conversationId) {
        const id = String(conversationId);

        const timer = typingTimers.get(id);

        if (timer !== undefined) {
            clearTimeout(timer);
            typingTimers.delete(id);
        }
    }

    function hideTypingIndicator(conversationId) {
        const id = String(conversationId);

        clearTypingTimer(id);

        const element = findConversation(id);

        if (!element) {
            return;
        }

        const indicator = element.querySelector(
            ".conversation-typing"
        );

        const lastMessage = element.querySelector(
            ".last-message"
        );

        if (indicator) {
            indicator.hidden = true;
        }

        // Volver a mostrar el último mensaje.
        if (lastMessage) {
            lastMessage.hidden = false;
        }
    }

    function showTypingIndicator(conversationId) {
        const id = String(conversationId);

        const element = findConversation(id);

        if (!element) {
            return;
        }

        const indicator = element.querySelector(
            ".conversation-typing"
        );

        const lastMessage = element.querySelector(
            ".last-message"
        );

        if (!indicator) {
            console.warn(
                "Ekko: falta .conversation-typing " +
                `en la conversación ${id}.`
            );

            return;
        }

        // Reiniciar el temporizador anterior.
        clearTypingTimer(id);

        // Mostrar el indicador.
        indicator.hidden = false;

        // Ocultar temporalmente el último mensaje
        // para que no aparezcan ambos textos juntos.
        if (lastMessage) {
            lastMessage.hidden = true;
        }

        // Si dejan de llegar eventos, ocultar el indicador.
        const timer = setTimeout(() => {
            hideTypingIndicator(id);
        }, CONFIG.typingTimeout);

        typingTimers.set(id, timer);
    }

    function clearAllTypingIndicators() {
        conversations.forEach(element => {
            const id = element.dataset.conversationId;

            if (id) {
                hideTypingIndicator(id);
            }
        });

        typingTimers.forEach(timer => {
            clearTimeout(timer);
        });

        typingTimers.clear();
    }

    function processTypingEvent(event, conversationId) {
        if (
            !event ||
            typeof event !== "object"
        ) {
            return;
        }

        const id = String(conversationId);

        /*
         * El ID de conversación ya viene determinado
         * por el destino STOMP:
         *
         * /topic/conversations/{id}/typing
         *
         * Si el JSON también contiene conversationId,
         * comprobamos que coincida.
         */

        if (
            event.conversationId !== null &&
            event.conversationId !== undefined &&
            String(event.conversationId) !== id
        ) {
            return;
        }

        /*
         * Aceptamos userId o senderId para identificar
         * al usuario que está escribiendo.
         */

        const senderId = Number(
            event.userId ?? event.senderId
        );

        if (
            !Number.isSafeInteger(senderId) ||
            senderId <= 0
        ) {
            console.warn(
                "Ekko: evento de escritura sin un " +
                "identificador de usuario válido.",
                event
            );

            return;
        }

        // Ignorar nuestros propios eventos.
        if (senderId === currentUserId) {
            return;
        }

        // El backend debe indicar si está escribiendo.
        if (typeof event.typing !== "boolean") {
            console.warn(
                "Ekko: el evento de escritura no contiene " +
                "un booleano válido en typing.",
                event
            );

            return;
        }

        if (event.typing) {
            showTypingIndicator(id);
        } else {
            hideTypingIndicator(id);
        }
    }

    /* =====================================================
       11. ACTUALIZAR EL ÚLTIMO MENSAJE
       ===================================================== */

    function updateLastMessage(message, element) {
        const lastMessage = element.querySelector(
            ".last-message"
        );

        const lastMessageAt = element.querySelector(
            ".last-message-at"
        );

        /*
         * El MessageView del backend utiliza:
         *
         * id
         * senderId
         * senderUsername
         * content
         * sentAt
         * mine
         * deliveredAt
         * readAt
         */

        if (lastMessage) {
            lastMessage.textContent =
                message.content ?? "";

            lastMessage.hidden = false;
        }

        if (lastMessageAt) {
            lastMessage.textContent =
                message.sentAt
                    ? formatDate(message.sentAt)
                    : "";
        }

        // Si se recibe un mensaje, ya no debe aparecer
        // el indicador de escritura anterior.
        hideTypingIndicator(
            element.dataset.conversationId
        );
    }

    /* =====================================================
       12. ACTUALIZAR ACTIVIDAD DE CONVERSACIÓN
       ===================================================== */

    function moveConversationToTop(element) {
        if (!conversationList || !element) {
            return;
        }

        if (
            element.parentElement !== conversationList
        ) {
            return;
        }

        if (
            element === conversationList.firstElementChild
        ) {
            return;
        }

        conversationList.insertBefore(
            element,
            conversationList.firstElementChild
        );
    }

    /* =====================================================
       13. PROCESAR UN MENSAJE NUEVO
       ===================================================== */

    function updateConversation(message, conversationId) {
        if (
            !message ||
            typeof message !== "object"
        ) {
            return;
        }

        // El DTO actual utiliza id como identificador.
        if (
            message.id === null ||
            message.id === undefined
        ) {
            console.warn(
                "Ekko: mensaje recibido sin identificador.",
                message
            );

            return;
        }

        const element = findConversation(
            conversationId
        );

        if (!element) {
            return;
        }

        // Actualizar el texto y la fecha.
        updateLastMessage(message, element);

        // Identificar al remitente.
        const senderId = getMessageSenderId(message);

        /*
         * En una conversación privada:
         * - senderId distinto del usuario actual = entrante.
         * - senderId igual al usuario actual = enviado por mí.
         */

        const incoming =
            senderId !== null &&
            senderId !== currentUserId;

        /*
         * La página de conversaciones no es el chat abierto.
         * Por tanto, un mensaje entrante incrementa el contador.
         */

        if (incoming) {
            const currentCount = getUnreadCount(element);

            updateUnreadUI(
                element,
                currentCount + 1
            );
        }

        // El mensaje más reciente debe quedar primero.
        moveConversationToTop(element);

        console.debug(
            "Ekko: conversación actualizada en tiempo real.",
            {
                conversationId,
                messageId: message.id,
                senderId,
                incoming
            }
        );
    }

    /* =====================================================
       14. INICIALIZAR CONTADORES
       ===================================================== */

    updateGlobalUnreadCount();

    /* =====================================================
       15. ENVIAR FRAMES STOMP
       ===================================================== */

    function sendFrame(
        command,
        headers = {},
        body = ""
    ) {
        if (
            !socket ||
            socket.readyState !== WebSocket.OPEN
        ) {
            throw new Error(
                "WebSocket no conectado."
            );
        }

        const headerText = Object.entries(headers)
            .map(([key, value]) => {
                return `${key}:${value}`;
            })
            .join("\n");

        const frame =
            command +
            "\n" +
            headerText +
            "\n\n" +
            body +
            "\0";

        socket.send(frame);
    }

    /* =====================================================
       16. SUSCRIBIRSE A LAS CONVERSACIONES
       ===================================================== */

    function subscribeAll() {
        conversations.forEach(element => {
            const id = element.dataset.conversationId;

            if (
                !id ||
                !/^\d+$/.test(id)
            ) {
                console.warn(
                    "Ekko: ID de conversación no válido.",
                    id
                );

                return;
            }

            /*
             * SUSCRIPCIÓN A MENSAJES
             *
             * /topic/conversations/{id}
             */

            sendFrame("SUBSCRIBE", {
                id:
                    "list-messages-" +
                    id +
                    "-" +
                    (++subscriptionSequence),

                destination:
                    "/topic/conversations/" + id,

                ack: "auto"
            });

            /*
             * SUSCRIPCIÓN A ESCRITURA
             *
             * /topic/conversations/{id}/typing
             */

            sendFrame("SUBSCRIBE", {
                id:
                    "list-typing-" +
                    id +
                    "-" +
                    (++subscriptionSequence),

                destination:
                    "/topic/conversations/" +
                    id +
                    "/typing",

                ack: "auto"
            });
        });

        retryDelay = CONFIG.initialRetryDelay;

        setStatus(
            "En línea",
            "online"
        );

        console.info(
            "Ekko: suscripciones realizadas.",
            {
                conversations: conversations.length
            }
        );
    }

    /* =====================================================
       17. PROCESAR FRAMES STOMP
       ===================================================== */

    function processFrame(frame) {
        frame = frame.replace(/\r\n/g, "\n");

        if (!frame.trim()) {
            return;
        }

        const separator = frame.indexOf("\n\n");

        if (separator < 0) {
            return;
        }

        const headerContent = frame.substring(
            0,
            separator
        );

        const body = frame.substring(
            separator + 2
        );

        const lines = headerContent.split("\n");

        const command = lines.shift()?.trim();

        const headers = {};

        lines.forEach(line => {
            const index = line.indexOf(":");

            if (index <= 0) {
                return;
            }

            const key = line
                .substring(0, index)
                .trim();

            const value = line
                .substring(index + 1)
                .trim();

            headers[key] = value;
        });

        /* ---------------------------------------------
           CONEXIÓN ESTABLECIDA
           --------------------------------------------- */

        if (command === "CONNECTED") {
            try {
                subscribeAll();
            } catch (error) {
                console.error(
                    "Ekko: error al suscribir conversaciones.",
                    error
                );

                socket?.close();
            }

            return;
        }

        /* ---------------------------------------------
           MENSAJES RECIBIDOS
           --------------------------------------------- */

        if (command === "MESSAGE") {
            const destination =
                headers.destination || "";

            /*
             * Mensaje normal:
             * /topic/conversations/{id}
             */

            const messageMatch = destination.match(
                /^\/topic\/conversations\/(\d+)$/
            );

            /*
             * Indicador de escritura:
             * /topic/conversations/{id}/typing
             */

            const typingMatch = destination.match(
                /^\/topic\/conversations\/(\d+)\/typing$/
            );

            if (!body.trim()) {
                return;
            }

            let payload;

            try {
                payload = JSON.parse(body);
            } catch (error) {
                console.error(
                    "Ekko: el contenido del frame no es JSON válido.",
                    {
                        destination,
                        body,
                        error
                    }
                );

                return;
            }

            // Procesar indicador de escritura.
            if (typingMatch) {
                processTypingEvent(
                    payload,
                    typingMatch[1]
                );

                return;
            }

            // Procesar mensaje nuevo.
            if (messageMatch) {
                updateConversation(
                    payload,
                    messageMatch[1]
                );

                return;
            }

            return;
        }

        /* ---------------------------------------------
           ERRORES DEL SERVIDOR
           --------------------------------------------- */

        if (command === "ERROR") {
            console.error(
                "Ekko: error STOMP del servidor.",
                body
            );

            setStatus(
                "Error en la conexión.",
                "offline"
            );

            socket?.close();
        }
    }

    /* =====================================================
       18. RECONEXIÓN AUTOMÁTICA
       ===================================================== */

    function scheduleReconnect() {
        if (manuallyClosed) {
            return;
        }

        clearTimeout(retryTimer);

        const delay = retryDelay;

        retryTimer = setTimeout(() => {
            retryDelay = Math.min(
                retryDelay * 2,
                CONFIG.maxRetryDelay
            );

            connect();
        }, delay);
    }

    /* =====================================================
       19. CONEXIÓN WEBSOCKET
       ===================================================== */

    function connect() {
        if (manuallyClosed) {
            return;
        }

        setStatus(
            "Conectando...",
            "connecting"
        );

        const scheme =
            location.protocol === "https:"
                ? "wss:"
                : "ws:";

        const wsUrl =
            scheme +
            "//" +
            location.host +
            CONFIG.websocketPath;

        let ws;

        try {
            ws = new WebSocket(wsUrl);
        } catch (error) {
            console.error(
                "Ekko: no se pudo crear WebSocket.",
                error
            );

            setStatus(
                "Sin conexión. Reconectando...",
                "offline"
            );

            scheduleReconnect();
            return;
        }

        socket = ws;
        buffer = "";

        /* ---------------------------------------------
           APERTURA
           --------------------------------------------- */

        ws.addEventListener("open", () => {
            if (socket !== ws) {
                return;
            }

            try {
                sendFrame("CONNECT", {
                    "accept-version": "1.2",
                    host: location.host,
                    "heart-beat": "0,0"
                });
            } catch (error) {
                console.error(
                    "Ekko: no se pudo iniciar STOMP.",
                    error
                );

                ws.close();
            }
        });

        /* ---------------------------------------------
           RECEPCIÓN DE DATOS
           --------------------------------------------- */

        ws.addEventListener("message", event => {
            if (socket !== ws) {
                return;
            }

            if (typeof event.data !== "string") {
                console.warn(
                    "Ekko: se recibió un frame WebSocket no textual."
                );

                return;
            }

            buffer += event.data;

            const frames = buffer.split("\0");

            // El último fragmento puede estar incompleto.
            buffer = frames.pop() || "";

            frames.forEach(frame => {
                if (frame.trim()) {
                    processFrame(frame);
                }
            });
        });

        /* ---------------------------------------------
           CIERRE
           --------------------------------------------- */

        ws.addEventListener("close", () => {
            if (socket !== ws) {
                return;
            }

            socket = null;

            buffer = "";

            clearAllTypingIndicators();

            setStatus(
                "Sin conexión. Reconectando...",
                "offline"
            );

            if (!manuallyClosed) {
                scheduleReconnect();
            }
        });

        /* ---------------------------------------------
           ERRORES
           --------------------------------------------- */

        ws.addEventListener("error", error => {
            console.error(
                "Ekko: error en WebSocket.",
                error
            );
        });
    }

    /* =====================================================
       20. LIMPIEZA AL SALIR
       ===================================================== */

    window.addEventListener("beforeunload", () => {
        manuallyClosed = true;

        clearTimeout(retryTimer);

        clearAllTypingIndicators();

        if (
            socket &&
            socket.readyState === WebSocket.OPEN
        ) {
            socket.close();
        }
    });

    /* =====================================================
       21. INICIALIZACIÓN
       ===================================================== */

    applyConversationFilter();

    connect();

})();