package com.plataforma.comunicacion.dto;

import java.time.Instant;

public record ConversationSummary(
        Long conversationId,
        Long otherUserId,
        String otherUsername,
        String otherDisplayName,
        String lastMessage,
        Instant lastMessageAt,
        long unreadCount,
        String otherAvatarUrl,
        boolean blockedByMe,
        boolean blockedByOther
) {

    /**
     * Constructor de compatibilidad con el formato anterior.
     */
    public ConversationSummary(
            Long conversationId,
            Long otherUserId,
            String otherUsername,
            String otherDisplayName,
            String lastMessage,
            Instant lastMessageAt,
            long unreadCount,
            String otherAvatarUrl) {

        this(
                conversationId,
                otherUserId,
                otherUsername,
                otherDisplayName,
                lastMessage,
                lastMessageAt,
                unreadCount,
                otherAvatarUrl,
                false,
                false
        );
    }
}