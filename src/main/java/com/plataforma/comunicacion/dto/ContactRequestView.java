package com.plataforma.comunicacion.dto;

import java.time.Instant;

public record ContactRequestView(
    Long id,
    Long userId,
    String username,
    String displayName,
    Instant createdAt
) {
}
