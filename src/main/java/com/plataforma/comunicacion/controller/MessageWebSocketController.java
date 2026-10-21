package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.dto.ChatMessageRequest;
import com.plataforma.comunicacion.dto.MessageView;
import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;
import com.plataforma.comunicacion.service.ConversationService;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class MessageWebSocketController {

    private final ConversationService conversationService;
    private final AppUserRepository appUserRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public MessageWebSocketController(
            ConversationService conversationService,
            AppUserRepository appUserRepository,
            SimpMessagingTemplate messagingTemplate) {
        this.conversationService = conversationService;
        this.appUserRepository = appUserRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/chat.send")
    public void sendMessage(
            @Payload ChatMessageRequest request,
            Principal principal) {

        if (principal == null || principal.getName() == null) {
            throw new IllegalArgumentException(
                    "Debes iniciar sesión para enviar mensajes.");
        }

        if (request == null
                || request.conversationId() == null
                || request.content() == null
                || request.content().isBlank()) {
            throw new IllegalArgumentException(
                    "El mensaje o la conversación no son válidos.");
        }

        AppUser currentUser = appUserRepository
                .findByUsernameIgnoreCase(principal.getName())
                .orElseThrow(() -> new IllegalArgumentException(
                        "No se encontró el usuario autenticado."));

        if (currentUser.isAccountDeleted()) {
            throw new IllegalArgumentException(
                    "La cuenta fue eliminada.");
        }

        MessageView savedMessage = conversationService.sendMessage(
                request.conversationId(),
                currentUser.getId(),
                request.content()
        );

        publishMessage(request.conversationId(), savedMessage);
    }

    /**
     * Publica el mensaje en el canal compartido.
     * El campo mine se recalcula en cada navegador usando senderId.
     */
    public void publishMessage(
            Long conversationId,
            MessageView message) {

        MessageView sharedMessage = new MessageView(
                message.id(),
                message.senderId(),
                message.senderUsername(),
                message.content(),
                message.sentAt(),
                false,
                message.deliveredAt(),
                message.readAt()
        );

        messagingTemplate.convertAndSend(
                "/topic/conversations/" + conversationId,
                sharedMessage
        );
    }
}
