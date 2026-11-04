package com.plataforma.comunicacion.entity;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(
    name = "message_hidden",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_message_hidden_user_message",
            columnNames = {"message_id", "user_id"}
        )
    }
)
public class MessageHidden {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "message_id", nullable = false)
    private Message message;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public MessageHidden() {
    }

    public MessageHidden(Message message, AppUser user) {
        this.message = message;
        this.user = user;
    }

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public Message getMessage() {
        return message;
    }

    public void setMessage(Message message) {
        this.message = message;
    }

    public AppUser getUser() {
        return user;
    }

    public void setUser(AppUser user) {
        this.user = user;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}