package com.plataforma.comunicacion.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class RegisterRequest {

    @NotBlank(message = "El nombre de usuario es obligatorio")
    @Size(min = 3, max = 30,
          message = "El usuario debe tener entre 3 y 30 caracteres")
    @Pattern(
        regexp = "^[a-zA-Z0-9_]+$",
        message = "Usa solo letras, números y guion bajo"
    )
    private String username;

    @NotBlank(message = "El correo electrónico es obligatorio")
    @Email(message = "Introduce un correo electrónico válido")
    @Size(max = 254, message = "El correo es demasiado largo")
    private String email;

    @NotBlank(message = "La contraseña es obligatoria")
    @Size(min = 8, max = 72,
          message = "La contraseña debe tener entre 8 y 72 caracteres")
    private String password;

    @NotBlank(message = "Debes introducir tu nombre")
    @Size(max = 80, message = "El nombre no puede superar 80 caracteres")
    private String displayName;

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }
}

