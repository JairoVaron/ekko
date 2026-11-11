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

    /*
     * CONFIRMACIÓN DE ENTREGA
     */

    @MessageMapping("/chat.delivered")
    public void markDelivered(
            MessageReceiptRequest request,
            Principal principal) {

        Long userId = getAuthenticatedUserId(principal);

        if (request == null
                || request.messageId() == null
                || request.conversationId() == null) {

            throw new IllegalArgumentException(
                    "La confirmación de entrega no es válida.");
        }

        MessageStatusView status =
                conversationService.markMessageDelivered(
                        request.messageId(),
                        request.conversationId(),
                        userId
                );

        /*
         * Si el mensaje fue eliminado, ocultado
         * o ya no existe, no publicamos ningún estado.
         */
        if (status == null) {
            return;
        }

        messagingTemplate.convertAndSend(
                "/topic/conversations/"
                        + status.conversationId()
                        + "/status",
                status
        );
    }

    /*
     * CONFIRMACIÓN DE LECTURA
     */

    @MessageMapping("/chat.read")
    public void markRead(
            MessageReceiptRequest request,
            Principal principal) {

        Long userId = getAuthenticatedUserId(principal);

        if (request == null
                || request.messageId() == null
                || request.conversationId() == null) {

            throw new IllegalArgumentException(
                    "La confirmación de lectura no es válida.");
        }

        MessageStatusView status =
                conversationService.markMessageRead(
                        request.messageId(),
                        request.conversationId(),
                        userId
                );

        /*
         * Las confirmaciones atrasadas se ignoran
         * sin generar publicaciones innecesarias.
         */
        if (status == null) {
            return;
        }

        messagingTemplate.convertAndSend(
                "/topic/conversations/"
                        + status.conversationId()
                        + "/status",
                status
        );
    }

    /*
     * IDENTIFICAR USUARIO AUTENTICADO
     */

    private Long getAuthenticatedUserId(Principal principal) {

        if (principal == null
                || principal.getName() == null
                || principal.getName().isBlank()) {

            throw new IllegalArgumentException(
                    "Debes iniciar sesión.");
        }

        AppUser user = appUserRepository
                .findByUsernameIgnoreCase(principal.getName())
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "La cuenta no existe."));

        if (user.isAccountDeleted()) {
            throw new IllegalArgumentException(
                    "La cuenta fue eliminada.");
        }

        return user.getId();
    }
}