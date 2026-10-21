package com.plataforma.comunicacion.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SettingsController {

    @GetMapping("/configuracion")
    public String configuracion() {
        return "settings/configuracion";
    }

    @GetMapping("/politica-privacidad")
    public String politicaPrivacidad() {
        return "settings/privacidad";
    }
}
