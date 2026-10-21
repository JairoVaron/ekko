package com.plataforma.comunicacion.dto;

public record ContactUserView(
    Long id,
    String username,
    String displayName,
    String bio,
    String avatarUrl
) {
}
