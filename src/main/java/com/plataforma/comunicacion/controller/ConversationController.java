package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.dto.MessageView;
import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;
import com.plataforma.comunicacion.repository.ConversationMemberRepository;
import com.plataforma.comunicacion.service.ConversationService;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.Objects;

@Controller
@RequestMapping("/mensajes")
public class ConversationController {

    private final ConversationService conversationService;
    private final AppUserRepository appUserRepository;
    private final ConversationMemberRepository conversationMemberRepository;
    private final MessageWebSocketController messageWebSocketController;

    public ConversationController(
            ConversationService conversationService,
            AppUserRepository appUserRepository,
            ConversationMemberRepository conversationMemberRepository,
            MessageWebSocketController messageWebSocketController) {

        this.conversationService = conversationService;
        this.appUserRepository = appUserRepository;
        this.conversationMemberRepository = conversationMemberRepository;
        this.messageWebSocketController = messageWebSocketController;
    }

    private AppUser currentUser(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication.getName() == null) {
            throw new IllegalStateException("Debes iniciar sesión.");
        }

        AppUser user = appUserRepository
                .findByUsernameIgnoreCase(authentication.getName())
                .orElseThrow(() ->
                        new IllegalStateException("Usuario no encontrado."));

        if (user.isAccountDeleted()) {
            throw new IllegalStateException("La cuenta no está activa.");
        }

        return user;
    }

    @GetMapping
    public String list(Authentication authentication, Model model) {
        AppUser user = currentUser(authentication);

        model.addAttribute("username", user.getUsername());
        model.addAttribute("currentUserId", user.getId());
        model.addAttribute(
                "conversations",
                conversationService.listConversations(user.getId()));

        return "chat/conversaciones";
    }

    @PostMapping("/abrir/{userId}")
    public String open(
            @PathVariable Long userId,
            Authentication authentication,
            RedirectAttributes redirectAttributes) {

        AppUser user = currentUser(authentication);

        try {
            Long conversationId = conversationService.openConversation(
                    user.getId(), userId);

            return "redirect:/mensajes/" + conversationId;

        } catch (IllegalArgumentException exception) {
            redirectAttributes.addFlashAttribute(
                    "error", exception.getMessage());
            return "redirect:/contactos";
        }
    }

    @GetMapping("/{conversationId}")
    public String detail(
            @PathVariable Long conversationId,
            Authentication authentication,
            Model model,
            RedirectAttributes redirectAttributes) {

        AppUser user = currentUser(authentication);

        try {
            model.addAttribute(
                    "messages",
                    conversationService.getMessages(
                            conversationId, user.getId()));

            Long otherUserId = conversationMemberRepository
                    .findByConversation_Id(conversationId)
                    .stream()
                    .map(member -> member.getUser().getId())
                    .filter(id -> !Objects.equals(id, user.getId()))
                    .findFirst()
                    .orElseThrow(() ->
                            new IllegalArgumentException(
                                    "No se encontró al otro participante."));

            AppUser otherUser = appUserRepository.findById(otherUserId)
                    .orElseThrow(() ->
                            new IllegalArgumentException(
                                    "El otro participante ya no existe."));

            boolean otherAccountDeleted = otherUser.isAccountDeleted();

            String otherUsername = otherAccountDeleted
                    ? "Cuenta eliminada"
                    : otherUser.getUsername();

            String otherDisplayName = otherAccountDeleted
                    ? "Cuenta eliminada"
                    : (otherUser.getDisplayName() != null
                        && !otherUser.getDisplayName().isBlank()
                            ? otherUser.getDisplayName()
                            : otherUser.getUsername());

            String otherAvatarUrl = otherAccountDeleted
                    ? null
                    : otherUser.getAvatarUrl();

            String otherBio = otherAccountDeleted
                    ? null
                    : otherUser.getBio();        

            model.addAttribute("username", user.getUsername());
            model.addAttribute("currentUserId", user.getId());
            model.addAttribute("currentUserAvatarUrl", user.getAvatarUrl());
            model.addAttribute("conversationId", conversationId);
            model.addAttribute("otherUsername", otherUsername);
            model.addAttribute("otherDisplayName", otherDisplayName);
            model.addAttribute("otherAvatarUrl", otherAvatarUrl);
            model.addAttribute("otherBio", otherBio);

            return "chat/conversacion";

        } catch (IllegalArgumentException exception) {
            redirectAttributes.addFlashAttribute(
                    "error", exception.getMessage());
            return "redirect:/mensajes";
        }
    }

    @PostMapping("/{conversationId}/enviar")
    public String send(
            @PathVariable Long conversationId,
            @RequestParam String content,
            Authentication authentication,
            RedirectAttributes redirectAttributes) {

        AppUser user = currentUser(authentication);

        try {
            MessageView savedMessage = conversationService.sendMessage(
                    conversationId, user.getId(), content);

            // Se conserva la publicación del mensaje guardado por WebSocket.
            messageWebSocketController.publishMessage(
                    conversationId, savedMessage);

        } catch (IllegalArgumentException exception) {
            redirectAttributes.addFlashAttribute(
                    "error", exception.getMessage());
        }

        return "redirect:/mensajes/" + conversationId;
    }
}
