package com.plataforma.comunicacion.dto;

public record ChatMessageRequest(
        Long conversationId,
        String content
) {
}
