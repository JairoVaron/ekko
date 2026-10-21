package com.plataforma.comunicacion.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(
    name = "user_blocks",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_user_block",
        columnNames = {"blocker_id", "blocked_id"}
    )
)
public class UserBlock {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "blocker_id", nullable = false)
    private AppUser blocker;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "blocked_id", nullable = false)
    private AppUser blocked;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected UserBlock() {
    }

    public UserBlock(AppUser blocker, AppUser blocked) {
        this.blocker = blocker;
        this.blocked = blocked;
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

    public AppUser getBlocker() {
        return blocker;
    }

    public AppUser getBlocked() {
        return blocked;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
