package com.plataforma.comunicacion.service;

import com.plataforma.comunicacion.dto.ProfileUpdateForm;
import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

@Service
@Transactional
public class ProfileService {

    private final AppUserRepository appUserRepository;

    public ProfileService(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    @Transactional(readOnly = true)
    public AppUser getCurrentUser(String username) {
        AppUser user = appUserRepository
                .findByUsernameIgnoreCase(username)
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "No se encontró el usuario autenticado."
                        )
                );

        if (user.isAccountDeleted()) {
            throw new IllegalArgumentException(
                    "La cuenta ya no está activa."
            );
        }

        return user;
    }

    public AppUser updateProfile(
            String username,
            ProfileUpdateForm form) {

        AppUser user = getCurrentUser(username);

        String displayName = normalize(form.getDisplayName());
        String bio = normalize(form.getBio());
        String avatarUrl = normalize(form.getAvatarUrl());

        validateDisplayName(displayName);
        validateBio(bio);
        validateAvatarUrl(avatarUrl);

        user.setDisplayName(displayName);
        user.setBio(emptyToNull(bio));
        user.setAvatarUrl(emptyToNull(avatarUrl));

        return appUserRepository.save(user);
    }

    private void validateDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            throw new IllegalArgumentException(
                    "El nombre visible es obligatorio."
            );
        }

        if (displayName.length() > 60) {
            throw new IllegalArgumentException(
                    "El nombre visible no puede superar los 60 caracteres."
            );
        }
    }

    private void validateBio(String bio) {
        if (bio != null && bio.length() > 500) {
            throw new IllegalArgumentException(
                    "La biografía no puede superar los 500 caracteres."
            );
        }
    }

    private void validateAvatarUrl(String avatarUrl) {
        if (avatarUrl == null || avatarUrl.isBlank()) {
            return;
        }

        if (avatarUrl.length() > 500) {
            throw new IllegalArgumentException(
                    "La URL del avatar no puede superar los 500 caracteres."
            );
        }

        try {
            URI uri = new URI(avatarUrl);

            String scheme = uri.getScheme();

            boolean validScheme = scheme != null
                    && (
                        scheme.toLowerCase(Locale.ROOT).equals("https")
                        || scheme.toLowerCase(Locale.ROOT).equals("http")
                    );

            if (!validScheme
                    || uri.getHost() == null
                    || uri.getHost().isBlank()
                    || uri.getUserInfo() != null) {
                throw new IllegalArgumentException(
                        "Introduce una URL válida que comience por https:// o http://."
                );
            }
        } catch (URISyntaxException exception) {
            throw new IllegalArgumentException(
                    "La URL del avatar no tiene un formato válido."
            );
        }
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }

        String result = value.strip();
        return result.isEmpty() ? null : result;
    }

    private String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
