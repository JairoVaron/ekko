package com.plataforma.comunicacion.service;

import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {

    private final AppUserRepository appUserRepository;

    public AccountService(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    @Transactional
    public void deleteOwnAccount(String authenticatedUsername) {
        AppUser user = appUserRepository
                .findByUsernameIgnoreCaseAndAccountDeletedFalse(
                        authenticatedUsername
                )
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "La cuenta no existe o ya fue eliminada."
                        )
                );

        // Generar un nombre interno disponible para liberar el original.
        String deletedUsername = "eliminado_" + user.getId();

        while (appUserRepository.existsByUsernameIgnoreCase(deletedUsername)) {
            deletedUsername = "eliminado_" + user.getId()
                    + "_" + System.nanoTime();
        }

        // Anonimizar los datos personales.
        user.setUsername(deletedUsername);
        user.setEmail(null);
        user.setPasswordHash(null);
        user.setDisplayName("Cuenta eliminada");
        user.setBio(null);
        user.setAvatarUrl(null);

        // Desactivar la cuenta sin borrar su historial.
        user.setAccountDeleted(true);

        appUserRepository.save(user);
    }
}