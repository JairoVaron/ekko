package com.plataforma.comunicacion.dto;

import org.springframework.web.multipart.MultipartFile;

public class ProfileUpdateForm {

    private String displayName;
    private String bio;
    private MultipartFile avatarFile;
    private boolean removeAvatar;

    public ProfileUpdateForm() {
    }

    // Se conserva por compatibilidad con el constructor anterior.
    public ProfileUpdateForm(
        String displayName,
        String bio,
        String ignoredAvatarUrl
    ) {
        this.displayName = displayName;
        this.bio = bio;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getBio() {
        return bio;
    }

    public void setBio(String bio) {
        this.bio = bio;
    }

    public MultipartFile getAvatarFile() {
        return avatarFile;
    }

    public void setAvatarFile(MultipartFile avatarFile) {
        this.avatarFile = avatarFile;
    }

    public boolean isRemoveAvatar() {
        return removeAvatar;
    }

    public void setRemoveAvatar(boolean removeAvatar) {
        this.removeAvatar = removeAvatar;
    }
}