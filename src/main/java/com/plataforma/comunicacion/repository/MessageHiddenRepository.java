package com.plataforma.comunicacion.repository;

import com.plataforma.comunicacion.entity.MessageHidden;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MessageHiddenRepository
        extends JpaRepository<MessageHidden, Long> {

    boolean existsByMessage_IdAndUser_Id(
            Long messageId,
            Long userId
    );

    List<MessageHidden> findByUser_IdAndMessage_Conversation_Id(
            Long userId,
            Long conversationId
    );
}