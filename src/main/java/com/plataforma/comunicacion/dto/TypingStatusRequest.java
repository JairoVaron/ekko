package com.plataforma.comunicacion.dto;

public record TypingStatusRequest(
        Long conversationId,
        Boolean typing
) {
}