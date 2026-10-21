package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.service.AccountService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class AccountController {

    private final AccountService accountService;

    private final SecurityContextLogoutHandler logoutHandler =
            new SecurityContextLogoutHandler();

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    @GetMapping("/cuenta/eliminar")
    public String showDeleteAccountPage(
            @RequestParam(required = false) String error,
            Model model
    ) {
        if ("confirmacion".equals(error)) {
            model.addAttribute(
                    "error",
                    "Debes confirmar que deseas eliminar tu cuenta."
            );
        }

        return "cuenta/eliminar";
    }

    @PostMapping("/cuenta/eliminar")
    public String deleteAccount(
            @RequestParam(name = "confirmar", defaultValue = "false")
            boolean confirmed,
            Authentication authentication,
            HttpServletRequest request,
            HttpServletResponse response,
            RedirectAttributes redirectAttributes
    ) {
        if (authentication == null
                || !authentication.isAuthenticated()) {
            return "redirect:/login";
        }

        if (!confirmed) {
            return "redirect:/cuenta/eliminar?error=confirmacion";
        }

        try {
            // Se obtiene la identidad desde la sesión autenticada.
            accountService.deleteOwnAccount(authentication.getName());

            // Cerrar la sesión actual tras eliminar la cuenta.
            logoutHandler.logout(request, response, authentication);

            return "redirect:/login?cuentaEliminada";

        } catch (IllegalArgumentException exception) {
            redirectAttributes.addFlashAttribute(
                    "error",
                    exception.getMessage()
            );

            return "redirect:/cuenta/eliminar";
        }
    }
}