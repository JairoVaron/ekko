package com.plataforma.comunicacion.service;

import com.plataforma.comunicacion.dto.RegisterRequest;
import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
public class AuthService {

    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailVerificationService emailVerificationService;

    public AuthService(
            AppUserRepository appUserRepository,
            PasswordEncoder passwordEncoder,
            EmailVerificationService emailVerificationService) {
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailVerificationService = emailVerificationService;
    }

    @Transactional
    public AppUser register(RegisterRequest request) {
        if (request.getUsername() == null
                || request.getEmail() == null
                || request.getDisplayName() == null
                || request.getPassword() == null) {
            throw new IllegalArgumentException(
                "Todos los campos son obligatorios."
            );
        }

        String username = request.getUsername()
            .trim().toLowerCase(Locale.ROOT);

        String email = request.getEmail()
            .trim().toLowerCase(Locale.ROOT);

        String displayName = request.getDisplayName().trim();

        if (username.isBlank() || email.isBlank()
                || displayName.isBlank()
                || request.getPassword().isBlank()) {
            throw new IllegalArgumentException(
                "Todos los campos son obligatorios."
            );
        }

        if (appUserRepository.existsByUsernameIgnoreCase(username)) {
            throw new IllegalArgumentException(
                "Ese nombre de usuario ya está registrado."
            );
        }

        if (appUserRepository.existsByEmailIgnoreCase(email)) {
            throw new IllegalArgumentException(
                "Ese correo electrónico ya está registrado."
            );
        }

        AppUser user = new AppUser();
        user.setUsername(username);
        user.setEmail(email);
        user.setDisplayName(displayName);
        user.setPasswordHash(
            passwordEncoder.encode(request.getPassword())
        );
        user.setEmailVerified(false);

        try {
            AppUser savedUser = appUserRepository.saveAndFlush(user);

            emailVerificationService.sendVerificationEmail(savedUser);

            return savedUser;
        } catch (DataIntegrityViolationException ex) {
            throw new IllegalArgumentException(
                "El nombre de usuario o el correo ya están registrados."
            );
        }
    }
}