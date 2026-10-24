package com.plataforma.comunicacion.service;

import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.entity.PasswordResetToken;
import com.plataforma.comunicacion.repository.AppUserRepository;
import com.plataforma.comunicacion.repository.PasswordResetTokenRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

@Service
public class PasswordResetService {

    private static final int TOKEN_EXPIRATION_MINUTES = 20;

    private static final int MAX_REQUESTS_PER_WINDOW = 3;

    private static final int REQUEST_WINDOW_MINUTES = 15;

    private static final int MIN_PASSWORD_LENGTH = 8;

    private static final int MAX_BCRYPT_PASSWORD_BYTES = 72;

    private final AppUserRepository appUserRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JavaMailSender mailSender;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${app.mail.from}")
    private String from;

    @Value("${app.mail.password-reset-url}")
    private String baseUrl;

    public PasswordResetService(
            AppUserRepository appUserRepository,
            PasswordResetTokenRepository tokenRepository,
            PasswordEncoder passwordEncoder,
            JavaMailSender mailSender) {

        this.appUserRepository = appUserRepository;
        this.tokenRepository = tokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.mailSender = mailSender;
    }

    /**
     * Solicita la recuperación de contraseña.
     *
     * El controlador debe mostrar la misma respuesta tanto si
     * existe la cuenta como si no existe.
     */
    @Transactional
    public void requestPasswordReset(String email) {

        if (email == null || email.isBlank()) {
            return;
        }

        String normalizedEmail = email.trim()
            .toLowerCase(Locale.ROOT);

        if (normalizedEmail.length() > 254) {
            return;
        }

        AppUser user = appUserRepository
            .findByEmailIgnoreCase(normalizedEmail)
            .orElse(null);

        /*
         * No se genera ningún token para cuentas inexistentes,
         * eliminadas o que no han verificado su correo.
         */
        if (user == null
                || user.isAccountDeleted()
                || !user.isEmailVerified()
                || user.getEmail() == null
                || user.getEmail().isBlank()) {
            return;
        }

        Instant now = Instant.now();

        Instant windowStart = now.minus(
            REQUEST_WINDOW_MINUTES,
            ChronoUnit.MINUTES
        );

        long recentRequests =
            tokenRepository.countByUser_IdAndCreatedAtAfter(
                user.getId(),
                windowStart
            );

        /*
         * Límite por cuenta: tres solicitudes en quince minutos.
         * Se conserva una respuesta genérica en el controlador.
         */
        if (recentRequests >= MAX_REQUESTS_PER_WINDOW) {
            return;
        }

        /*
         * Invalidar los enlaces anteriores todavía no utilizados.
         */
        List<PasswordResetToken> previousTokens =
            tokenRepository.findAllByUser_IdAndUsedAtIsNull(
                user.getId()
            );

        for (PasswordResetToken previousToken : previousTokens) {
            previousToken.setUsedAt(now);
        }

        tokenRepository.saveAll(previousTokens);

        /*
         * Generar 256 bits aleatorios.
         */
        byte[] randomBytes = new byte[32];
        secureRandom.nextBytes(randomBytes);

        String rawToken = Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(randomBytes);

        String tokenHash = hashToken(rawToken);

        PasswordResetToken resetToken =
            new PasswordResetToken(
                tokenHash,
                user,
                now.plus(
                    TOKEN_EXPIRATION_MINUTES,
                    ChronoUnit.MINUTES
                )
            );

        tokenRepository.saveAndFlush(resetToken);

        String encodedToken = URLEncoder.encode(
            rawToken,
            StandardCharsets.UTF_8
        );

        String normalizedBaseUrl = baseUrl.replaceAll("/+$", "");

        String resetLink = normalizedBaseUrl
            + "/cuenta/restablecer?token="
            + encodedToken;

        SimpleMailMessage message = new SimpleMailMessage();

        message.setFrom(from);
        message.setTo(user.getEmail());
        message.setSubject("Recuperación de contraseña de Ekko");

        message.setText(
            "Hola "
            + (user.getDisplayName() == null
                || user.getDisplayName().isBlank()
                    ? user.getUsername()
                    : user.getDisplayName())
            + ",\n\n"

            + "Recibimos una solicitud para recuperar "
            + "la contraseña de tu cuenta de Ekko.\n\n"

            + "Para establecer una contraseña nueva, abre "
            + "el siguiente enlace:\n\n"

            + resetLink
            + "\n\n"

            + "Este enlace caduca en "
            + TOKEN_EXPIRATION_MINUTES
            + " minutos y solo puede utilizarse una vez.\n\n"

            + "Si no solicitaste recuperar tu contraseña, "
            + "ignora este correo. Tu contraseña actual "
            + "no cambiará mientras no completes el proceso.\n\n"

            + "Por seguridad, no compartas este enlace con nadie.\n\n"

            + "Equipo de Ekko"
        );

        /*
         * Si el envío falla, la excepción se propaga y la
         * transacción puede revertir la creación del token.
         * El controlador mostrará un mensaje genérico.
         */
        mailSender.send(message);
    }

    /**
     * Comprueba que el enlace existe, no se ha usado,
     * no ha caducado y pertenece a una cuenta válida.
     */
    @Transactional(readOnly = true)
    public boolean isTokenValid(String rawToken) {

        if (rawToken == null
                || rawToken.isBlank()
                || rawToken.length() > 200) {
            return false;
        }

        String tokenHash = hashToken(rawToken);

        PasswordResetToken resetToken = tokenRepository
            .findByTokenHash(tokenHash)
            .orElse(null);

        if (resetToken == null) {
            return false;
        }

        Instant now = Instant.now();

        if (resetToken.getUsedAt() != null
                || !resetToken.getExpiresAt().isAfter(now)) {
            return false;
        }

        AppUser user = resetToken.getUser();

        return !user.isAccountDeleted()
            && user.isEmailVerified()
            && user.getEmail() != null
            && !user.getEmail().isBlank();
    }

    /**
     * Cambia la contraseña y consume el token.
     */
    @Transactional
    public void resetPassword(
            String rawToken,
            String newPassword,
            String confirmPassword) {

        if (rawToken == null
                || rawToken.isBlank()
                || rawToken.length() > 200) {
            throw new IllegalArgumentException(
                "El enlace no es válido o ha caducado."
            );
        }

        if (newPassword == null || confirmPassword == null) {
            throw new IllegalArgumentException(
                "Debes completar los dos campos de contraseña."
            );
        }

        if (!newPassword.equals(confirmPassword)) {
            throw new IllegalArgumentException(
                "Las contraseñas no coinciden."
            );
        }

        if (newPassword.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalArgumentException(
                "La contraseña debe tener al menos 8 caracteres."
            );
        }

        if (newPassword.getBytes(StandardCharsets.UTF_8).length
                > MAX_BCRYPT_PASSWORD_BYTES) {
            throw new IllegalArgumentException(
                "La contraseña es demasiado larga. "
                + "Utiliza como máximo 72 bytes UTF-8."
            );
        }

        String tokenHash = hashToken(rawToken);

        PasswordResetToken resetToken = tokenRepository
            .findByTokenHash(tokenHash)
            .orElseThrow(() -> new IllegalArgumentException(
                "El enlace no es válido o ha caducado."
            ));

        Instant now = Instant.now();

        if (resetToken.getUsedAt() != null
                || !resetToken.getExpiresAt().isAfter(now)) {
            throw new IllegalArgumentException(
                "El enlace no es válido o ha caducado. "
                + "Solicita uno nuevo."
            );
        }

        AppUser user = appUserRepository
            .findById(resetToken.getUser().getId())
            .orElseThrow(() -> new IllegalArgumentException(
                "La cuenta asociada no existe."
            ));

        if (user.isAccountDeleted()) {
            throw new IllegalArgumentException(
                "Esta cuenta fue eliminada."
            );
        }

        if (!user.isEmailVerified()
                || user.getEmail() == null
                || user.getEmail().isBlank()) {
            throw new IllegalArgumentException(
                "La cuenta no cumple los requisitos "
                + "para recuperar la contraseña."
            );
        }

        /*
         * Guardar siempre el hash BCrypt, nunca la contraseña
         * original.
         */
        user.setPasswordHash(
            passwordEncoder.encode(newPassword)
        );

        appUserRepository.save(user);

        /*
         * Consumir el token y revocar todos los demás enlaces
         * pendientes de esta cuenta.
         */
        List<PasswordResetToken> userTokens =
            tokenRepository.findAllByUser_IdAndUsedAtIsNull(
                user.getId()
            );

        for (PasswordResetToken userToken : userTokens) {
            userToken.setUsedAt(now);
        }

        tokenRepository.saveAll(userTokens);
    }

    /**
     * Devuelve el SHA-256 del token en hexadecimal.
     */
    private String hashToken(String rawToken) {

        try {
            MessageDigest digest =
                MessageDigest.getInstance("SHA-256");

            byte[] hash = digest.digest(
                rawToken.getBytes(StandardCharsets.UTF_8)
            );

            StringBuilder hexadecimal = new StringBuilder(64);

            for (byte value : hash) {
                hexadecimal.append(
                    String.format("%02x", value & 0xff)
                );
            }

            return hexadecimal.toString();

        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                "No está disponible SHA-256.",
                exception
            );
        }
    }
}