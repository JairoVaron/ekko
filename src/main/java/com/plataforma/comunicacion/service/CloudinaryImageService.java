package com.plataforma.comunicacion.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.Transformation;
import com.cloudinary.utils.ObjectUtils;
import com.plataforma.comunicacion.dto.CloudinaryImageResult;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class CloudinaryImageService {

    private static final Logger log =
        LoggerFactory.getLogger(CloudinaryImageService.class);

    private static final String PROFILE_FOLDER =
        "ekko/profile-avatars";

    private static final long MAX_FILE_SIZE =
        5L * 1024 * 1024;

    private static final String[] ALLOWED_CONTENT_TYPES = {
        "image/jpeg",
        "image/png",
        "image/webp"
    };

    private final Cloudinary cloudinary;

    public CloudinaryImageService(Cloudinary cloudinary) {
        this.cloudinary = cloudinary;
    }

    /**
     * Sube una fotografía de perfil a Cloudinary.
     *
     * Cada subida genera un public_id único para poder
     * conservar la fotografía anterior hasta confirmar
     * que la nueva se ha guardado correctamente.
     */
    public CloudinaryImageResult uploadProfileImage(
        Long userId,
        MultipartFile file
    ) {

        validateBasicFile(userId, file);

        String publicId = "user_" + userId + "_" +
            UUID.randomUUID();

        try {

            Map<String, Object> options = ObjectUtils.asMap(
                "folder", PROFILE_FOLDER,
                "public_id", publicId,
                "resource_type", "image",
                "overwrite", false,
                "transformation",
                    new Transformation()
                        .width(512)
                        .height(512)
                        .crop("fill")
                        .gravity("face")
                        .quality("auto:good")
                        .fetchFormat("auto")
            );

            Map<?, ?> result = cloudinary.uploader().upload(
                file.getBytes(),
                options
            );

            Object secureUrl = result.get("secure_url");
            Object uploadedPublicId = result.get("public_id");

            if (secureUrl == null || uploadedPublicId == null) {
                throw new IllegalStateException(
                    "Cloudinary no devolvió los datos de la imagen."
                );
            }

            return new CloudinaryImageResult(
                secureUrl.toString(),
                uploadedPublicId.toString()
            );

        } catch (Exception exception) {

            log.error(
                "No se pudo subir la fotografía de perfil del usuario {}",
                userId,
                exception
            );

            throw new IllegalStateException(
                "No fue posible subir la fotografía. Inténtalo nuevamente."
            );
        }
    }

    /**
     * Elimina una fotografía de perfil.
     *
     * Comprueba que el public_id pertenezca al usuario
     * indicado antes de ejecutar la eliminación.
     */
    public void deleteProfileImage(
        Long userId,
        String publicId
    ) {

        if (userId == null || publicId == null ||
            publicId.isBlank()) {
            return;
        }

        String expectedPrefix =
            PROFILE_FOLDER + "/user_" + userId + "_";

        if (!publicId.startsWith(expectedPrefix)) {
            throw new IllegalArgumentException(
                "La fotografía no pertenece al usuario indicado."
            );
        }

        try {

            Map<?, ?> result = cloudinary.uploader().destroy(
                publicId,
                ObjectUtils.asMap(
                    "resource_type", "image",
                    "invalidate", true
                )
            );

            Object status = result.get("result");

            if (status == null ||
                (!"ok".equals(status) &&
                 !"not found".equals(status))) {

                throw new IllegalStateException(
                    "Cloudinary no pudo eliminar la fotografía."
                );
            }

        } catch (Exception exception) {

            log.error(
                "No se pudo eliminar la fotografía de perfil del usuario {}",
                userId,
                exception
            );

            throw new IllegalStateException(
                "No fue posible eliminar la fotografía."
            );
        }
    }

    /**
     * Validaciones básicas previas a la subida.
     *
     * La inspección del contenido real de la imagen
     * y las validaciones de seguridad adicionales
     * se completarán en la fase 8.
     */
    private void validateBasicFile(
        Long userId,
        MultipartFile file
    ) {

        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException(
                "El usuario indicado no es válido."
            );
        }

        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException(
                "Debes seleccionar una fotografía."
            );
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException(
                "La fotografía no puede superar los 5 MB."
            );
        }

        String contentType = file.getContentType();

        boolean allowed = false;

        if (contentType != null) {
            for (String allowedType : ALLOWED_CONTENT_TYPES) {
                if (allowedType.equalsIgnoreCase(contentType)) {
                    allowed = true;
                    break;
                }
            }
        }

        if (!allowed) {
            throw new IllegalArgumentException(
                "Solo se permiten imágenes JPEG, PNG y WebP."
            );
        }
    }
}