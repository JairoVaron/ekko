package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.service.PasswordResetService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class PasswordResetController {

    private static final Logger log =
        LoggerFactory.getLogger(PasswordResetController.class);

    private final PasswordResetService passwordResetService;

    public PasswordResetController(
            PasswordResetService passwordResetService) {
        this.passwordResetService = passwordResetService;
    }

    @GetMapping("/cuenta/recuperar")
    public String showRequestForm() {
        return "auth/recuperar-password";
    }

    @PostMapping("/cuenta/recuperar")
    public String requestReset(
            @RequestParam(name = "email", required = false) String email,
            Model model) {

        try {
            passwordResetService.requestPasswordReset(email);

        } catch (Exception exception) {
            /*
             * No registrar la dirección introducida ni el token.
             * El usuario siempre recibe una respuesta genérica.
             */
            log.error(
                "No se pudo procesar la solicitud de recuperación "
                + "de contraseña. Tipo de error: {}",
                exception.getClass().getSimpleName()
            );
        }

        model.addAttribute(
            "mensaje",
            "Si el correo corresponde a una cuenta verificada, "
            + "recibirás instrucciones para recuperar el acceso. "
            + "Revisa también la carpeta de spam."
        );

        return "auth/recuperar-password";
    }

    @GetMapping("/cuenta/restablecer")
    public String showResetForm(
            @RequestParam(name = "token", required = false) String token,
            Model model) {

        boolean valid = passwordResetService.isTokenValid(token);

        model.addAttribute("token", token);
        model.addAttribute("tokenValido", valid);

        if (!valid) {
            model.addAttribute(
                "error",
                "El enlace no es válido, ya se utilizó o ha caducado. "
                + "Solicita uno nuevo."
            );
        }

        return "auth/restablecer-password";
    }

    @PostMapping("/cuenta/restablecer")
    public String resetPassword(
            @RequestParam(name = "token", required = false) String token,
            @RequestParam(
                name = "password",
                required = false
            ) String password,
            @RequestParam(
                name = "confirmPassword",
                required = false
            ) String confirmPassword,
            Model model) {

        try {
            passwordResetService.resetPassword(
                token,
                password,
                confirmPassword
            );

            return "redirect:/login?passwordReset";

        } catch (IllegalArgumentException exception) {
            model.addAttribute("token", token);
            model.addAttribute(
                "error",
                exception.getMessage()
            );
            model.addAttribute(
                "tokenValido",
                passwordResetService.isTokenValid(token)
            );

            return "auth/restablecer-password";

        } catch (Exception exception) {
            log.error(
                "Error interno al restablecer una contraseña. "
                + "Tipo de error: {}",
                exception.getClass().getSimpleName()
            );

            model.addAttribute("token", token);
            model.addAttribute(
                "error",
                "No se pudo completar el cambio de contraseña. "
                + "Inténtalo nuevamente."
            );
            model.addAttribute(
                "tokenValido",
                passwordResetService.isTokenValid(token)
            );

            return "auth/restablecer-password";
        }
    }
}