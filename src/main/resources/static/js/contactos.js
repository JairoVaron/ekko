/*
 * EKKO · contactos.js
 * Actualización en tiempo real de contactos, solicitudes y bloqueados.
 */
(function () {
    'use strict';

    if (window.__ekkoContactsInitialized) {
        return;
    }

    window.__ekkoContactsInitialized = true;

    var root = document.querySelector('.ek-container');

    if (!root) {
        return;
    }

    var csrfInput = document.querySelector(
        'input[name="_csrf"]'
    );

    var csrfName = csrfInput
        ? csrfInput.name
        : '_csrf';

    var csrfToken = csrfInput
        ? csrfInput.value
        : '';

    var endpoints = {
        contacts: '/contactos',
        messages: '/mensajes/abrir/',
        accept: '/contactos/aceptar/',
        reject: '/contactos/rechazar/',
        remove: '/contactos/eliminar/',
        block: '/contactos/bloquear/',
        unblock: '/contactos/desbloquear/'
    };

    function element(tag, className, text) {
        var node = document.createElement(tag);

        if (className) {
            node.className = className;
        }

        if (text !== undefined && text !== null) {
            node.textContent = String(text);
        }

        return node;
    }

    function avatar(url, alt) {
        var img = element('img', 'ek-initial');

        img.src = url || '/images/avatar-default.svg';
        img.alt = alt || 'Foto de perfil';
        img.width = 48;
        img.height = 48;
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';

        img.addEventListener('error', function () {
            if (img.src.indexOf('/images/avatar-default.svg') === -1) {
                img.src = '/images/avatar-default.svg';
            }
        }, { once: true });

        return img;
    }

    function createForm(action, buttonClass, iconClass, label, confirmMessage) {
        var form = element('form');

        form.action = action;
        form.method = 'post';

        var csrf = element('input');
        csrf.type = 'hidden';
        csrf.name = csrfName;
        csrf.value = csrfToken;

        form.appendChild(csrf);

        var button = element('button', buttonClass);
        button.type = 'submit';

        if (confirmMessage) {
            form.dataset.ekkoConfirm = confirmMessage;
        }

        if (iconClass) {
            button.appendChild(element('i', iconClass));
        }

        button.appendChild(document.createTextNode(label));

        form.appendChild(button);

        return form;
    }

    function personInfo(user, includeBio) {
        var info = element('div', 'ek-person-info');

        var name = user.displayName || user.username || 'Usuario';

        info.appendChild(element('strong', '', name));

        var username = element('small');
        username.appendChild(document.createTextNode('(@'));

        username.appendChild(
            element('span', '', user.username || 'usuario')
        );

        username.appendChild(document.createTextNode(')'));

        info.appendChild(username);

        if (includeBio) {
            info.appendChild(element(
                'p',
                '',
                user.bio || 'Este usuario todavía no tiene biografía.'
            ));
        }

        return info;
    }

    function personCard(user, type) {
        var card = element('article', 'ek-person');

        card.appendChild(avatar(
            user.avatarUrl,
            'Foto de perfil de ' + (user.username || 'usuario')
        ));

        card.appendChild(personInfo(
            user,
            type === 'contact'
        ));

        var actions = element('div', 'ek-person-actions');

        if (type === 'contact') {
            actions.appendChild(createForm(
                endpoints.messages + user.id,
                'btn btn-ekko btn-sm',
                'bi bi-chat-dots-fill',
                'Enviar mensaje'
            ));

            actions.appendChild(createForm(
                endpoints.block + user.id,
                'btn btn-ekko-soft btn-sm',
                'bi bi-slash-circle',
                'Bloquear',
                'No podrán enviarte mensajes ni solicitudes mientras esté bloqueado.'
            ));

            actions.appendChild(createForm(
                endpoints.remove + user.id,
                'btn btn-ekko-danger btn-sm',
                'bi bi-person-dash-fill',
                'Eliminar contacto',
                'Dejará de aparecer en tu lista de contactos.'
            ));
        }

        if (type === 'request') {
            actions.appendChild(createForm(
                endpoints.accept + user.id,
                'btn btn-ekko btn-sm',
                'bi bi-check-lg',
                'Aceptar'
            ));

            actions.appendChild(createForm(
                endpoints.reject + user.id,
                'btn btn-ekko-soft btn-sm',
                'bi bi-x-lg',
                'Rechazar'
            ));
        }

        if (type === 'blocked') {
            actions.appendChild(createForm(
                endpoints.unblock + user.id,
                'btn btn-ekko-soft btn-sm',
                'bi bi-unlock-fill',
                'Desbloquear'
            ));
        }

        card.appendChild(actions);

        return card;
    }

    function updateCounter(tabId, count, alert) {
        var tabButton = document.querySelector(
            '[data-bs-target="#' + tabId + '"]'
        );

        if (!tabButton) {
            return;
        }

        var counter = tabButton.querySelector('.ek-count');

        if (!counter) {
            return;
        }

        counter.textContent = String(count);
        counter.classList.toggle('is-alert', !!alert && count > 0);
    }

    function updateSection(tabId, items, type, emptyMessage, emptyIcon) {
        var section = document.getElementById(tabId);

        if (!section) {
            return;
        }

        var list = section.querySelector('.ek-people');
        var empty = section.querySelector('.ek-empty-state');

        if (!list) {
            return;
        }

        list.replaceChildren();

        if (!Array.isArray(items) || items.length === 0) {
            if (empty) {
                empty.hidden = false;
                empty.replaceChildren();

                empty.appendChild(element('i', emptyIcon));
                empty.appendChild(
                    document.createTextNode(emptyMessage)
                );
            }

            return;
        }

        if (empty) {
            empty.hidden = true;
        }

        items.forEach(function (item) {
            list.appendChild(personCard(item, type));
        });
    }

    function updateAll(data) {
        if (!data || data.type !== 'CONTACTS_UPDATED') {
            return;
        }

        var contacts = Array.isArray(data.contacts)
            ? data.contacts
            : [];

        var requests = Array.isArray(data.requests)
            ? data.requests
            : [];

        var blocked = Array.isArray(data.blockedUsers)
            ? data.blockedUsers
            : [];

        updateSection(
            'tab-contactos',
            contacts,
            'contact',
            'Todavía no tienes contactos. Busca a alguien para enviarle una solicitud.',
            'bi bi-people'
        );

        updateSection(
            'tab-solicitudes',
            requests,
            'request',
            'No tienes solicitudes pendientes.',
            'bi bi-inbox'
        );

        updateSection(
            'tab-bloqueados',
            blocked,
            'blocked',
            'No tienes usuarios bloqueados.',
            'bi bi-shield-check'
        );

        updateCounter('tab-contactos', contacts.length, false);
        updateCounter('tab-solicitudes', requests.length, true);
        updateCounter('tab-bloqueados', blocked.length, false);
    }

    /*
     * Los formularios de contactos se envían mediante fetch.
     * El servicio publicará el nuevo estado por WebSocket.
     * El formulario de abrir conversación queda intacto.
     */
    document.addEventListener('submit', async function (event) {
        var form = event.target;

        if (!(form instanceof HTMLFormElement)) {
            return;
        }

        if (!form.action.includes('/contactos/')) {
            return;
        }

        event.preventDefault();

        if (form.dataset.submitting === 'true') {
            return;
        }

        if (form.dataset.ekkoConfirm) {
            var confirmed = window.confirm(
                form.dataset.ekkoConfirm
            );

            if (!confirmed) {
                return;
            }
        }

        var button = form.querySelector('button[type="submit"]');

        form.dataset.submitting = 'true';

        if (button) {
            button.disabled = true;
        }

        try {
            var response = await fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
                credentials: 'same-origin',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                },
                redirect: 'follow'
            });

            if (!response.ok) {
                throw new Error(
                    'No se pudo completar la operación.'
                );
            }

            if (window.Ekko && typeof window.Ekko.notify === 'function') {
                window.Ekko.notify({
                    title: 'Contactos',
                    text: 'La operación se ha procesado correctamente.',
                    sound: 'success',
                    desktop: false
                });
            }

        } catch (error) {
            console.error('[Ekko contactos]', error);

            if (window.Ekko && typeof window.Ekko.notify === 'function') {
                window.Ekko.notify({
                    title: 'No se pudo completar',
                    text: error.message || 'Inténtalo nuevamente.',
                    sound: 'error',
                    desktop: false
                });
            } else {
                window.alert(error.message || 'No se pudo completar la operación.');
            }

        } finally {
            form.dataset.submitting = 'false';

            if (button) {
                button.disabled = false;
            }
        }
    });

    window.addEventListener(
        'ekko:contacts-updated',
        function (event) {
            updateAll(event.detail);
        }
    );

})();