/* EKKO · Pantallas de acceso (login y registro) */
(function () {
    'use strict';
    var E = window.Ekko || {};
    var $ = function (s, c) { return (c || document).querySelector(s); };
    var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

    // Mostrar u ocultar contraseña
    $$('[data-toggle-password]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var input = document.getElementById(btn.getAttribute('data-toggle-password'));
            if (!input) { return; }
            var show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.querySelector('.bi').className = 'bi ' + (show ? 'bi-eye-slash-fill' : 'bi-eye-fill');
            btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
            input.focus();
        });
    });

    // Aviso de bloqueo de mayúsculas
    $$('input[type="password"]').forEach(function (input) {
        var warn = $('[data-caps-warning]', input.closest('.ek-field'));
        if (!warn) { return; }
        var check = function (e) { if (e.getModifierState) { warn.hidden = !e.getModifierState('CapsLock'); } };
        input.addEventListener('keyup', check); input.addEventListener('keydown', check);
        input.addEventListener('blur', function () { warn.hidden = true; });
    });

    // Medidor de seguridad de la contraseña
    var meter = $('[data-password-strength]');
    var passInput = meter && document.getElementById(meter.getAttribute('data-password-strength'));
    if (meter && passInput) {
        var label = $('[data-strength-label]');
        var names = ['Escribe una contraseña', 'Muy débil', 'Mejorable', 'Buena', 'Excelente'];
        passInput.addEventListener('input', function () {
            var v = passInput.value, score = 0;
            if (v.length >= 8) { score++; }
            if (/[a-z]/.test(v) && /[A-Z]/.test(v)) { score++; }
            if (/\d/.test(v)) { score++; }
            if (/[^A-Za-z0-9]/.test(v) || v.length >= 14) { score++; }
            if (!v) { score = 0; }
            meter.setAttribute('data-level', score);
            if (label) { label.textContent = names[score]; }
        });
    }

    // Sugerir el nombre para mostrar a partir del usuario (solo si no lo tocaron)
    var user = $('#username'), display = $('#displayName');
    if (user && display && $('[data-password-strength]')) {
        var touched = display.value !== '';
        display.addEventListener('input', function () { touched = display.value !== ''; });
        user.addEventListener('input', function () { if (!touched) { display.value = user.value; } });
    }

    // Validación visual antes de enviar
    $$('form[data-ekko-loading]').forEach(function (form) {
        form.addEventListener('submit', function (e) {
            form.dataset.invalid = 'false';
            if (!form.checkValidity()) {
                e.preventDefault();
                form.dataset.invalid = 'true';
                var first = form.querySelector(':invalid');
                var card = form.closest('.ek-auth-card') || form;
                card.classList.remove('ek-shake'); void card.offsetWidth; card.classList.add('ek-shake');
                if (E.sound) { E.sound.play('error'); }
                if (first) { first.focus(); }
                if (E.toast && first) { E.toast({ type: 'error', text: first.validationMessage || 'Revisa este campo.', sound: false }); }
            }
        });
    });

    // Foco inicial en el primer campo con error del servidor
    var bad = $('.is-invalid');
    if (bad) { bad.focus(); }
})();
