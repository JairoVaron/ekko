package com.plataforma.comunicacion.repository;

import com.plataforma.comunicacion.entity.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConversationRepository
        extends JpaRepository<Conversation, Long> {
}
