package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.repository.AppUserRepository;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

@ControllerAdvice
public class CurrentUserModelAdvice {

    private final AppUserRepository appUserRepository;

    public CurrentUserModelAdvice(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    @ModelAttribute("currentUser")
    public AppUser currentUser(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            return null;
        }

        return appUserRepository
                .findByUsernameIgnoreCase(authentication.getName())
                .filter(user -> !user.isAccountDeleted())
                .orElse(null);
    }
}
