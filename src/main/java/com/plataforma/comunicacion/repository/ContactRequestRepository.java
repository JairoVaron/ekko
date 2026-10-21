package com.plataforma.comunicacion.repository;

import com.plataforma.comunicacion.entity.ContactRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ContactRequestRepository
        extends JpaRepository<ContactRequest, Long> {

    List<ContactRequest> findByAddressee_IdAndStatusOrderByCreatedAtDesc(
        Long addresseeId,
        String status
    );

    List<ContactRequest> findByRequester_IdAndStatusOrderByCreatedAtDesc(
        Long requesterId,
        String status
    );

    Optional<ContactRequest> findByRequester_IdAndAddressee_Id(
        Long requesterId,
        Long addresseeId
    );

    boolean existsByRequester_IdAndAddressee_IdAndStatus(
        Long requesterId,
        Long addresseeId,
        String status
    );

    void deleteByRequester_IdAndAddressee_Id(
        Long requesterId,
        Long addresseeId
    );

    void deleteByRequester_IdAndAddressee_IdAndStatus(
        Long requesterId,
        Long addresseeId,
        String status
    );
}
