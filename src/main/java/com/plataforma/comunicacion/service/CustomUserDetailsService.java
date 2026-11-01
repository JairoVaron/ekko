package com.plataforma.comunicacion.service;

import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final AppUserRepository appUserRepository;

    public CustomUserDetailsService(
            AppUserRepository appUserRepository
    ) {
        this.appUserRepository = appUserRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String email)
            throws UsernameNotFoundException {

        AppUser appUser = appUserRepository
                .findByEmailIgnoreCase(email.trim())
                .orElseThrow(() ->
                        new UsernameNotFoundException(
                                "Correo o contraseña incorrectos."
                        )
                );

        if (appUser.getPasswordHash() == null
                || appUser.getPasswordHash().isBlank()) {
            throw new UsernameNotFoundException(
                    "Correo o contraseña incorrectos."
            );
        }

        return User.withUsername(appUser.getUsername())
                .password(appUser.getPasswordHash())
                .authorities("ROLE_USER")
                .disabled(
                        appUser.isAccountDeleted()
                                || !appUser.isEmailVerified()
                )
                .build();
    }
}