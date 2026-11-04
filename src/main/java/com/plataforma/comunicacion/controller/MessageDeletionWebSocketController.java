package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.dto.MessageDeletionEvent;
import com.plataforma.comunicacion.dto.MessageDeletionRequest;
import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;
import com.plataforma.comunicacion.service.ConversationService;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class MessageDeletionWebSocketController {

    private final ConversationService conversationService;
    private final AppUserRepository appUserRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public MessageDeletionWebSocketController(
            ConversationService conversationService,
            AppUserRepository appUserRepository,
            SimpMessagingTemplate messagingTemplate) {

        this.conversationService = conversationService;
        this.appUserRepository = appUserRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/chat.delete")
    public void deleteMessage(
            @Payload MessageDeletionRequest request,
            Principal principal) {

        if (principal == null
                || principal.getName() == null
                || principal.getName().isBlank()) {
            throw new IllegalArgumentException(
                    "Debes iniciar sesión.");
        }

        if (request == null
                || request.conversationId() == null
                || request.messageId() == null) {
            throw new IllegalArgumentException(
                    "La solicitud de eliminación no es válida.");
        }

        AppUser currentUser = appUserRepository
                .findByUsernameIgnoreCase(principal.getName())
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "La cuenta no existe."));

        if (currentUser.isAccountDeleted()) {
            throw new IllegalArgumentException(
                    "La cuenta fue eliminada.");
        }

        MessageDeletionEvent deletionEvent =
                conversationService.deleteMessage(
                        request.messageId(),
                        request.conversationId(),
                        currentUser.getId(),
                        request.deleteForEveryone()
                );

        messagingTemplate.convertAndSend(
                "/topic/conversations/"
                        + deletionEvent.conversationId(),
                deletionEvent
        );
    }
}