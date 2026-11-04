package com.plataforma.comunicacion.dto;

import java.util.List;

public record ContactRealtimeView(
        String type,
        List<ContactUserView> contacts,
        List<ContactRequestView> requests,
        List<ContactUserView> blockedUsers
) {
}