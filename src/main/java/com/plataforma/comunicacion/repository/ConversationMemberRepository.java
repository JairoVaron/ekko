package com.plataforma.comunicacion.repository;

import com.plataforma.comunicacion.entity.ConversationMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ConversationMemberRepository
        extends JpaRepository<ConversationMember, Long> {

    boolean existsByConversation_IdAndUser_Id(
        Long conversationId,
        Long userId
    );

    Optional<ConversationMember> findByConversation_IdAndUser_Id(
        Long conversationId,
        Long userId
    );

    List<ConversationMember> findByUser_IdOrderByJoinedAtDesc(
        Long userId
    );

    List<ConversationMember> findByConversation_Id(
        Long conversationId
    );
}
