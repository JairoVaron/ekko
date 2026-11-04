package com.plataforma.comunicacion.dto;

public record MessageDeletionRequest(
        Long conversationId,
        Long messageId,
        boolean deleteForEveryone
) {
}