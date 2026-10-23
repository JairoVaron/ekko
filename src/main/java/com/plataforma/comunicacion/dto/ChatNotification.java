package com.plataforma.comunicacion.dto;

public record ChatNotification(
        Long conversationId,
        Long messageId,
        Long senderId,
        String senderName,
        String content,
        String sentAt
) {
}
