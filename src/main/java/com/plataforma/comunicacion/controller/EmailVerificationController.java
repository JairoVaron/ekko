package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.service.EmailVerificationService;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class EmailVerificationController {

    private final EmailVerificationService verificationService;

    public EmailVerificationController(
            EmailVerificationService verificationService) {
        this.verificationService = verificationService;
    }

    @GetMapping("/cuenta/verificar")
    public String verifyEmail(
            @RequestParam(name = "token", required = false) String token,
            Model model) {
        try {
            verificationService.verifyEmail(token);
            model.addAttribute(
                "mensaje",
                "Tu correo electrónico ha sido verificado. Ya puedes iniciar sesión."
            );
            model.addAttribute("exito", true);
        } catch (IllegalArgumentException exception) {
            model.addAttribute("mensaje", exception.getMessage());
            model.addAttribute("exito", false);
        }

        return "cuenta/verificacion";
    }
}
