package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.dto.TypingStatusEvent;
import com.plataforma.comunicacion.dto.TypingStatusRequest;
import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;
import com.plataforma.comunicacion.service.ConversationService;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class TypingWebSocketController {

    private final AppUserRepository appUserRepository;
    private final ConversationService conversationService;
    private final SimpMessagingTemplate messagingTemplate;

    public TypingWebSocketController(
            AppUserRepository appUserRepository,
            ConversationService conversationService,
            SimpMessagingTemplate messagingTemplate) {

        this.appUserRepository = appUserRepository;
        this.conversationService = conversationService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/chat.typing")
    public void updateTyping(
            @Payload TypingStatusRequest request,
            Principal principal) {

        if (principal == null
                || principal.getName() == null
                || principal.getName().isBlank()) {

            throw new IllegalArgumentException(
                    "Debes iniciar sesión para enviar este evento.");
        }

        if (request == null
                || request.conversationId() == null
                || request.conversationId() <= 0
                || request.typing() == null) {

            throw new IllegalArgumentException(
                    "El evento de escritura no es válido.");
        }

        AppUser currentUser = appUserRepository
                .findByUsernameIgnoreCase(principal.getName())
                .orElseThrow(() -> new IllegalArgumentException(
                        "No se encontró el usuario autenticado."));

        if (currentUser.isAccountDeleted()) {
            throw new IllegalArgumentException(
                    "La cuenta ya no está activa.");
        }

        Long conversationId = request.conversationId();

        // Comprueba que el usuario pueda interactuar en esta conversación.
        conversationService.validateTypingAccess(
                conversationId,
                currentUser.getId());

        TypingStatusEvent event = new TypingStatusEvent(
                conversationId,
                currentUser.getId(),
                request.typing()
        );

        messagingTemplate.convertAndSend(
                "/topic/conversations/" + conversationId + "/typing",
                event
        );
    }
}