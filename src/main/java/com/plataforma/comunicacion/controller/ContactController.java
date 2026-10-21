package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;
import com.plataforma.comunicacion.service.ContactService;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequestMapping("/contactos")
public class ContactController {

    private final ContactService contactService;
    private final AppUserRepository users;

    public ContactController(
            ContactService contactService,
            AppUserRepository users) {
        this.contactService = contactService;
        this.users = users;
    }

    private AppUser currentUser(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()) {
            throw new IllegalStateException(
                "Debes iniciar sesión");
        }

        AppUser user = users
            .findByUsernameIgnoreCase(authentication.getName())
            .orElseThrow(() ->
                new IllegalStateException(
                    "No se encontró la cuenta autenticada"));

        if (user.isAccountDeleted()) {
            throw new IllegalStateException(
                "La cuenta ya no está disponible");
        }

        return user;
    }

    @GetMapping
    public String index(
            @RequestParam(required = false) String q,
            Authentication authentication,
            Model model) {

        AppUser user = currentUser(authentication);

        model.addAttribute("username", user.getUsername());
        model.addAttribute("query", q == null ? "" : q);
        model.addAttribute(
            "results",
            contactService.searchUsers(user.getId(), q)
        );
        model.addAttribute(
            "requests",
            contactService.receivedRequests(user.getId())
        );
        model.addAttribute(
            "contacts",
            contactService.contacts(user.getId())
        );
        model.addAttribute(
            "blockedUsers",
            contactService.blockedUsers(user.getId())
        );
        return "contacts/contactos";
    }

    @PostMapping("/solicitar/{userId}")
    public String sendRequest(
            @PathVariable Long userId,
            Authentication authentication,
            RedirectAttributes redirect) {

        try {
            contactService.sendRequest(
                currentUser(authentication).getId(), userId);

            redirect.addFlashAttribute(
                "success", "Solicitud enviada correctamente");

        } catch (IllegalArgumentException ex) {
            redirect.addFlashAttribute("error", ex.getMessage());
        }

        return "redirect:/contactos";
    }

    @PostMapping("/aceptar/{requestId}")
    public String acceptRequest(
            @PathVariable Long requestId,
            Authentication authentication,
            RedirectAttributes redirect) {

        try {
            contactService.acceptRequest(
                currentUser(authentication).getId(), requestId);

            redirect.addFlashAttribute(
                "success", "Solicitud aceptada");

        } catch (IllegalArgumentException ex) {
            redirect.addFlashAttribute("error", ex.getMessage());
        }

        return "redirect:/contactos";
    }

    @PostMapping("/rechazar/{requestId}")
    public String rejectRequest(
            @PathVariable Long requestId,
            Authentication authentication,
            RedirectAttributes redirect) {

        try {
            contactService.rejectRequest(
                currentUser(authentication).getId(), requestId);

            redirect.addFlashAttribute(
                "success", "Solicitud rechazada");

        } catch (IllegalArgumentException ex) {
            redirect.addFlashAttribute("error", ex.getMessage());
        }

        return "redirect:/contactos";
    }

    @PostMapping("/eliminar/{userId}")
    public String removeContact(
            @PathVariable Long userId,
            Authentication authentication,
            RedirectAttributes redirect) {

        try {
            contactService.removeContact(
                currentUser(authentication).getId(), userId);

            redirect.addFlashAttribute(
                "success", "Contacto eliminado");

        } catch (IllegalArgumentException ex) {
            redirect.addFlashAttribute("error", ex.getMessage());
        }

        return "redirect:/contactos";
    }

    @PostMapping("/bloquear/{userId}")
    public String blockUser(
            @PathVariable Long userId,
            Authentication authentication,
            RedirectAttributes redirect) {

        try {
            contactService.blockUser(
                currentUser(authentication).getId(), userId);

            redirect.addFlashAttribute(
                "success", "Usuario bloqueado");

        } catch (IllegalArgumentException ex) {
            redirect.addFlashAttribute("error", ex.getMessage());
        }

        return "redirect:/contactos";
    }

    @PostMapping("/desbloquear/{userId}")
    public String unblockUser(
            @PathVariable Long userId,
            Authentication authentication,
            RedirectAttributes redirect) {

        try {
            contactService.unblockUser(
                currentUser(authentication).getId(), userId);

            redirect.addFlashAttribute(
                "success", "Usuario desbloqueado");

        } catch (IllegalArgumentException ex) {
            redirect.addFlashAttribute("error", ex.getMessage());
        }

        return "redirect:/contactos";
    }

}
