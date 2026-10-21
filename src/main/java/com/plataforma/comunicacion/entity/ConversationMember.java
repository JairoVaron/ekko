package com.plataforma.comunicacion.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(
    name = "conversation_members",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_conversation_member",
        columnNames = {"conversation_id", "user_id"}
    )
)
public class ConversationMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "conversation_id", nullable = false)
    private Conversation conversation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    protected ConversationMember() {
    }

    @PrePersist
    protected void onCreate() {
        if (joinedAt == null) {
            joinedAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public Conversation getConversation() {
        return conversation;
    }

    public void setConversation(Conversation conversation) {
        this.conversation = conversation;
    }

    public AppUser getUser() {
        return user;
    }

    public void setUser(AppUser user) {
        this.user = user;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }

    public ConversationMember(Conversation conversation, AppUser user) {
        this.conversation = conversation;
        this.user = user;
    }
}
