/* ========================================================= archivo ekko.js
   EKKO · Núcleo del frontend
   Tema, sonidos, avisos, notificaciones, navegación y detalles
   ========================================================= */
(function () {
    'use strict';

    var $ = function (s, c) { return (c || document).querySelector(s); };
    var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
    var store = {
        get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
        set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } }
    };

    /* ---------------------------------------------------------
       SONIDOS (sintetizados con Web Audio: no requieren archivos)
       --------------------------------------------------------- */
    var Sound = (function () {
        var ctx = null, pending = null;
        var enabled = store.get('ekko-sound', 'on') === 'on';
        var volume = parseFloat(store.get('ekko-volume', '0.6'));

        function getCtx() {
            if (!ctx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) { return null; }
                ctx = new AC();
            }
            return ctx;
        }

        function tone(c, freq, start, dur, type, gain, glideTo) {
            var o = c.createOscillator(), g = c.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, start);
            if (glideTo) { o.frequency.exponentialRampToValueAtTime(glideTo, start + dur); }
            var peak = Math.max(0.0001, (gain || 0.2) * volume);
            g.gain.setValueAtTime(0.0001, start);
            g.gain.exponentialRampToValueAtTime(peak, start + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
            o.connect(g); g.connect(c.destination);
            o.start(start); o.stop(start + dur + 0.05);
        }

        function splash(c, t) {
            var len = c.sampleRate * 0.5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
            for (var i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / len); }
            var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
            src.buffer = buf; f.type = 'bandpass'; f.Q.value = 0.9;
            f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.45);
            g.gain.setValueAtTime(0.25 * volume, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
            src.connect(f); f.connect(g); g.connect(c.destination); src.start(t);
        }

        var library = {
            click:    function (c, t) { tone(c, 900, t, 0.05, 'sine', 0.08); },
            pop:      function (c, t) { tone(c, 380, t, 0.1, 'sine', 0.22, 820); },
            sent:     function (c, t) { tone(c, 520, t, 0.09, 'sine', 0.2, 900); tone(c, 1040, t + 0.07, 0.08, 'sine', 0.08); },
            received: function (c, t) { tone(c, 880, t, 0.14, 'sine', 0.22); tone(c, 659, t + 0.12, 0.2, 'sine', 0.2); },
            notify:   function (c, t) { tone(c, 659, t, 0.16, 'sine', 0.22); tone(c, 988, t + 0.13, 0.28, 'sine', 0.22); tone(c, 1318, t + 0.13, 0.28, 'sine', 0.06); },
            success:  function (c, t) { [523, 659, 784, 1047].forEach(function (f, i) { tone(c, f, t + i * 0.09, 0.22, 'triangle', 0.16); }); },
            error:    function (c, t) { tone(c, 240, t, 0.18, 'triangle', 0.22); tone(c, 180, t + 0.15, 0.28, 'triangle', 0.22); },
            splash:   function (c, t) { splash(c, t); tone(c, 330, t, 0.35, 'sine', 0.12, 700); },
            off:      function (c, t) { tone(c, 520, t, 0.12, 'sine', 0.15, 330); }
        };

        function play(name, force) {
            if (!enabled && !force) { return; }
            var c = getCtx();
            if (!c || !library[name]) { return; }
            if (c.state === 'suspended') {
                pending = name;
                c.resume().then(flush).catch(function () { /* espera al primer gesto */ });
                return;
            }
            library[name](c, c.currentTime + 0.01);
        }

        function flush() {
            if (pending && ctx && ctx.state === 'running') {
                var n = pending; pending = null;
                library[n](ctx, ctx.currentTime + 0.01);
            }
        }

        ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
            document.addEventListener(ev, function () {
                if (ctx && ctx.state === 'suspended') { ctx.resume().then(flush); }
            }, { passive: true });
        });

        return {
            play: play,
            isEnabled: function () { return enabled; },
            setEnabled: function (v) {
                enabled = !!v; store.set('ekko-sound', enabled ? 'on' : 'off');
                if (enabled) { play('pop', true); }
                document.dispatchEvent(new CustomEvent('ekko:sound', { detail: enabled }));
            },
            toggle: function () { this.setEnabled(!enabled); },
            setVolume: function (v) { volume = Math.min(1, Math.max(0, v)); store.set('ekko-volume', String(volume)); },
            getVolume: function () { return volume; }
        };
    })();

    /* ---------------------------------------------------------
       AVISOS (toasts)
       --------------------------------------------------------- */
    var ICONS = { success: 'bi-check-circle-fill', error: 'bi-exclamation-octagon-fill', info: 'bi-info-circle-fill', message: 'bi-chat-heart-fill' };

    function stack() {
        var s = $('.ek-toast-stack');
        if (!s) { s = document.createElement('div'); s.className = 'ek-toast-stack'; s.setAttribute('aria-live', 'polite'); document.body.appendChild(s); }
        return s;
    }

    function toast(opts) {
        opts = typeof opts === 'string' ? { text: opts } : (opts || {});
        var type = opts.type || 'info';
        var el = document.createElement('div');
        el.className = 'ek-toast ' + type;
        el.setAttribute('role', type === 'error' ? 'alert' : 'status');
        var i = document.createElement('i'); i.className = 'bi ' + (ICONS[type] || ICONS.info);
        var box = document.createElement('div');
        if (opts.title) { var t = document.createElement('strong'); t.textContent = opts.title; box.appendChild(t); }
        var sp = document.createElement('span'); sp.textContent = opts.text || ''; box.appendChild(sp);
        el.appendChild(i); el.appendChild(box);
        stack().appendChild(el);
        if (opts.sound !== false) { Sound.play(opts.sound || (type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'message' ? 'notify' : 'pop')); }
        var close = function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 220); };
        el.addEventListener('click', close);
        setTimeout(close, opts.duration || 4500);
        return el;
    }

    /* ---------------------------------------------------------
       NOTIFICACIONES (campana, contador, título, navegador)
       --------------------------------------------------------- */
    var baseTitle = document.title, unread = 0;

    function setUnread(n) {
        unread = Math.max(0, n | 0);

        try {
            sessionStorage.setItem(EK_UNREAD_KEY, String(unread));
        } catch (error) {
            // Se mantiene el contador en memoria si el almacenamiento falla.
        }

        $$('[data-ekko-unread]').forEach(function (badge) {
            badge.textContent = unread > 99 ? '99+' : String(unread);
            badge.hidden = unread === 0;
        });

        document.title = unread
            ? '(' + unread + ') ' + baseTitle
            : baseTitle;
    }

    function addToBell(title, text) {
        var list = $('[data-ekko-bell-list]');
        if (!list) { return; }
        var empty = $('[data-ekko-bell-empty]', list); if (empty) { empty.remove(); }
        var item = document.createElement('div'); item.className = 'ek-notif-item';
        item.innerHTML = '<i class="bi bi-chat-heart-fill"></i><div><strong></strong><small></small></div>';
        $('strong', item).textContent = title || 'Ekko';
        $('small', item).textContent = text || '';
        list.insertBefore(item, list.firstChild);
    }

    /**
     * Estado de las notificaciones durante la sesión del navegador.
     */
    var EK_NOTIFICATIONS_KEY = 'ekko.notifications';
    var EK_UNREAD_KEY = 'ekko.notifications.unread';
    var EK_MAX_NOTIFICATIONS = 30;

    function readStoredNotifications() {
        try {
            var value = sessionStorage.getItem(EK_NOTIFICATIONS_KEY);
            var notifications = value ? JSON.parse(value) : [];
            return Array.isArray(notifications) ? notifications : [];
        } catch (error) {
            return [];
        }
    }

    function saveStoredNotifications(notifications) {
        try {
            sessionStorage.setItem(
                EK_NOTIFICATIONS_KEY,
                JSON.stringify(notifications.slice(0, EK_MAX_NOTIFICATIONS))
            );
        } catch (error) {
            // La interfaz seguirá funcionando aunque el almacenamiento no esté disponible.
        }
    }

    function restoreNotifications() {
        var notifications = readStoredNotifications();

        var list = $('[data-ekko-bell-list]');
        if (list) {
            list.replaceChildren();

            if (notifications.length === 0) {
                var empty = document.createElement('div');
                empty.className = 'ek-empty';
                empty.setAttribute('data-ekko-bell-empty', '');
                empty.innerHTML =
                    '<i class="bi bi-water"></i> Todo en calma. Aquí verás tus avisos nuevos.';
                list.appendChild(empty);
            } else {
                notifications.slice().reverse().forEach(function (item) {
                    addToBell(item.title, item.text);
                });
            }
        }

        var storedUnread = 0;

        try {
            storedUnread = Number(sessionStorage.getItem(EK_UNREAD_KEY)) || 0;
        } catch (error) {
            storedUnread = 0;
        }

        setUnread(storedUnread);
    }

    /** Uso desde chat.js u otros: Ekko.notify({ title, text, sound, desktop }) */
    function notify(o) {
        o = o || {};

        var title = o.title || 'Ekko';
        var text = o.text || '';

        var notifications = readStoredNotifications();

        notifications.unshift({
            title: title,
            text: text,
            createdAt: new Date().toISOString()
        });

        saveStoredNotifications(notifications);
        addToBell(title, text);

        setUnread(unread + 1);

        if (document.hidden || o.toast !== false) {
            toast({
                type: 'message',
                title: title,
                text: text,
                sound: o.sound || 'notify'
            });
        }

        if (
            o.desktop !== false &&
            document.hidden &&
            'Notification' in window &&
            Notification.permission === 'granted'
        ) {
            try {
                new Notification(title, {
                    body: text,
                    icon: '/images/ekko-logo.svg'
                });
            } catch (error) {
                // Las notificaciones del sistema pueden estar bloqueadas.
            }
        }
    }


    function askDesktopPermission() {
        if ('Notification' in window && Notification.permission === 'default') { return Notification.requestPermission(); }
        return Promise.resolve(window.Notification ? Notification.permission : 'denied');
    }

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            document.title = unread > 0
                ? '(' + unread + ') ' + baseTitle
                : baseTitle;
        }
    });

    /* ---------------------------------------------------------
       TEMA
       --------------------------------------------------------- */
    function currentTheme() { return document.documentElement.getAttribute('data-bs-theme'); }
    function syncThemeButtons() {
        $$('[data-ekko-theme-toggle] .bi').forEach(function (i) { i.className = 'bi ' + (currentTheme() === 'dark' ? 'bi-sun-fill' : 'bi-moon-stars-fill'); });
    }
    function syncSoundButtons() {
        $$('[data-ekko-sound-toggle] .bi').forEach(function (i) { i.className = 'bi ' + (Sound.isEnabled() ? 'bi-volume-up-fill' : 'bi-volume-mute-fill'); });
    }

    /* ---------------------------------------------------------
       INICIALIZACIÓN
       --------------------------------------------------------- */
    function init() {
        baseTitle = document.title;

        // Tema y sonido
        syncThemeButtons(); syncSoundButtons();
        $$('[data-ekko-theme-toggle]').forEach(function (b) {
            b.addEventListener('click', function () {
                var next = currentTheme() === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-bs-theme', next);
                store.set('ekko-theme', next); syncThemeButtons(); Sound.play('click');
            });
        });
        $$('[data-ekko-sound-toggle]').forEach(function (b) { b.addEventListener('click', function () { if (Sound.isEnabled()) { Sound.play('off', true); } Sound.toggle(); }); });
        document.addEventListener('ekko:sound', syncSoundButtons);

        // Enlace activo en el menú lateral
        var path = location.pathname.replace(/\/+$/, '') || '/';
        $$('.ek-side-link').forEach(function (a) {
            var p = new URL(a.href, location.origin).pathname.replace(/\/+$/, '') || '/';
            var also = (a.getAttribute('data-active-also') || '').split(',').filter(Boolean);
            var hit = path === p || path.indexOf(p + '/') === 0 || also.some(function (x) { return path === x || path.indexOf(x + '/') === 0; });
            if (hit) { a.classList.add('active'); a.setAttribute('aria-current', 'page'); }
        });

        // Sonidos declarativos: data-ekko-sound="click|pop|success..." al hacer clic
        document.addEventListener('click', function (e) {
            var el = e.target.closest('[data-ekko-sound]');
            if (el) { Sound.play(el.getAttribute('data-ekko-sound')); return; }
            if (e.target.closest('a.ek-side-link, .dropdown-item, .ek-icon-btn')) { Sound.play('click'); }
        });
        // Sonidos al cargar: data-ekko-sound-on-load="success|error"
        var onLoad = $('[data-ekko-sound-on-load]');
        if (onLoad) { Sound.play(onLoad.getAttribute('data-ekko-sound-on-load')); }

        // Imagen de respaldo para avatares rotos
        var fallback = function (img) {
            var f = img.getAttribute('data-fallback');
            if (f && img.getAttribute('src') !== f) { img.setAttribute('src', f); }
        };
        document.addEventListener('error', function (e) { if (e.target && e.target.tagName === 'IMG') { fallback(e.target); } }, true);
        $$('img[data-fallback]').forEach(function (img) { if (img.complete && img.naturalWidth === 0) { fallback(img); } });

        // Burbujas decorativas
        $$('[data-ekko-bubbles]').forEach(function (box) {
            var n = Math.min(parseInt(box.getAttribute('data-ekko-bubbles'), 10) || 8, window.innerWidth < 768 ? 5 : 8);
            for (var i = 0; i < n; i++) {
                var b = document.createElement('span'), s = 8 + Math.random() * 34;
                b.className = 'ek-bubble';
                b.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + Math.random() * 100 + '%;animation-duration:' + (9 + Math.random() * 12) + 's;animation-delay:-' + Math.random() * 16 + 's';
                box.appendChild(b);
            }
        });

        // Barras de progreso: data-progress="70"
        requestAnimationFrame(function () {
            $$('[data-progress]').forEach(function (b) { b.style.width = (parseInt(b.getAttribute('data-progress'), 10) || 0) + '%'; });
        });

        // Efecto onda en botones
        document.addEventListener('pointerdown', function (e) {
            var btn = e.target.closest('.btn-ekko, .btn-ekko-soft');
            if (!btn) { return; }
            var r = btn.getBoundingClientRect(), d = Math.max(r.width, r.height) / 2;
            var s = document.createElement('span'); s.className = 'ek-ripple';
            s.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
            btn.appendChild(s); setTimeout(function () { s.remove(); }, 450);
        });

        // Formularios con estado de carga: <form data-ekko-loading>
        $$('form[data-ekko-loading]').forEach(function (form) {
            form.addEventListener('submit', function () {
                if (form.dataset.invalid === 'true') { return; }
                var btn = $('[type="submit"]', form);
                if (btn && !btn.classList.contains('is-loading')) {
                    btn.classList.add('is-loading');
                    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>' + (btn.getAttribute('data-loading-text') || 'Un momento…');
                }
            });
        });

        // Logo clicable con chapuzón
        $$('[data-ekko-splash]').forEach(function (el) { el.addEventListener('click', function () { Sound.play('splash'); }); });

        // Confirmación en formularios: <form data-ekko-confirm="¿Seguro?" data-confirm-title data-confirm-ok data-confirm-danger>
        document.addEventListener('submit', function (e) {
            var f = e.target;
            if (!f.matches || !f.matches('form[data-ekko-confirm]') || f.dataset.confirmed === '1') { return; }
            e.preventDefault();
            confirmDialog({
                title: f.getAttribute('data-confirm-title') || 'Confirmar',
                text: f.getAttribute('data-ekko-confirm'),
                okText: f.getAttribute('data-confirm-ok') || 'Confirmar',
                danger: f.hasAttribute('data-confirm-danger')
            }).then(function (ok) { if (ok) { f.dataset.confirmed = '1'; f.submit(); } });
        });

        // Color de las iniciales según el nombre
        $$('.ek-initial').forEach(function (el) {
            var n = el.getAttribute('data-name') || el.textContent, h = 0;
            for (var i = 0; i < n.length; i++) { h = (h * 31 + n.charCodeAt(i)) % 6; }
            el.classList.add('tone-' + h);
        });

        // Tooltips de Bootstrap
        if (window.bootstrap) { $$('[data-bs-toggle="tooltip"]').forEach(function (el) { new window.bootstrap.Tooltip(el); }); }

        // Pausa las animaciones con la pestaña oculta
        document.addEventListener('visibilitychange', function () { document.documentElement.classList.toggle('ek-paused', document.hidden); });

        // Estado de la conexión
        window.addEventListener('offline', function () { toast({ type: 'error', title: 'Sin conexión', text: 'Los mensajes se enviarán cuando vuelvas a conectarte.', sound: 'error' }); });
        window.addEventListener('online', function () { toast({ type: 'success', title: 'De vuelta en el agua', text: 'Conexión restablecida.' }); });
    }

    function confirmDialog(o) {
        return new Promise(function (resolve) {
            if (!window.bootstrap) { resolve(window.confirm(o.text)); return; }
            var wrap = document.createElement('div');
            wrap.className = 'modal fade'; wrap.tabIndex = -1; wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('role', 'dialog');
            wrap.innerHTML = '<div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-body p-4 text-center">' +
                '<div class="ek-confirm-icon"><i class="bi"></i></div><h5 class="ek-display"></h5><p class="text-muted-ek mb-4"></p>' +
                '<div class="d-flex gap-2 justify-content-center"><button type="button" class="btn btn-ekko-soft" data-no>Cancelar</button><button type="button" class="btn" data-yes></button></div></div></div></div>';
            $('h5', wrap).textContent = o.title || 'Confirmar';
            $('p', wrap).textContent = o.text || '';
            var yes = $('[data-yes]', wrap); yes.textContent = o.okText || 'Confirmar';
            yes.classList.add(o.danger ? 'btn-ekko-red' : 'btn-ekko');
            var icon = $('.ek-confirm-icon', wrap); if (o.danger) { icon.classList.add('is-danger'); }
            $('.bi', icon).classList.add(o.danger ? 'bi-exclamation-triangle-fill' : 'bi-question-circle-fill');
            document.body.appendChild(wrap);
            var modal = new window.bootstrap.Modal(wrap), done = false;
            yes.addEventListener('click', function () { done = true; modal.hide(); resolve(true); });
            $('[data-no]', wrap).addEventListener('click', function () { modal.hide(); });
            wrap.addEventListener('hidden.bs.modal', function () { if (!done) { resolve(false); } wrap.remove(); });
            Sound.play('pop'); modal.show();
        });
    }

    function themeMode() { var v = store.get('ekko-theme', null); return v === 'light' || v === 'dark' ? v : 'auto'; }
    function setTheme(mode) {
        var t = mode;
        if (mode === 'auto') {
            try { localStorage.removeItem('ekko-theme'); } catch (e) { /* noop */ }
            t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } else { store.set('ekko-theme', mode); }
        document.documentElement.setAttribute('data-bs-theme', t); syncThemeButtons();
    }

    window.Ekko = {
        confirm: confirmDialog,
        theme: { get: themeMode, set: setTheme },
        sound: Sound,
        toast: toast,
        notify: notify,
        setUnread: setUnread,
        askDesktopPermission: askDesktopPermission,
        store: store,
        $: $,
        $$: $$
    };

    function initializeEkkoNotifications() {
        restoreNotifications();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            initializeEkkoNotifications();
            init();
        }, { once: true });
    } else {
        initializeEkkoNotifications();
        init();
    }
})();
