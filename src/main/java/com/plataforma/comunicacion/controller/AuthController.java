package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.dto.RegisterRequest;
import com.plataforma.comunicacion.service.AuthService;

import jakarta.validation.Valid;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;

@Controller
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/login")
    public String login() {
        return "auth/login";
    }

    @GetMapping("/registro")
    public String showRegisterForm(Model model) {
        model.addAttribute("form", new RegisterRequest());
        return "auth/registro";
    }

    @PostMapping("/registro")
    public String register(
            @Valid @ModelAttribute("form") RegisterRequest form,
            BindingResult bindingResult,
            Model model) {

        if (bindingResult.hasErrors()) {
            return "auth/registro";
        }

        try {
            authService.register(form);
            return "redirect:/login?registered";

        } catch (IllegalArgumentException ex) {
            model.addAttribute("error", ex.getMessage());
            return "auth/registro";
        }
    }
}
