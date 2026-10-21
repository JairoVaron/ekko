package com.plataforma.comunicacion.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController {

    @GetMapping("/")
    public String root() {
        return "redirect:/inicio";
    }

    @GetMapping("/inicio")
    public String home() {
        return "inicio";
    }
}
