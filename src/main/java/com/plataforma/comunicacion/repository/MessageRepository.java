package com.plataforma.comunicacion.repository;

import com.plataforma.comunicacion.entity.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {

    List<Message> findByConversation_IdOrderBySentAtDesc(
            Long conversationId,
            Pageable pageable
    );

    long countByConversation_Id(Long conversationId);

    long countByConversation_IdAndReadAtIsNullAndSender_IdNot(
            Long conversationId,
            Long senderId
    );

    List<Message> findByConversation_IdAndReadAtIsNullAndSender_IdNot(
            Long conversationId,
            Long senderId
    );
}