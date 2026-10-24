package com.plataforma.comunicacion.dto;

public record GlobalNotification(
        String type,
        Long notificationId,
        Long conversationId,
        Long messageId,
        Long senderId,
        String senderName,
        String content,
        String sentAt,
        String actionUrl
) {
}