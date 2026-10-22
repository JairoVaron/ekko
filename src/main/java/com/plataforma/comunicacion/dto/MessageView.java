package com.plataforma.comunicacion.dto;

import java.time.Instant;

public record MessageView(
        Long id,
        Long senderId,
        String senderUsername,
        String content,
        Instant sentAt,
        boolean mine,
        Instant deliveredAt,
        Instant readAt,
        String senderDisplayName,
        String senderAvatarUrl
) {
}