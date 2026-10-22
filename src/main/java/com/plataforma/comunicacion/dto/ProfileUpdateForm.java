package com.plataforma.comunicacion.dto;

public class ProfileUpdateForm {

    private String displayName;
    private String bio;
    private String avatarUrl;

    public ProfileUpdateForm() {
    }

    public ProfileUpdateForm(
            String displayName,
            String bio,
            String avatarUrl) {
        this.displayName = displayName;
        this.bio = bio;
        this.avatarUrl = avatarUrl;
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

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }
}
