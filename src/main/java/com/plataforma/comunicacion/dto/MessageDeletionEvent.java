package com.plataforma.comunicacion.dto;

import java.time.Instant;

public record MessageDeletionEvent(
        Long conversationId,
        Long messageId,
        Long userId,
        boolean deletedForEveryone,
        Instant deletedAt
) {
}