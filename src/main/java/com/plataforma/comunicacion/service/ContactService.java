package com.plataforma.comunicacion.service;

import com.plataforma.comunicacion.dto.ContactRequestView;
import com.plataforma.comunicacion.dto.ContactUserView;
import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.entity.ContactRequest;
import com.plataforma.comunicacion.entity.UserBlock;
import com.plataforma.comunicacion.repository.AppUserRepository;
import com.plataforma.comunicacion.repository.ContactRequestRepository;
import com.plataforma.comunicacion.repository.UserBlockRepository;
import com.plataforma.comunicacion.dto.GlobalNotification;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ContactService {

    private final AppUserRepository users;
    private final ContactRequestRepository requests;
    private final UserBlockRepository blocks;
    private final SimpMessagingTemplate messagingTemplate;

    public ContactService(
            AppUserRepository users,
            ContactRequestRepository requests,
            UserBlockRepository blocks,
            SimpMessagingTemplate messagingTemplate) {

        this.users = users;
        this.requests = requests;
        this.blocks = blocks;
        this.messagingTemplate = messagingTemplate;
    }

    private AppUser requireActiveUser(Long id) {
        AppUser user = users.findById(id)
                .orElseThrow(() ->
                        new IllegalArgumentException("El usuario no existe"));

        if (user.isAccountDeleted()) {
            throw new IllegalArgumentException(
                    "La cuenta ya no está disponible");
        }

        return user;
    }

    private void requireDifferentUsers(Long first, Long second) {
        if (first.equals(second)) {
            throw new IllegalArgumentException(
                    "No puedes realizar esta acción sobre tu propia cuenta");
        }
    }

    private void requireNotBlocked(Long first, Long second) {
        if (blocks.existsByBlocker_IdAndBlocked_Id(first, second)
                || blocks.existsByBlocker_IdAndBlocked_Id(second, first)) {
            throw new IllegalArgumentException(
                    "No puedes realizar esta acción debido a un bloqueo");
        }
    }

    private ContactUserView toUserView(AppUser user) {
        return new ContactUserView(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getBio(),
                user.isAccountDeleted() ? null : user.getAvatarUrl()
        );
    }

    private ContactRequestView toRequestView(ContactRequest request) {
        AppUser requester = request.getRequester();

        return new ContactRequestView(
                request.getId(),
                requester.getId(),
                requester.getUsername(),
                requester.getDisplayName(),
                request.getCreatedAt(),
                requester.isAccountDeleted() ? null : requester.getAvatarUrl()
        );
    }

    @Transactional(readOnly = true)
    public List<ContactUserView> searchUsers(
            Long currentUserId, String query) {

        requireActiveUser(currentUserId);

        if (query == null || query.isBlank()) {
            return List.of();
        }

        String term = query.trim();

        if (term.length() > 30) {
            throw new IllegalArgumentException(
                    "La búsqueda no puede superar 30 caracteres");
        }

        return users
                .findTop20ByUsernameContainingIgnoreCaseAndAccountDeletedFalseOrderByUsernameAsc(
                        term)
                .stream()
                .filter(user -> !user.getId().equals(currentUserId))
                .filter(user -> !blocks.existsByBlocker_IdAndBlocked_Id(
                        currentUserId, user.getId()))
                .filter(user -> !blocks.existsByBlocker_IdAndBlocked_Id(
                        user.getId(), currentUserId))
                .map(this::toUserView)
                .toList();
    }

        @Transactional
        public void sendRequest(Long requesterId, Long addresseeId) {
        requireDifferentUsers(requesterId, addresseeId);

        AppUser requester = requireActiveUser(requesterId);
        AppUser addressee = requireActiveUser(addresseeId);

        requireNotBlocked(requesterId, addresseeId);

        ContactRequest existing = requests
                .findByRequester_IdAndAddressee_Id(
                        requesterId, addresseeId)
                .orElse(null);

        ContactRequest reverse = requests
                .findByRequester_IdAndAddressee_Id(
                        addresseeId, requesterId)
                .orElse(null);

        if (existing != null
                && ("PENDING".equals(existing.getStatus())
                || "ACCEPTED".equals(existing.getStatus()))) {
                throw new IllegalArgumentException(
                        "Ya existe una solicitud o relación con este usuario");
        }

        if (reverse != null
                && ("PENDING".equals(reverse.getStatus())
                || "ACCEPTED".equals(reverse.getStatus()))) {
                throw new IllegalArgumentException(
                        "Ya existe una solicitud o relación con este usuario");
        }

        ContactRequest request;

        if (existing != null) {
                // Volver a activar una solicitud que fue rechazada anteriormente.
                existing.setStatus("PENDING");
                request = requests.save(existing);
        } else {
                request = new ContactRequest();
                request.setRequester(requester);
                request.setAddressee(addressee);
                request.setStatus("PENDING");

                request = requests.save(request);
        }

        // Guardar primero y enviar el aviso solamente si la transacción
        // termina correctamente.
        final Long requestId = request.getId();
        final String recipientUsername = addressee.getUsername();
        final Long senderId = requester.getId();

        String senderName = requester.getDisplayName();

        if (senderName == null || senderName.isBlank()) {
                senderName = requester.getUsername();
        }

        final String finalSenderName = senderName;

        GlobalNotification notification = new GlobalNotification(
                "CONTACT_REQUEST",
                requestId,
                null,
                null,
                senderId,
                finalSenderName,
                "Te ha enviado una solicitud de contacto.",
                Instant.now().toString(),
                "/contactos"
        );

        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                        messagingTemplate.convertAndSendToUser(
                                recipientUsername,
                                "/queue/notifications",
                                notification
                        );
                        }
                }
        );
        }

    @Transactional(readOnly = true)
    public List<ContactRequestView> receivedRequests(Long userId) {
        requireActiveUser(userId);

        return requests
                .findByAddressee_IdAndStatusOrderByCreatedAtDesc(
                        userId, "PENDING")
                .stream()
                .filter(request -> !request.getRequester().isAccountDeleted())
                .map(this::toRequestView)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ContactUserView> contacts(Long userId) {
        requireActiveUser(userId);

        List<ContactUserView> result = new ArrayList<>();

        List<ContactRequest> sent = requests
                .findByRequester_IdAndStatusOrderByCreatedAtDesc(
                        userId, "ACCEPTED");

        List<ContactRequest> received = requests
                .findByAddressee_IdAndStatusOrderByCreatedAtDesc(
                        userId, "ACCEPTED");

        sent.stream()
                .map(ContactRequest::getAddressee)
                .filter(user -> !user.isAccountDeleted())
                .map(this::toUserView)
                .forEach(result::add);

        received.stream()
                .map(ContactRequest::getRequester)
                .filter(user -> !user.isAccountDeleted())
                .map(this::toUserView)
                .forEach(result::add);

        return result.stream()
                .collect(Collectors.toMap(
                        ContactUserView::id,
                        user -> user,
                        (first, second) -> first,
                        LinkedHashMap::new
                ))
                .values()
                .stream()
                .toList();
    }

    @Transactional
    public void acceptRequest(Long currentUserId, Long requestId) {
        requireActiveUser(currentUserId);

        ContactRequest request = requests.findById(requestId)
                .orElseThrow(() ->
                        new IllegalArgumentException("Solicitud no encontrada"));

        if (!request.getAddressee().getId().equals(currentUserId)) {
            throw new IllegalArgumentException(
                    "No tienes permiso para aceptar esta solicitud");
        }

        if (!"PENDING".equals(request.getStatus())) {
            throw new IllegalArgumentException(
                    "La solicitud ya no está pendiente");
        }

        requireNotBlocked(request.getRequester().getId(), currentUserId);
        requireActiveUser(request.getRequester().getId());

        request.setStatus("ACCEPTED");
        requests.save(request);
    }

    @Transactional
    public void rejectRequest(Long currentUserId, Long requestId) {
        requireActiveUser(currentUserId);

        ContactRequest request = requests.findById(requestId)
                .orElseThrow(() ->
                        new IllegalArgumentException("Solicitud no encontrada"));

        if (!request.getAddressee().getId().equals(currentUserId)) {
            throw new IllegalArgumentException(
                    "No tienes permiso para rechazar esta solicitud");
        }

        if (!"PENDING".equals(request.getStatus())) {
            throw new IllegalArgumentException(
                    "La solicitud ya no está pendiente");
        }

        request.setStatus("REJECTED");
        requests.save(request);
    }

    @Transactional
    public void removeContact(Long currentUserId, Long otherUserId) {
        requireDifferentUsers(currentUserId, otherUserId);
        requireActiveUser(currentUserId);

        boolean first = requests
                .findByRequester_IdAndAddressee_Id(
                        currentUserId, otherUserId)
                .filter(request -> "ACCEPTED".equals(request.getStatus()))
                .isPresent();

        boolean second = requests
                .findByRequester_IdAndAddressee_Id(
                        otherUserId, currentUserId)
                .filter(request -> "ACCEPTED".equals(request.getStatus()))
                .isPresent();

        if (!first && !second) {
            throw new IllegalArgumentException(
                    "No existe un contacto aceptado con este usuario");
        }

        requests.deleteByRequester_IdAndAddressee_IdAndStatus(
                currentUserId, otherUserId, "ACCEPTED");

        requests.deleteByRequester_IdAndAddressee_IdAndStatus(
                otherUserId, currentUserId, "ACCEPTED");
    }

    @Transactional
    public void blockUser(Long blockerId, Long blockedId) {
        requireDifferentUsers(blockerId, blockedId);

        AppUser blocker = requireActiveUser(blockerId);
        AppUser blocked = requireActiveUser(blockedId);

        if (!blocks.existsByBlocker_IdAndBlocked_Id(blockerId, blockedId)) {
            blocks.save(new UserBlock(blocker, blocked));
        }

        requests.deleteByRequester_IdAndAddressee_Id(blockerId, blockedId);
        requests.deleteByRequester_IdAndAddressee_Id(blockedId, blockerId);
    }

    @Transactional
    public void unblockUser(Long blockerId, Long blockedId) {
        requireDifferentUsers(blockerId, blockedId);
        requireActiveUser(blockerId);

        if (!blocks.existsByBlocker_IdAndBlocked_Id(blockerId, blockedId)) {
            throw new IllegalArgumentException(
                    "No tienes bloqueado a este usuario");
        }

        blocks.deleteByBlocker_IdAndBlocked_Id(blockerId, blockedId);
    }

    @Transactional(readOnly = true)
    public List<ContactUserView> blockedUsers(Long userId) {
        requireActiveUser(userId);

        return blocks.findByBlocker_Id(userId)
                .stream()
                .map(UserBlock::getBlocked)
                .filter(user -> !user.isAccountDeleted())
                .map(this::toUserView)
                .toList();
    }
}
