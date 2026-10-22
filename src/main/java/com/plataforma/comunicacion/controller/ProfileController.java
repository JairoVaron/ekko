package com.plataforma.comunicacion.controller;

import com.plataforma.comunicacion.dto.ProfileUpdateForm;
import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.service.ProfileService;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
@RequestMapping("/perfil")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    public String mostrarPerfil(
            Authentication authentication,
            Model model) {

        AppUser user = profileService.getCurrentUser(
                authentication.getName()
        );

        model.addAttribute("profileUser", user);
        model.addAttribute(
                "profileForm",
                new ProfileUpdateForm(
                        user.getDisplayName(),
                        user.getBio(),
                        user.getAvatarUrl()
                )
        );

        return "profile/editar";
    }

    @PostMapping
    public String actualizarPerfil(
            Authentication authentication,
            @ModelAttribute("profileForm") ProfileUpdateForm form,
            Model model,
            RedirectAttributes redirectAttributes) {

        try {
            profileService.updateProfile(
                    authentication.getName(),
                    form
            );

            redirectAttributes.addFlashAttribute(
                    "successMessage",
                    "Tu perfil se ha actualizado correctamente."
            );

            return "redirect:/perfil?actualizado";
        } catch (IllegalArgumentException exception) {
            AppUser user = profileService.getCurrentUser(
                    authentication.getName()
            );

            model.addAttribute("profileUser", user);
            model.addAttribute("errorMessage", exception.getMessage());

            return "profile/editar";
        }
    }
}
