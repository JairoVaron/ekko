/*
 * EKKO · contactos.js
 * Actualización en tiempo real de contactos, solicitudes y bloqueados.
 * Las acciones peligrosas (bloquear / eliminar) viven en un menú ⋮ y piden
 * confirmación con un diálogo propio de Ekko (sin alertas del navegador).
 *
 * Avatares:
 * - Compatible con .ek-avatar-ring, .ek-initial y .ek-avatar-photo.
 * - Conserva las URL de las fotografías al reconstruir las tarjetas.
 * - Muestra la inicial cuando no hay fotografía o cuando falla su carga.
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

    /*
     * Caché temporal de fotografías.
     *
     * Es importante porque updateSection() reconstruye las tarjetas
     * mediante replaceChildren(). Si una actualización WebSocket no
     * incluye avatarUrl, podemos conservar la fotografía que ya conocíamos.
     *
     * La caché vive únicamente mientras la página está abierta.
     */
    var avatarUrlCache = Object.create(null);

    function rememberAvatar(userId, avatarUrl) {
        if (
            userId === undefined
            || userId === null
            || avatarUrl === undefined
            || avatarUrl === null
        ) {
            return;
        }

        var id = String(userId);
        var url = String(avatarUrl).trim();

        if (!id || !url) {
            return;
        }

        avatarUrlCache[id] = url;
    }

    function rememberUserAvatar(user) {
        if (!user || typeof user !== 'object') {
            return;
        }

        rememberAvatar(user.id, user.avatarUrl);
    }

    /*
     * Recupera las fotografías que ya están presentes en el HTML.
     * Se ejecuta antes de reconstruir las listas.
     */
    function rememberExistingAvatars() {
        var avatars = root.querySelectorAll(
            '.ek-avatar-ring[data-user-id]'
        );

        avatars.forEach(function (wrapper) {
            var userId = wrapper.dataset.userId;

            if (!userId) {
                return;
            }

            var img = wrapper.querySelector(
                '.ek-avatar-photo'
            );

            if (!img) {
                return;
            }

            var url = img.getAttribute('src');

            if (url) {
                rememberAvatar(userId, url);
            }
        });
    }

    function getAvatarUrl(user) {
        if (!user) {
            return '';
        }

        var id = user.id;

        /*
         * Si el servidor envía una URL nueva, actualizamos la caché.
         */
        if (
            user.avatarUrl !== undefined
            && user.avatarUrl !== null
            && String(user.avatarUrl).trim() !== ''
        ) {
            rememberAvatar(id, user.avatarUrl);
            return String(user.avatarUrl).trim();
        }

        /*
         * Si el evento no incluye avatarUrl, recuperamos la anterior.
         */
        if (id !== undefined && id !== null) {
            return avatarUrlCache[String(id)] || '';
        }

        return '';
    }

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

    /* ---------- Diálogo propio de Ekko ---------- */

    /**
     * Muestra un diálogo y devuelve una promesa con true (aceptar) o false.
     * opts: { title, message, okText, cancelText, danger }
     * Si cancelText es null, solo muestra el botón de aceptar (aviso).
     */
    function ekDialog(opts) {
        return new Promise(function (resolve) {
            var previous = document.activeElement;

            var overlay = element('div', 'ek-dialog-overlay');
            var box = element('div', 'ek-dialog');

            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-labelledby', 'ekDialogTitle');

            var title = element('h2', '', opts.title || '¿Estás seguro?');
            title.id = 'ekDialogTitle';

            var text = element('p', 'ek-dialog-text', opts.message || '');
            var actions = element('div', 'ek-dialog-actions');

            function close(result) {
                document.removeEventListener('keydown', onKey, true);
                overlay.remove();

                if (previous && previous.focus && document.contains(previous)) {
                    previous.focus();
                }

                resolve(result);
            }

            function onKey(event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    close(false);
                    return;
                }

                if (event.key !== 'Tab') {
                    return;
                }

                var buttons = box.querySelectorAll('button');
                var first = buttons[0];
                var last = buttons[buttons.length - 1];

                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }

            var ok = element(
                'button',
                'ek-dialog-btn' + (opts.danger ? ' is-danger' : ''),
                opts.okText || 'Aceptar'
            );

            ok.type = 'button';

            ok.addEventListener('click', function () {
                close(true);
            });

            actions.appendChild(ok);

            var cancel = null;

            if (opts.cancelText !== null) {
                cancel = element(
                    'button',
                    'ek-dialog-btn',
                    opts.cancelText || 'Cancelar'
                );

                cancel.type = 'button';

                cancel.addEventListener('click', function () {
                    close(false);
                });

                actions.appendChild(cancel);
            }

            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) {
                    close(false);
                }
            });

            box.appendChild(title);
            box.appendChild(text);
            box.appendChild(actions);

            overlay.appendChild(box);
            document.body.appendChild(overlay);

            document.addEventListener('keydown', onKey, true);

            // El foco inicial va a "Cancelar" para evitar confirmaciones accidentales.
            (cancel || ok).focus();
        });
    }

    /* ---------- Construcción de avatares ---------- */

    function avatar(user, alt) {
        user = user || {};

        var username = String(user.username || 'usuario').trim();

        var initial = username
            ? username.charAt(0).toLocaleUpperCase('es')
            : '?';

        var wrapper = element('div', 'ek-avatar-ring');

        if (user.id !== undefined && user.id !== null) {
            wrapper.dataset.userId = String(user.id);
        }

        /*
         * La inicial siempre existe.
         * Si la foto no carga, permanece visible como alternativa.
         */
        var initialElement = element(
            'span',
            'ek-initial',
            initial
        );

        wrapper.appendChild(initialElement);

        /*
         * Recuperamos la URL actual o la conservada en caché.
         */
        var avatarUrl = getAvatarUrl(user);

        if (!avatarUrl) {
            return wrapper;
        }

        var img = element('img', 'ek-avatar-photo');

        img.alt = alt || 'Foto de perfil';
        img.width = 48;
        img.height = 48;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';

        /*
         * Si falla la fotografía, ocultamos la imagen.
         * La inicial queda visible debajo.
         */
        img.addEventListener('error', function () {
            img.hidden = true;
            img.removeAttribute('src');
        });

        img.addEventListener('load', function () {
            img.hidden = false;
        });

        wrapper.appendChild(img);

        /*
         * Asignamos src después de registrar los eventos.
         */
        img.src = avatarUrl;

        return wrapper;
    }

    /* ---------- Construcción de formularios ---------- */

    /**
     * confirm (opcional): { title, message, ok } -> pide confirmación antes de enviar.
     */
    function createForm(action, buttonClass, iconClass, label, confirm) {
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

        if (confirm) {
            form.dataset.ekConfirm = confirm.message;
            form.dataset.ekTitle = confirm.title;
            form.dataset.ekOk = confirm.ok;
        }

        if (iconClass) {
            button.appendChild(element('i', iconClass));
        }

        button.appendChild(document.createTextNode(label));

        form.appendChild(button);

        return form;
    }

    /** Menú ⋮ con las acciones peligrosas de un contacto. */
    function contactMenu(user) {
        var name = user.displayName || user.username || 'este usuario';

        var wrap = element('div', 'dropdown');

        var toggle = element('button', 'ek-icon-btn ek-person-more');

        toggle.type = 'button';
        toggle.setAttribute('data-bs-toggle', 'dropdown');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Más opciones de ' + name);

        toggle.appendChild(
            element('i', 'bi bi-three-dots-vertical')
        );

        var menu = element('ul', 'dropdown-menu dropdown-menu-end');

        var blockItem = element('li');

        blockItem.appendChild(createForm(
            endpoints.block + user.id,
            'dropdown-item',
            'bi bi-slash-circle',
            'Bloquear',
            {
                title: '¿Bloquear a ' + name + '?',
                message: 'No podrá enviarte mensajes ni solicitudes mientras esté bloqueado.',
                ok: 'Bloquear'
            }
        ));

        var dividerItem = element('li');

        dividerItem.appendChild(
            element('hr', 'dropdown-divider')
        );

        var removeItem = element('li');

        removeItem.appendChild(createForm(
            endpoints.remove + user.id,
            'dropdown-item is-danger',
            'bi bi-person-dash-fill',
            'Eliminar contacto',
            {
                title: '¿Eliminar a ' + name + '?',
                message: 'Dejará de aparecer en tu lista de contactos.',
                ok: 'Eliminar'
            }
        ));

        menu.appendChild(blockItem);
        menu.appendChild(dividerItem);
        menu.appendChild(removeItem);

        wrap.appendChild(toggle);
        wrap.appendChild(menu);

        return wrap;
    }

    function personInfo(user, includeBio) {
        var info = element('div', 'ek-person-info');

        var name = user.displayName || user.username || 'Usuario';

        info.appendChild(
            element('strong', '', name)
        );

        var username = element('small');

        username.appendChild(
            document.createTextNode('(@')
        );

        username.appendChild(
            element('span', '', user.username || 'usuario')
        );

        username.appendChild(
            document.createTextNode(')')
        );

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
            user,
            'Foto de perfil de ' + (user.username || 'usuario')
        ));

        card.appendChild(personInfo(
            user,
            type === 'contact'
        ));

        var actions = element('div', 'ek-person-actions');

        if (type === 'contact') {
            var mainForm = createForm(
                endpoints.messages + user.id,
                'btn btn-ekko btn-sm',
                'bi bi-chat-dots-fill',
                'Enviar mensaje'
            );

            mainForm.classList.add('ek-person-main');

            actions.appendChild(mainForm);
            actions.appendChild(contactMenu(user));
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

    /* ---------- Contadores y actualización de listas ---------- */

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

        counter.classList.toggle(
            'is-alert',
            !!alert && count > 0
        );
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

                empty.appendChild(
                    element('i', emptyIcon)
                );

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
            list.appendChild(
                personCard(item, type)
            );
        });
    }

    function updateAll(data) {
        if (!data || data.type !== 'CONTACTS_UPDATED') {
            return;
        }

        /*
         * Primero recuperamos las fotos del HTML que todavía existe.
         * Esto debe suceder antes de replaceChildren().
         */
        rememberExistingAvatars();

        var contacts = Array.isArray(data.contacts)
            ? data.contacts
            : [];

        var requests = Array.isArray(data.requests)
            ? data.requests
            : [];

        var blocked = Array.isArray(data.blockedUsers)
            ? data.blockedUsers
            : [];

        /*
         * Guardamos también las fotografías que lleguen en el evento.
         */
        contacts.forEach(rememberUserAvatar);
        requests.forEach(rememberUserAvatar);
        blocked.forEach(rememberUserAvatar);

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

        updateCounter(
            'tab-contactos',
            contacts.length,
            false
        );

        updateCounter(
            'tab-solicitudes',
            requests.length,
            true
        );

        updateCounter(
            'tab-bloqueados',
            blocked.length,
            false
        );
    }

    /* ---------- Envío de formularios ---------- */

    /*
     * Los formularios de contactos se envían mediante fetch.
     * El servicio publicará el nuevo estado por WebSocket.
     * El formulario de abrir conversación queda intacto.
     */
    async function sendForm(form) {
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

            if (
                window.Ekko
                && typeof window.Ekko.notify === 'function'
            ) {
                window.Ekko.notify({
                    title: 'Contactos',
                    text: 'La operación se ha procesado correctamente.',
                    sound: 'success',
                    desktop: false
                });
            }

        } catch (error) {
            console.error('[Ekko contactos]', error);

            if (
                window.Ekko
                && typeof window.Ekko.notify === 'function'
            ) {
                window.Ekko.notify({
                    title: 'No se pudo completar',
                    text: error.message || 'Inténtalo nuevamente.',
                    sound: 'error',
                    desktop: false
                });
            } else {
                ekDialog({
                    title: 'No se pudo completar',
                    message: error.message || 'Inténtalo nuevamente.',
                    okText: 'Entendido',
                    cancelText: null
                });
            }

        } finally {
            form.dataset.submitting = 'false';

            if (button) {
                button.disabled = false;
            }
        }
    }

    /* ---------- Eventos ---------- */

    document.addEventListener('submit', function (event) {
        var form = event.target;

        if (!(form instanceof HTMLFormElement)) {
            return;
        }

        if (
            (form.method || '').toLowerCase() !== 'post'
            || !form.action.includes('/contactos/')
        ) {
            return;
        }

        event.preventDefault();

        if (form.dataset.submitting === 'true') {
            return;
        }

        if (form.dataset.ekConfirm) {
            ekDialog({
                title: form.dataset.ekTitle || '¿Estás seguro?',
                message: form.dataset.ekConfirm,
                okText: form.dataset.ekOk || 'Aceptar',
                danger: true
            }).then(function (accepted) {
                if (accepted) {
                    sendForm(form);
                }
            });

            return;
        }

        sendForm(form);
    });

    /*
     * Capturamos los avatares del HTML original al iniciar el archivo.
     */
    rememberExistingAvatars();

    /*
     * Recibimos las actualizaciones publicadas por el sistema de contactos.
     */
    window.addEventListener(
        'ekko:contacts-updated',
        function (event) {
            updateAll(event.detail);
        }
    );

})();