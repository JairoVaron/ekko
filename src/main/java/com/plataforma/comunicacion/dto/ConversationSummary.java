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
        String otherAvatarUrl
) {     
}
