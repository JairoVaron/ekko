package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.dto.MessageReceiptRequest;
import com.plataforma.comunicacion.dto.MessageStatusView;
import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;
import com.plataforma.comunicacion.service.ConversationService;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
public class MessageReceiptWebSocketController {

    private final ConversationService conversationService;
    private final AppUserRepository appUserRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public MessageReceiptWebSocketController(
            ConversationService conversationService,
            AppUserRepository appUserRepository,
            SimpMessagingTemplate messagingTemplate) {
        this.conversationService = conversationService;
        this.appUserRepository = appUserRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/chat.delivered")
    public void markDelivered(
            MessageReceiptRequest request,
            Principal principal) {

        Long userId = getAuthenticatedUserId(principal);

        MessageStatusView status =
            conversationService.markMessageDelivered(
                request.messageId(),
                request.conversationId(),
                userId
            );

        messagingTemplate.convertAndSend(
            "/topic/conversations/"
                + status.conversationId()
                + "/status",
            status
        );
    }

    @MessageMapping("/chat.read")
    public void markRead(
            MessageReceiptRequest request,
            Principal principal) {

        Long userId = getAuthenticatedUserId(principal);

        MessageStatusView status =
            conversationService.markMessageRead(
                request.messageId(),
                request.conversationId(),
                userId
            );

        messagingTemplate.convertAndSend(
            "/topic/conversations/"
                + status.conversationId()
                + "/status",
            status
        );
    }

    private Long getAuthenticatedUserId(Principal principal) {
        if (principal == null || principal.getName() == null) {
            throw new IllegalArgumentException(
                "Debes iniciar sesión."
            );
        }

        AppUser user = appUserRepository
            .findByUsernameIgnoreCase(principal.getName())
            .orElseThrow(() -> new IllegalArgumentException(
                "La cuenta no existe."
            ));

        if (user.isAccountDeleted()) {
            throw new IllegalArgumentException(
                "La cuenta fue eliminada."
            );
        }

        return user.getId();
    }
}
