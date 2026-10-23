/*
 * EKKO - Notificaciones globales
 * Requiere ekko.js y el endpoint STOMP /ws.
 */
(function () {
    'use strict';

    if (window.__ekkoNotificationsStarted) {
        return;
    }
    window.__ekkoNotificationsStarted = true;

    var socket = null;
    var reconnectTimer = null;
    var reconnectDelay = 1000;
    var maxReconnectDelay = 15000;
    var manuallyClosed = false;
    var connected = false;
    var subscriptionId = 'ekko-global-notifications';
    var buffer = '';
    var heartbeatTimer = null;
    var lastServerActivity = Date.now();
    var heartbeatWatchdog = null;

    function log(message, error) {
        if (window.console && typeof window.console.warn === 'function') {
            console.warn('[Ekko notificaciones] ' + message, error || '');
        }
    }

    function hasEkkoNavbar() {
        return !!document.querySelector('[data-ekko-unread]');
    }

    function currentConversationId() {
        var value = document.body
            ? document.body.getAttribute('data-conversation-id')
            : null;

        var id = Number(value);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    function websocketUrl() {
        var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return protocol + '//' + window.location.host + '/ws';
    }

    function sendFrame(command, headers, body) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return false;
        }

        var frame = command + '\n';

        Object.keys(headers || {}).forEach(function (key) {
            frame += key + ':' + String(headers[key]) + '\n';
        });

        frame += '\n';

        if (body) {
            frame += body;
        }

        frame += '\0';

        try {
            socket.send(frame);
            return true;
        } catch (error) {
            log('No se pudo enviar una trama STOMP.', error);
            return false;
        }
    }

    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }

        if (heartbeatWatchdog) {
            clearInterval(heartbeatWatchdog);
            heartbeatWatchdog = null;
        }
    }

    function startHeartbeat(serverHeader) {
        stopHeartbeat();

        var values = (serverHeader || '0,0').split(',');
        var serverCanSend = parseInt(values[0], 10) || 0;
        var clientCanSend = parseInt(values[1], 10) || 0;

        if (clientCanSend > 0) {
            heartbeatTimer = setInterval(function () {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    try {
                        socket.send('\n');
                    } catch (error) {
                        log('No se pudo enviar el latido.', error);
                    }
                }
            }, Math.max(10000, clientCanSend));
        }

        if (serverCanSend > 0) {
            lastServerActivity = Date.now();

            heartbeatWatchdog = setInterval(function () {
                if (!socket || socket.readyState !== WebSocket.OPEN) {
                    return;
                }

                if (Date.now() - lastServerActivity > serverCanSend * 2 + 10000) {
                    log('Se perdió la actividad del servidor; se reiniciará la conexión.');
                    socket.close();
                }
            }, Math.max(10000, serverCanSend));
        }
    }

    function scheduleReconnect() {
        if (manuallyClosed || reconnectTimer || !hasEkkoNavbar()) {
            return;
        }

        reconnectTimer = setTimeout(function () {
            reconnectTimer = null;
            connect();
        }, reconnectDelay);

        reconnectDelay = Math.min(
            reconnectDelay * 2,
            maxReconnectDelay
        );
    }

    function showNotification(notification) {
        if (!notification || !window.Ekko ||
            typeof window.Ekko.notify !== 'function') {
            return;
        }

        var processedNotificationIds = new Set();
        var conversationId = Number(notification.conversationId);
        var activeConversation = currentConversationId();

        // chat.js gestiona los mensajes de la conversación que está abierta.
        if (activeConversation &&
            conversationId === activeConversation) {
            return;
        }

        var sender = notification.senderName || 'Nuevo mensaje';
        var content = notification.content || 'Te ha llegado un mensaje.';

        if (content.length > 180) {
            content = content.substring(0, 177) + '...';
        }

        window.Ekko.notify({
            title: sender,
            text: content,
            sound: 'notify',
            desktop: true
        });

        var messageId = notification.messageId;

        if (messageId != null) {
            var notificationKey = String(messageId);

            if (processedNotificationIds.has(notificationKey)) {
                return;
            }

            processedNotificationIds.add(notificationKey);

            // Evita que el conjunto crezca indefinidamente.
            if (processedNotificationIds.size > 500) {
                var oldestKey = processedNotificationIds.values().next().value;
                processedNotificationIds.delete(oldestKey);
            }
        }
    }

    function processFrame(frame) {
        frame = frame.replace(/\r\n/g, '\n');

        if (!frame.trim()) {
            return;
        }

        var separator = frame.indexOf('\n\n');

        if (separator < 0) {
            return;
        }

        var headerText = frame.substring(0, separator);
        var body = frame.substring(separator + 2);
        var lines = headerText.split('\n');
        var command = lines.shift();
        var headers = {};

        lines.forEach(function (line) {
            var index = line.indexOf(':');

            if (index > 0) {
                headers[line.substring(0, index)] =
                    line.substring(index + 1);
            }
        });

        lastServerActivity = Date.now();

        if (command === 'CONNECTED') {
            connected = true;
            reconnectDelay = 1000;

            startHeartbeat(headers['heart-beat']);

            sendFrame('SUBSCRIBE', {
                id: subscriptionId,
                destination: '/user/queue/notifications',
                ack: 'auto'
            });

            return;
        }

        if (command === 'MESSAGE') {
            if (headers.subscription &&
                headers.subscription !== subscriptionId) {
                return;
            }

            try {
                showNotification(JSON.parse(body));
            } catch (error) {
                log('No se pudo interpretar una notificación.', error);
            }

            return;
        }

        if (command === 'ERROR') {
            log('El servidor devolvió un error STOMP.', body);
            if (socket) {
                socket.close();
            }
        }
    }

    function processIncoming(data) {
        // Los latidos STOMP pueden ser saltos de línea sin trama completa.
        if (data === '\n' || data === '\r\n') {
            lastServerActivity = Date.now();
            return;
        }

        buffer += data;

        var boundary;

        while ((boundary = buffer.indexOf('\0')) !== -1) {
            var frame = buffer.substring(0, boundary);
            buffer = buffer.substring(boundary + 1);

            if (frame.trim()) {
                processFrame(frame);
            }
        }

        if (buffer.length > 100000) {
            buffer = '';
            log('Se descartó un búfer STOMP demasiado grande.');
        }
    }

    function connect() {
        if (manuallyClosed || !hasEkkoNavbar()) {
            return;
        }

        if (socket &&
            (socket.readyState === WebSocket.OPEN ||
             socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        try {
            buffer = '';
            connected = false;
            socket = new WebSocket(websocketUrl());

            socket.onopen = function () {
                sendFrame('CONNECT', {
                    'accept-version': '1.2',
                    'heart-beat': '10000,10000'
                });
            };

            socket.onmessage = function (event) {
                if (typeof event.data === 'string') {
                    processIncoming(event.data);
                }
            };

            socket.onerror = function () {
                log('La conexión de notificaciones presentó un error.');
            };

            socket.onclose = function () {
                connected = false;
                stopHeartbeat();
                socket = null;
                scheduleReconnect();
            };
        } catch (error) {
            log('No se pudo iniciar la conexión WebSocket.', error);
            socket = null;
            scheduleReconnect();
        }
    }

    function closeConnection() {
        manuallyClosed = true;

        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        stopHeartbeat();

        if (socket) {
            try {
                if (connected) {
                    sendFrame('DISCONNECT', {});
                }
                socket.close();
            } catch (error) {
                log('Error al cerrar la conexión.', error);
            }
        }

        connected = false;
        socket = null;
    }

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && !connected) {
            connect();
        }
    });

    window.addEventListener('online', function () {
        if (!connected) {
            reconnectDelay = 1000;
            connect();
        }
    });

    window.addEventListener('pagehide', closeConnection);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', connect, { once: true });
    } else {
        connect();
    }
})();
