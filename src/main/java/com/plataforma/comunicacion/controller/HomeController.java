package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController {

    private final AppUserRepository appUserRepository;

    public HomeController(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    @GetMapping("/")
    public String root() {
        return "redirect:/inicio";
    }

    @GetMapping("/inicio")
    public String home(Authentication authentication, Model model) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication.getName() == null) {
            return "redirect:/login";
        }

        AppUser user = appUserRepository
                .findByUsernameIgnoreCase(authentication.getName())
                .orElseThrow(() ->
                        new IllegalStateException(
                                "No se encontró el usuario autenticado."));

        if (user.isAccountDeleted()) {
            return "redirect:/login?error";
        }

        model.addAttribute("currentUser", user);

        return "inicio";
    }
}
