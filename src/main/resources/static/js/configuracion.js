/* EKKO · Preferencias locales: sonido, volumen, tema y avisos del navegador */
(() => {
    "use strict";
    const E = window.Ekko;
    if (!E) return;
    const $ = id => document.getElementById(id);

    const sw = $("prefSound"), vol = $("prefVolume");
    if (sw) {
        sw.checked = E.sound.isEnabled();
        sw.addEventListener("change", () => E.sound.setEnabled(sw.checked));
        document.addEventListener("ekko:sound", e => { sw.checked = e.detail; });
    }
    if (vol) {
        vol.value = Math.round(E.sound.getVolume() * 100);
        vol.addEventListener("input", () => E.sound.setVolume(vol.value / 100));
        vol.addEventListener("change", () => E.sound.play("pop"));
    }

    const fx = $("prefFx");
    if (fx) {
        fx.checked = !document.documentElement.classList.contains("ek-lite");
        fx.addEventListener("change", () => {
            document.documentElement.classList.toggle("ek-lite", !fx.checked);
            E.store.set("ekko-fx", fx.checked ? "on" : "off");
            E.sound.play("click");
        });
    }

    document.querySelectorAll("[data-test-sound]").forEach(b =>
        b.addEventListener("click", () => E.sound.play(b.dataset.testSound, true)));

    const mode = E.theme.get();
    const radio = document.querySelector('input[name="prefTheme"][value="' + mode + '"]');
    if (radio) radio.checked = true;
    document.querySelectorAll('input[name="prefTheme"]').forEach(r =>
        r.addEventListener("change", () => { E.theme.set(r.value); E.sound.play("click"); }));

    const btn = $("prefDesktop"), label = $("prefDesktopState");
    function refresh() {
        if (!label || !btn) return;
        if (!("Notification" in window)) { label.textContent = "Tu navegador no admite avisos."; btn.disabled = true; return; }
        const p = Notification.permission;
        label.textContent = p === "granted" ? "Activados en este navegador." : p === "denied" ? "Bloqueados. Actívalos desde los permisos del sitio." : "Desactivados.";
        btn.hidden = p !== "default";
    }
    btn?.addEventListener("click", () => E.askDesktopPermission().then(() => {
        refresh();
        if (Notification.permission === "granted") E.toast({ type: "success", text: "Recibirás avisos cuando Ekko esté en segundo plano." });
    }));
    refresh();
})();
