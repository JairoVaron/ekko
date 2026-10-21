package com.plataforma.comunicacion.repository;

import com.plataforma.comunicacion.entity.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByUsernameIgnoreCase(String username);

    Optional<AppUser> findByEmailIgnoreCase(String email);

    boolean existsByUsernameIgnoreCase(String username);

    boolean existsByEmailIgnoreCase(String email);

    Optional<AppUser> findByUsernameIgnoreCaseAndAccountDeletedFalse(
        String username
    );

    List<AppUser> findTop20ByUsernameContainingIgnoreCaseAndAccountDeletedFalseOrderByUsernameAsc(
        String username
    );
}
