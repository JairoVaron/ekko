package com.plataforma.comunicacion.config;

import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;
import com.plataforma.comunicacion.service.ConversationService;

import java.security.Principal;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

@Component
public class ConversationSubscriptionInterceptor
        implements ChannelInterceptor {

    private static final String PREFIX = "/topic/conversations/";

    private final AppUserRepository appUserRepository;
    private final ConversationService conversationService;

    public ConversationSubscriptionInterceptor(
            AppUserRepository appUserRepository,
            ConversationService conversationService) {
        this.appUserRepository = appUserRepository;
        this.conversationService = conversationService;
    }

    @Override
    public Message<?> preSend(
            Message<?> message,
            MessageChannel channel) {

        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(
                        message,
                        StompHeaderAccessor.class);

        if (accessor == null
                || accessor.getCommand() != StompCommand.SUBSCRIBE) {
            return message;
        }

        String destination = accessor.getDestination();

        if (destination == null
                || !destination.startsWith(PREFIX)) {
            return message;
        }

        Principal principal = accessor.getUser();

        if (principal == null) {
            throw new IllegalArgumentException(
                    "Debes iniciar sesión para acceder a la conversación.");
        }

        String suffix = destination.substring(PREFIX.length());

        // Admite el canal de mensajes y el canal de confirmaciones.
        if (suffix.endsWith("/status")) {
            suffix = suffix.substring(
                    0, suffix.length() - "/status".length());
        }

        final Long conversationId;

        try {
            conversationId = Long.valueOf(suffix);

            if (conversationId <= 0) {
                throw new NumberFormatException();
            }
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException(
                    "El identificador de conversación no es válido.");
        }

        AppUser user = appUserRepository
                .findByUsernameIgnoreCase(principal.getName())
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "No se encontró el usuario autenticado."));

        conversationService.validateConversationAccess(
                conversationId,
                user.getId());

        return message;
    }
}
