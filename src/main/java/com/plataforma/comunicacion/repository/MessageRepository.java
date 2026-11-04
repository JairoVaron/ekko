package com.plataforma.comunicacion.repository;

import com.plataforma.comunicacion.entity.Message;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MessageRepository extends JpaRepository<Message, Long> {

    List<Message> findByConversation_IdOrderBySentAtDesc(
            Long conversationId,
            Pageable pageable
    );

    Optional<Message> findByIdAndConversation_Id(
            Long messageId,
            Long conversationId
    );

    @Query("""
        SELECT m
        FROM Message m
        WHERE m.conversation.id = :conversationId
          AND NOT EXISTS (
              SELECT h.id
              FROM MessageHidden h
              WHERE h.message = m
                AND h.user.id = :userId
          )
        ORDER BY m.sentAt DESC
        """)
    List<Message> findVisibleMessagesForUser(
            @Param("conversationId") Long conversationId,
            @Param("userId") Long userId,
            Pageable pageable
    );

    @Query("""
        SELECT m
        FROM Message m
        WHERE m.conversation.id = :conversationId
          AND m.readAt IS NULL
          AND m.sender.id <> :userId
          AND m.deletedForEveryone = false
          AND NOT EXISTS (
              SELECT h.id
              FROM MessageHidden h
              WHERE h.message = m
                AND h.user.id = :userId
          )
        """)
    List<Message> findUnreadMessagesForUser(
            @Param("conversationId") Long conversationId,
            @Param("userId") Long userId
    );

    @Query("""
        SELECT COUNT(m)
        FROM Message m
        WHERE m.conversation.id = :conversationId
          AND m.readAt IS NULL
          AND m.sender.id <> :userId
          AND m.deletedForEveryone = false
          AND NOT EXISTS (
              SELECT h.id
              FROM MessageHidden h
              WHERE h.message = m
                AND h.user.id = :userId
          )
        """)
    long countUnreadMessagesForUser(
            @Param("conversationId") Long conversationId,
            @Param("userId") Long userId
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