package com.plataforma.comunicacion.repository;

import com.plataforma.comunicacion.entity.UserBlock;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserBlockRepository
        extends JpaRepository<UserBlock, Long> {

    boolean existsByBlocker_IdAndBlocked_Id(
        Long blockerId,
        Long blockedId
    );

    List<UserBlock> findByBlocker_Id(Long blockerId);

    void deleteByBlocker_IdAndBlocked_Id(
        Long blockerId,
        Long blockedId
    );
}
