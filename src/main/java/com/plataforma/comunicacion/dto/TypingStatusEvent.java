package com.plataforma.comunicacion.dto;

public record TypingStatusEvent(
        Long conversationId,
        Long userId,
        boolean typing
) {
}