package com.plataforma.comunicacion.dto;

public record BlockStatusRealtimeView(
        String type,
        Long otherUserId,
        boolean blockedByMe,
        boolean blockedByOther
) {
}