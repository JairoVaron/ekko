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

    private static final String CONVERSATION_PREFIX =
            "/topic/conversations/";

    private static final String NOTIFICATIONS_DESTINATION =
            "/user/queue/notifications";

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

        if (destination == null) {
            return message;
        }

        Principal principal = accessor.getUser();

        // Validar la suscripción al canal privado de notificaciones.
        if (NOTIFICATIONS_DESTINATION.equals(destination)) {
            AppUser user = requireAuthenticatedActiveUser(principal);

            if (user.isAccountDeleted()) {
                throw new IllegalArgumentException(
                        "La cuenta ya no está activa.");
            }

            return message;
        }

        // Mantener la validación existente de las conversaciones.
        if (!destination.startsWith(CONVERSATION_PREFIX)) {
            return message;
        }

        AppUser user = requireAuthenticatedActiveUser(principal);

        String suffix =
                destination.substring(CONVERSATION_PREFIX.length());

        if (suffix.endsWith("/status")) {
            suffix = suffix.substring(
                    0,
                    suffix.length() - "/status".length());
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

        conversationService.validateConversationAccess(
                conversationId,
                user.getId());

        return message;
    }

    private AppUser requireAuthenticatedActiveUser(
            Principal principal) {

        if (principal == null
                || principal.getName() == null
                || principal.getName().isBlank()) {

            throw new IllegalArgumentException(
                    "Debes iniciar sesión para recibir notificaciones.");
        }

        AppUser user = appUserRepository
                .findByUsernameIgnoreCase(principal.getName())
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "No se encontró el usuario autenticado."));

        if (user.isAccountDeleted()) {
            throw new IllegalArgumentException(
                    "La cuenta ya no está activa.");
        }

        return user;
    }
}
