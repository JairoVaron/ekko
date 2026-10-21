package com.plataforma.comunicacion.dto;

import java.time.Instant;

public record MessageStatusView(
    Long conversationId,
    Long messageId,
    Long senderId,
    Instant deliveredAt,
    Instant readAt
) {
}