package com.plataforma.comunicacion.service;

import com.plataforma.comunicacion.dto.CloudinaryImageResult;
import com.plataforma.comunicacion.dto.ProfileUpdateForm;
import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@Transactional
public class ProfileService {

    private static final Logger log =
        LoggerFactory.getLogger(ProfileService.class);

    private final AppUserRepository appUserRepository;
    private final CloudinaryImageService cloudinaryImageService;

    public ProfileService(
        AppUserRepository appUserRepository,
        CloudinaryImageService cloudinaryImageService
    ) {
        this.appUserRepository = appUserRepository;
        this.cloudinaryImageService = cloudinaryImageService;
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
        ProfileUpdateForm form
    ) {

        AppUser user = getCurrentUser(username);

        String displayName = normalize(form.getDisplayName());
        String bio = normalize(form.getBio());

        validateDisplayName(displayName);
        validateBio(bio);

        boolean hasNewImage =
            form.getAvatarFile() != null &&
            !form.getAvatarFile().isEmpty();

        if (form.isRemoveAvatar() && hasNewImage) {
            throw new IllegalArgumentException(
                "No puedes subir y eliminar una fotografía al mismo tiempo."
            );
        }

        String previousPublicId = user.getAvatarPublicId();

        CloudinaryImageResult uploadedImage = null;

        // Subimos primero la imagen nueva.
        if (hasNewImage) {

            uploadedImage = cloudinaryImageService.uploadProfileImage(
                user.getId(),
                form.getAvatarFile()
            );
        }

        AppUser savedUser;

        try {

            user.setDisplayName(displayName);
            user.setBio(emptyToNull(bio));

            if (uploadedImage != null) {

                user.setAvatarUrl(uploadedImage.url());
                user.setAvatarPublicId(uploadedImage.publicId());

            } else if (form.isRemoveAvatar()) {

                user.setAvatarUrl(null);
                user.setAvatarPublicId(null);
            }

            savedUser = appUserRepository.saveAndFlush(user);

        } catch (RuntimeException exception) {

            // Si PostgreSQL falla, limpiamos la imagen nueva.
            if (uploadedImage != null) {

                try {

                    cloudinaryImageService.deleteProfileImage(
                        user.getId(),
                        uploadedImage.publicId()
                    );

                } catch (RuntimeException cleanupException) {

                    log.error(
                        "No se pudo limpiar la imagen nueva del usuario {}",
                        user.getId(),
                        cleanupException
                    );
                }
            }

            throw exception;
        }

        final Long userId = user.getId();
        final String oldPublicId = previousPublicId;
        final CloudinaryImageResult newImage = uploadedImage;

        /*
         * Coordinación entre PostgreSQL y Cloudinary.
         */
        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {

                @Override
                public void afterCommit() {

                    // Solo después de confirmar PostgreSQL
                    // eliminamos la fotografía anterior.

                    if (oldPublicId != null &&
                        !oldPublicId.isBlank() &&
                        (newImage != null || form.isRemoveAvatar())) {

                        try {

                            cloudinaryImageService.deleteProfileImage(
                                userId,
                                oldPublicId
                            );

                        } catch (RuntimeException exception) {

                            log.error(
                                "No se pudo eliminar la fotografía anterior del usuario {}",
                                userId,
                                exception
                            );
                        }
                    }
                }

                @Override
                public void afterCompletion(int status) {

                    // Si otra operación provoca un rollback,
                    // eliminamos la imagen nueva para evitar
                    // archivos huérfanos en Cloudinary.

                    if (status ==
                        TransactionSynchronization.STATUS_ROLLED_BACK
                        && newImage != null) {

                        try {

                            cloudinaryImageService.deleteProfileImage(
                                userId,
                                newImage.publicId()
                            );

                        } catch (RuntimeException exception) {

                            log.error(
                                "No se pudo limpiar la fotografía tras el rollback del usuario {}",
                                userId,
                                exception
                            );
                        }
                    }
                }
            }
        );

        return savedUser;
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

    private String normalize(String value) {

        if (value == null) {
            return null;
        }

        String result = value.strip();

        return result.isEmpty() ? null : result;
    }

    private String emptyToNull(String value) {

        return value == null || value.isBlank()
            ? null
            : value;
    }
}