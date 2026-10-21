package com.plataforma.comunicacion.service;

import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.entity.EmailVerificationToken;
import com.plataforma.comunicacion.repository.AppUserRepository;
import com.plataforma.comunicacion.repository.EmailVerificationTokenRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;

@Service
public class EmailVerificationService {

    private final EmailVerificationTokenRepository tokenRepository;
    private final AppUserRepository userRepository;
    private final JavaMailSender mailSender;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${app.mail.from}")
    private String from;

    @Value("${app.mail.verification-url}")
    private String baseUrl;

    public EmailVerificationService(
            EmailVerificationTokenRepository tokenRepository,
            AppUserRepository userRepository,
            JavaMailSender mailSender) {
        this.tokenRepository = tokenRepository;
        this.userRepository = userRepository;
        this.mailSender = mailSender;
    }

    @Transactional
    public void sendVerificationEmail(AppUser user) {
        if (user.isAccountDeleted()
                || user.getEmail() == null
                || user.getEmail().isBlank()) {
            throw new IllegalArgumentException(
                "No se puede verificar el correo de esta cuenta."
            );
        }

        if (user.isEmailVerified()) {
            return;
        }

        // Invalidar los tokens anteriores de esta cuenta.
        for (EmailVerificationToken oldToken :
                tokenRepository.findAll()) {
            if (oldToken.getUser().getId().equals(user.getId())
                    && oldToken.getUsedAt() == null) {
                oldToken.setUsedAt(Instant.now());
                tokenRepository.save(oldToken);
            }
        }

        byte[] randomBytes = new byte[32];
        secureRandom.nextBytes(randomBytes);

        String token = Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(randomBytes);

        EmailVerificationToken verificationToken =
            new EmailVerificationToken(
                token,
                user,
                Instant.now().plus(24, ChronoUnit.HOURS)
            );

        tokenRepository.save(verificationToken);

        String encodedToken = URLEncoder.encode(
            token,
            StandardCharsets.UTF_8
        );

        String link = baseUrl
            + "/cuenta/verificar?token="
            + encodedToken;

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(user.getEmail());
        message.setSubject("Verifica tu correo electrónico");
        message.setText(
            "Hola " + user.getDisplayName() + ",\n\n"
            + "Para verificar tu correo electrónico, abre este enlace:\n\n"
            + link + "\n\n"
            + "El enlace caduca en 24 horas y solo se puede utilizar una vez.\n\n"
            + "Si no solicitaste esta cuenta, puedes ignorar este mensaje."
        );

        mailSender.send(message);
    }

    @Transactional
    public void verifyEmail(String token) {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException(
                "El enlace de verificación no es válido."
            );
        }

        EmailVerificationToken verificationToken =
            tokenRepository.findByToken(token)
                .orElseThrow(() -> new IllegalArgumentException(
                    "El enlace de verificación no es válido."
                ));

        Instant now = Instant.now();

        if (verificationToken.getUsedAt() != null) {
            throw new IllegalArgumentException(
                "Este enlace ya fue utilizado."
            );
        }

        if (!verificationToken.getExpiresAt().isAfter(now)) {
            throw new IllegalArgumentException(
                "El enlace ha caducado. Solicita uno nuevo."
            );
        }

        AppUser user = userRepository.findById(
            verificationToken.getUser().getId()
        ).orElseThrow(() -> new IllegalArgumentException(
            "La cuenta asociada no existe."
        ));

        if (user.isAccountDeleted()) {
            throw new IllegalArgumentException(
                "Esta cuenta fue eliminada."
            );
        }

        if (user.getEmail() == null || user.getEmail().isBlank()) {
            throw new IllegalArgumentException(
                "Esta cuenta no tiene un correo válido."
            );
        }

        user.setEmailVerified(true);
        userRepository.save(user);

        verificationToken.setUsedAt(now);
        tokenRepository.save(verificationToken);
    }
}
