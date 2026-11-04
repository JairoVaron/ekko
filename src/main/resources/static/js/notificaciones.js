/*
 * EKKO · notificaciones.js
 * Conexión STOMP global para notificaciones y actualizaciones de contactos.
 */
(function () {
    'use strict';

    if (window.__ekkoNotificationsStarted) {
        return;
    }

    window.__ekkoNotificationsStarted = true;

    var NOTIFICATIONS_ID = 'ekko-global-notifications';
    var CONTACTS_ID = 'ekko-contacts-updates';

    var MAX_RECONNECT_DELAY = 15000;

    var socket = null;
    var reconnectTimer = null;
    var reconnectDelay = 1000;
    var manuallyClosed = false;
    var connected = false;
    var buffer = '';
    var heartbeatTimer = null;
    var heartbeatWatchdog = null;
    var lastServerActivity = Date.now();
    var processed = new Set();

    function log(message, error) {
        if (window.console && console.warn) {
            console.warn('[Ekko notificaciones] ' + message, error || '');
        }
    }

    function hasEkkoNavbar() {
        return !!document.querySelector('[data-ekko-unread]');
    }

    function currentConversationId() {
        var id = Number(
            document.body
                ? document.body.getAttribute('data-conversation-id')
                : null
        );

        return Number.isFinite(id) && id > 0 ? id : null;
    }

    function websocketUrl() {
        return (location.protocol === 'https:' ? 'wss:' : 'ws:')
            + '//' + location.host + '/ws';
    }

    function sendFrame(command, headers, body) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return false;
        }

        var frame = command + '\n';

        Object.keys(headers || {}).forEach(function (key) {
            frame += key + ':' + String(headers[key]) + '\n';
        });

        frame += '\n' + (body || '') + '\0';

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

                if (Date.now() - lastServerActivity
                        > serverCanSend * 2 + 10000) {

                    log('Se perdió la actividad del servidor; se reinicia la conexión.');
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
            MAX_RECONNECT_DELAY
        );
    }

    function showNotification(n) {
        var E = window.Ekko;

        if (!n || !E || typeof E.notify !== 'function') {
            return;
        }

        var type = n.type || 'CHAT_MESSAGE';
        var uniqueId = n.notificationId != null
            ? n.notificationId
            : n.messageId;

        if (uniqueId != null) {
            var key = type + ':' + String(uniqueId);

            if (processed.has(key)) {
                return;
            }

            processed.add(key);

            if (processed.size > 500) {
                processed.delete(processed.values().next().value);
            }
        }

        var conversationId = Number(n.conversationId);
        var hasConversation =
            Number.isFinite(conversationId) && conversationId > 0;

        if (type === 'CHAT_MESSAGE'
                && hasConversation
                && conversationId === currentConversationId()) {
            return;
        }

        var sender = n.senderName || 'Ekko';

        var content = n.content || (
            type === 'CONTACT_REQUEST'
                ? 'Te envió una solicitud de contacto.'
                : 'Tienes una notificación nueva.'
        );

        if (content.length > 180) {
            content = content.substring(0, 177) + '...';
        }

        var url = null;

        if (type === 'CHAT_MESSAGE' && hasConversation) {
            url = E.appUrl('/mensajes/' + conversationId);
        } else if (type === 'CONTACT_REQUEST') {
            url = E.appUrl('/contactos#tab-solicitudes');
        }

        E.notify({
            title: sender,
            text: content,
            url: url,
            chatId: type === 'CHAT_MESSAGE' && hasConversation
                ? conversationId
                : null,
            tag: type + (hasConversation ? ':' + conversationId : ''),
            sound: 'notify',
            desktop: true
        });
    }

    function dispatchContactUpdate(data) {
        if (!data || data.type !== 'CONTACTS_UPDATED') {
            return;
        }

        window.dispatchEvent(
            new CustomEvent('ekko:contacts-updated', {
                detail: data
            })
        );
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

        var lines = frame.substring(0, separator).split('\n');
        var body = frame.substring(separator + 2);
        var command = lines.shift();
        var headers = {};

        lines.forEach(function (line) {
            var i = line.indexOf(':');

            if (i > 0) {
                headers[line.substring(0, i)] =
                    line.substring(i + 1);
            }
        });

        lastServerActivity = Date.now();

        if (command === 'CONNECTED') {
            connected = true;
            reconnectDelay = 1000;

            startHeartbeat(headers['heart-beat']);

            sendFrame('SUBSCRIBE', {
                id: NOTIFICATIONS_ID,
                destination: '/user/queue/notifications',
                ack: 'auto'
            });

            sendFrame('SUBSCRIBE', {
                id: CONTACTS_ID,
                destination: '/user/queue/contacts',
                ack: 'auto'
            });

            return;
        }

        if (command === 'MESSAGE') {
            var subscription = headers.subscription;

            try {
                var data = JSON.parse(body);

                if (subscription === CONTACTS_ID) {
                    dispatchContactUpdate(data);
                    return;
                }

                if (subscription === NOTIFICATIONS_ID) {
                    showNotification(data);
                }
            } catch (error) {
                log('No se pudo interpretar un mensaje STOMP.', error);
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

        if (socket && (
                socket.readyState === WebSocket.OPEN
                || socket.readyState === WebSocket.CONNECTING
        )) {
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

    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            manuallyClosed = false;
            reconnectDelay = 1000;
            connect();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', connect, {
            once: true
        });
    } else {
        connect();
    }
})();