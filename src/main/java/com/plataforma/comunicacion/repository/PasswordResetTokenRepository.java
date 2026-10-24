package com.plataforma.comunicacion.repository;

import com.plataforma.comunicacion.entity.PasswordResetToken;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface PasswordResetTokenRepository
        extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    List<PasswordResetToken> findAllByUser_IdAndUsedAtIsNull(
        Long userId
    );

    long countByUser_IdAndCreatedAtAfter(
        Long userId,
        Instant createdAt
    );
}