package com.plataforma.comunicacion.dto;

public record MessageReceiptRequest(
    Long conversationId,
    Long messageId
) {
}