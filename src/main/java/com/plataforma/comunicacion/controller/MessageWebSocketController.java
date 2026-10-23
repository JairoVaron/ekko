package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.dto.ChatMessageRequest;
import com.plataforma.comunicacion.dto.ChatNotification;
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

        if (principal == null
                || principal.getName() == null
                || principal.getName().isBlank()) {
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
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "No se encontró el usuario autenticado."));

        if (currentUser.isAccountDeleted()) {
            throw new IllegalArgumentException(
                    "La cuenta fue eliminada.");
        }

        Long conversationId = request.conversationId();

        // Guarda y valida el mensaje mediante el servicio existente.
        MessageView savedMessage = conversationService.sendMessage(
                conversationId,
                currentUser.getId(),
                request.content()
        );

        // Mantiene el canal original del chat en tiempo real.
        publishMessage(conversationId, savedMessage);

        // Busca al otro participante de la conversación.
        String recipientUsername =
                conversationService.getOtherParticipantUsername(
                        conversationId,
                        currentUser.getId()
                );

        // Crea el aviso privado para la campana global.
        ChatNotification notification = new ChatNotification(
                conversationId,
                savedMessage.id(),
                currentUser.getId(),
                savedMessage.senderDisplayName(),
                savedMessage.content(),
                savedMessage.sentAt() == null
                        ? null
                        : savedMessage.sentAt().toString()
        );

        messagingTemplate.convertAndSendToUser(
                recipientUsername,
                "/queue/notifications",
                notification
        );
    }

    /**
     * Publica el mensaje guardado en el canal compartido.
     * No cambia la estructura de MessageView que consume chat.js.
     */
    public void publishMessage(
            Long conversationId,
            MessageView message) {

        if (conversationId == null || message == null) {
            throw new IllegalArgumentException(
                    "La conversación y el mensaje son obligatorios.");
        }

        MessageView sharedMessage = new MessageView(
                message.id(),
                message.senderId(),
                message.senderUsername(),
                message.content(),
                message.sentAt(),
                false,
                message.deliveredAt(),
                message.readAt(),
                message.senderDisplayName(),
                message.senderAvatarUrl()
        );

        messagingTemplate.convertAndSend(
                "/topic/conversations/" + conversationId,
                sharedMessage
        );
    }
}
