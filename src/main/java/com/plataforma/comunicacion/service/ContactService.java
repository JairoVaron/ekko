package com.plataforma.comunicacion.service;

import com.plataforma.comunicacion.dto.ContactRealtimeView;
import com.plataforma.comunicacion.dto.ContactRequestView;
import com.plataforma.comunicacion.dto.ContactUserView;
import com.plataforma.comunicacion.dto.GlobalNotification;
import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.entity.ContactRequest;
import com.plataforma.comunicacion.entity.UserBlock;
import com.plataforma.comunicacion.repository.AppUserRepository;
import com.plataforma.comunicacion.repository.ContactRequestRepository;
import com.plataforma.comunicacion.repository.UserBlockRepository;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

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

    /* VALIDACIONES */
    private AppUser requireActiveUser(Long id) {

        AppUser user = users.findById(id)
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "El usuario no existe"));

        if (user.isAccountDeleted()) {
            throw new IllegalArgumentException(
                    "La cuenta ya no está disponible");
        }

        return user;
    }

    private void requireDifferentUsers(Long first, Long second) {

        if (first == null || second == null || first.equals(second)) {
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

    private boolean isBlocked(Long first, Long second) {

        return blocks.existsByBlocker_IdAndBlocked_Id(first, second)
                || blocks.existsByBlocker_IdAndBlocked_Id(second, first);
    }

    /* CONVERSIÓN A DTO */
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
                requester.isAccountDeleted()
                        ? null
                        : requester.getAvatarUrl()
        );
    }

    /* BUSCAR USUARIOS */
    @Transactional(readOnly = true)
    public List<ContactUserView> searchUsers(
            Long currentUserId,
            String query) {

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
                .filter(user -> !isBlocked(currentUserId, user.getId()))
                .map(this::toUserView)
                .toList();
    }

    /* ENVIAR SOLICITUD */
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

            existing.setStatus("PENDING");
            request = requests.save(existing);

        } else {

            request = new ContactRequest();
            request.setRequester(requester);
            request.setAddressee(addressee);
            request.setStatus("PENDING");

            request = requests.save(request);
        }

        requests.flush();

        String senderName = requester.getDisplayName();

        if (senderName == null || senderName.isBlank()) {
            senderName = requester.getUsername();
        }

        GlobalNotification notification = new GlobalNotification(
                "CONTACT_REQUEST",
                request.getId(),
                null,
                null,
                requester.getId(),
                senderName,
                "Te ha enviado una solicitud de contacto.",
                Instant.now().toString(),
                "/contactos"
        );

        publishSnapshotsAfterCommit(requester, addressee);

        String recipientUsername = addressee.getUsername();

        afterCommit(() -> messagingTemplate.convertAndSendToUser(
                recipientUsername,
                "/queue/notifications",
                notification
        ));
    }

    /* SOLICITUDES RECIBIDAS */
    @Transactional(readOnly = true)
    public List<ContactRequestView> receivedRequests(Long userId) {

        requireActiveUser(userId);

        return requests
                .findByAddressee_IdAndStatusOrderByCreatedAtDesc(
                        userId, "PENDING")
                .stream()
                .filter(request ->
                        !request.getRequester().isAccountDeleted())
                .filter(request ->
                        !isBlocked(
                                userId,
                                request.getRequester().getId()))
                .map(this::toRequestView)
                .toList();
    }

    /* =====================================================
       6. LISTA DE CONTACTOS
       ===================================================== */

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
                .filter(user -> !isBlocked(userId, user.getId()))
                .map(this::toUserView)
                .forEach(result::add);

        received.stream()
                .map(ContactRequest::getRequester)
                .filter(user -> !user.isAccountDeleted())
                .filter(user -> !isBlocked(userId, user.getId()))
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

    /* =====================================================
       7. ACEPTAR SOLICITUD
       ===================================================== */

    @Transactional
    public void acceptRequest(Long currentUserId, Long requestId) {

        requireActiveUser(currentUserId);

        ContactRequest request = requests.findById(requestId)
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "Solicitud no encontrada"));

        if (!request.getAddressee().getId().equals(currentUserId)) {
            throw new IllegalArgumentException(
                    "No tienes permiso para aceptar esta solicitud");
        }

        if (!"PENDING".equals(request.getStatus())) {
            throw new IllegalArgumentException(
                    "La solicitud ya no está pendiente");
        }

        AppUser requester = requireActiveUser(
                request.getRequester().getId());

        AppUser addressee = requireActiveUser(currentUserId);

        requireNotBlocked(requester.getId(), addressee.getId());

        request.setStatus("ACCEPTED");

        requests.save(request);
        requests.flush();

        publishSnapshotsAfterCommit(requester, addressee);
    }

    /* =====================================================
       8. RECHAZAR SOLICITUD
       ===================================================== */

    @Transactional
    public void rejectRequest(Long currentUserId, Long requestId) {

        requireActiveUser(currentUserId);

        ContactRequest request = requests.findById(requestId)
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "Solicitud no encontrada"));

        if (!request.getAddressee().getId().equals(currentUserId)) {
            throw new IllegalArgumentException(
                    "No tienes permiso para rechazar esta solicitud");
        }

        if (!"PENDING".equals(request.getStatus())) {
            throw new IllegalArgumentException(
                    "La solicitud ya no está pendiente");
        }

        AppUser requester = requireActiveUser(
                request.getRequester().getId());

        AppUser addressee = requireActiveUser(currentUserId);

        request.setStatus("REJECTED");

        requests.save(request);
        requests.flush();

        publishSnapshotsAfterCommit(requester, addressee);
    }

    /* =====================================================
       9. ELIMINAR CONTACTO
       ===================================================== */

    @Transactional
    public void removeContact(Long currentUserId, Long otherUserId) {

        requireDifferentUsers(currentUserId, otherUserId);

        AppUser currentUser = requireActiveUser(currentUserId);
        AppUser otherUser = requireActiveUser(otherUserId);

        boolean first = requests
                .findByRequester_IdAndAddressee_Id(
                        currentUserId, otherUserId)
                .filter(request ->
                        "ACCEPTED".equals(request.getStatus()))
                .isPresent();

        boolean second = requests
                .findByRequester_IdAndAddressee_Id(
                        otherUserId, currentUserId)
                .filter(request ->
                        "ACCEPTED".equals(request.getStatus()))
                .isPresent();

        if (!first && !second) {
            throw new IllegalArgumentException(
                    "No existe un contacto aceptado con este usuario");
        }

        requests.deleteByRequester_IdAndAddressee_IdAndStatus(
                currentUserId, otherUserId, "ACCEPTED");

        requests.deleteByRequester_IdAndAddressee_IdAndStatus(
                otherUserId, currentUserId, "ACCEPTED");

        requests.flush();

        publishSnapshotsAfterCommit(currentUser, otherUser);
    }

        /* =====================================================
        10. BLOQUEAR USUARIO
        ===================================================== */

        @Transactional
        public void blockUser(Long blockerId, Long blockedId) {

        requireDifferentUsers(blockerId, blockedId);

        AppUser blocker = requireActiveUser(blockerId);
        AppUser blocked = requireActiveUser(blockedId);

        // Crear el bloqueo solamente si todavía no existe.
        if (!blocks.existsByBlocker_IdAndBlocked_Id(
                blockerId, blockedId)) {

                blocks.save(new UserBlock(blocker, blocked));
        }

        /*
        * Eliminar únicamente solicitudes pendientes.
        *
        * IMPORTANTE:
        * Las relaciones ACCEPTED se conservan.
        * Así podremos recuperar el contacto al desbloquear.
        */

        requests.deleteByRequester_IdAndAddressee_IdAndStatus(
                blockerId, blockedId, "PENDING");

        requests.deleteByRequester_IdAndAddressee_IdAndStatus(
                blockedId, blockerId, "PENDING");

        requests.flush();
        blocks.flush();

        // Actualizar los datos de contactos de ambos usuarios.
        publishSnapshotsAfterCommit(blocker, blocked);
        }

        /* =====================================================
        11. DESBLOQUEAR USUARIO
        ===================================================== */

        @Transactional
        public void unblockUser(Long blockerId, Long blockedId) {

        requireDifferentUsers(blockerId, blockedId);

        AppUser blocker = requireActiveUser(blockerId);
        AppUser blocked = requireActiveUser(blockedId);

        if (!blocks.existsByBlocker_IdAndBlocked_Id(
                blockerId, blockedId)) {

                throw new IllegalArgumentException(
                        "No tienes bloqueado a este usuario");
        }

        /*
        * Eliminar exclusivamente el bloqueo.
        *
        * No eliminamos las relaciones ACCEPTED:
        * si existían antes del bloqueo, volverán a aparecer
        * automáticamente en las listas de contactos.
        *
        * Si no existía una relación aceptada antes,
        * no crearemos ninguna.
        */

        blocks.deleteByBlocker_IdAndBlocked_Id(
                blockerId, blockedId);

        blocks.flush();

        // Actualizar las listas de ambos usuarios.
        publishSnapshotsAfterCommit(blocker, blocked);
        }

    /* =====================================================
       12. USUARIOS BLOQUEADOS
       ===================================================== */

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

    /* =====================================================
       13. ACTUALIZACIÓN EN TIEMPO REAL
       ===================================================== */

    private ContactRealtimeView createSnapshot(Long userId) {

        return new ContactRealtimeView(
                "CONTACTS_UPDATED",
                contacts(userId),
                receivedRequests(userId),
                blockedUsers(userId)
        );
    }

    private void publishSnapshotsAfterCommit(
            AppUser first,
            AppUser second) {

        // Crear los snapshots después de ejecutar las
        // operaciones pendientes de la base de datos.
        ContactRealtimeView firstSnapshot =
                createSnapshot(first.getId());

        ContactRealtimeView secondSnapshot =
                createSnapshot(second.getId());

        String firstUsername = first.getUsername();
        String secondUsername = second.getUsername();

        afterCommit(() -> {

            messagingTemplate.convertAndSendToUser(
                    firstUsername,
                    "/queue/contacts",
                    firstSnapshot
            );

            messagingTemplate.convertAndSendToUser(
                    secondUsername,
                    "/queue/contacts",
                    secondSnapshot
            );
        });
    }

    /* =====================================================
       14. EJECUTAR DESPUÉS DEL COMMIT
       ===================================================== */

    private void afterCommit(Runnable action) {

        if (!TransactionSynchronizationManager
                .isSynchronizationActive()) {

            throw new IllegalStateException(
                    "No existe una transacción activa para programar la actualización");
        }

        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {

                    @Override
                    public void afterCommit() {
                        action.run();
                    }
                }
        );
    }
}