package com.plataforma.comunicacion.service;

import com.plataforma.comunicacion.dto.ConversationSummary;
import com.plataforma.comunicacion.dto.MessageStatusView;
import com.plataforma.comunicacion.dto.MessageView;
import com.plataforma.comunicacion.entity.AppUser;
import com.plataforma.comunicacion.entity.ContactRequest;
import com.plataforma.comunicacion.entity.Conversation;
import com.plataforma.comunicacion.entity.ConversationMember;
import com.plataforma.comunicacion.entity.Message;
import com.plataforma.comunicacion.repository.AppUserRepository;
import com.plataforma.comunicacion.repository.ContactRequestRepository;
import com.plataforma.comunicacion.repository.ConversationMemberRepository;
import com.plataforma.comunicacion.repository.ConversationRepository;
import com.plataforma.comunicacion.repository.MessageRepository;
import com.plataforma.comunicacion.repository.UserBlockRepository;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
@Transactional
public class ConversationService {

    private final AppUserRepository appUserRepository;
    private final ContactRequestRepository contactRequestRepository;
    private final UserBlockRepository userBlockRepository;
    private final ConversationRepository conversationRepository;
    private final ConversationMemberRepository conversationMemberRepository;
    private final MessageRepository messageRepository;

    public ConversationService(
            AppUserRepository appUserRepository,
            ContactRequestRepository contactRequestRepository,
            UserBlockRepository userBlockRepository,
            ConversationRepository conversationRepository,
            ConversationMemberRepository conversationMemberRepository,
            MessageRepository messageRepository) {

        this.appUserRepository = appUserRepository;
        this.contactRequestRepository = contactRequestRepository;
        this.userBlockRepository = userBlockRepository;
        this.conversationRepository = conversationRepository;
        this.conversationMemberRepository = conversationMemberRepository;
        this.messageRepository = messageRepository;
    }

    private AppUser requireActiveUser(Long userId) {
        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "Usuario no encontrado."));

        if (user.isAccountDeleted()) {
            throw new IllegalArgumentException(
                    "La cuenta ya no está activa.");
        }

        return user;
    }

    private void requireNotBlocked(
            Long firstUserId,
            Long secondUserId) {

        boolean blocked =
                userBlockRepository.existsByBlocker_IdAndBlocked_Id(
                        firstUserId, secondUserId)
                || userBlockRepository.existsByBlocker_IdAndBlocked_Id(
                        secondUserId, firstUserId);

        if (blocked) {
            throw new IllegalArgumentException(
                    "No puedes conversar con este usuario porque existe un bloqueo.");
        }
    }

    private void requireAcceptedContact(
            Long firstUserId,
            Long secondUserId) {

        Optional<ContactRequest> outgoing =
                contactRequestRepository.findByRequester_IdAndAddressee_Id(
                        firstUserId, secondUserId);

        Optional<ContactRequest> incoming =
                contactRequestRepository.findByRequester_IdAndAddressee_Id(
                        secondUserId, firstUserId);

        boolean accepted =
                outgoing.map(request ->
                        "ACCEPTED".equals(request.getStatus())
                ).orElse(false)
                || incoming.map(request ->
                        "ACCEPTED".equals(request.getStatus())
                ).orElse(false);

        if (!accepted) {
            throw new IllegalArgumentException(
                    "Solo puedes conversar con contactos aceptados.");
        }
    }

    private void requireMembership(
            Long conversationId,
            Long userId) {

        if (!conversationMemberRepository
                .existsByConversation_IdAndUser_Id(
                        conversationId, userId)) {

            throw new IllegalArgumentException(
                    "No tienes permiso para acceder a esta conversación.");
        }
    }

    /**
     * Conserva el historial de conversaciones con cuentas eliminadas.
     * No permite enviar mensajes nuevos a cuentas eliminadas.
     */
    private void requireConversationAvailable(
            Long conversationId,
            Long currentUserId) {

        requireMembership(conversationId, currentUserId);

        List<ConversationMember> members =
                conversationMemberRepository.findByConversation_Id(
                        conversationId);

        for (ConversationMember member : members) {
            Long otherUserId = member.getUser().getId();

            if (!Objects.equals(otherUserId, currentUserId)) {
                AppUser otherUser = appUserRepository.findById(otherUserId)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "El otro participante no existe."));

                // Se conserva el historial de cuentas eliminadas.
                if (otherUser.isAccountDeleted()) {
                    continue;
                }

                requireNotBlocked(currentUserId, otherUserId);
            }
        }
    }

    /**
     * Valida el acceso sin recuperar mensajes ni modificar estados.
     */
    @Transactional(readOnly = true)
    public void validateConversationAccess(
            Long conversationId,
            Long currentUserId) {

        requireActiveUser(currentUserId);
        requireConversationAvailable(conversationId, currentUserId);
    }

    /**
     * Crea una conversación privada o devuelve la ya existente.
     */
    public Long openConversation(
            Long currentUserId,
            Long otherUserId) {

        if (Objects.equals(currentUserId, otherUserId)) {
            throw new IllegalArgumentException(
                    "No puedes abrir una conversación contigo mismo.");
        }

        AppUser currentUser = requireActiveUser(currentUserId);
        AppUser otherUser = requireActiveUser(otherUserId);

        requireAcceptedContact(currentUserId, otherUserId);
        requireNotBlocked(currentUserId, otherUserId);

        List<ConversationMember> currentMemberships =
                conversationMemberRepository
                        .findByUser_IdOrderByJoinedAtDesc(currentUserId);

        for (ConversationMember membership : currentMemberships) {
            Long conversationId = membership.getConversation().getId();

            List<ConversationMember> members =
                    conversationMemberRepository.findByConversation_Id(
                            conversationId);

            boolean hasOtherUser = members.stream()
                    .anyMatch(member ->
                            Objects.equals(
                                    member.getUser().getId(),
                                    otherUserId));

            if (members.size() == 2 && hasOtherUser) {
                return conversationId;
            }
        }

        Conversation conversation =
                conversationRepository.saveAndFlush(new Conversation());

        ConversationMember firstMember =
                new ConversationMember(conversation, currentUser);

        ConversationMember secondMember =
                new ConversationMember(conversation, otherUser);

        conversationMemberRepository.saveAll(
                List.of(firstMember, secondMember));

        return conversation.getId();
    }

    /**
     * Lista conversaciones, incluyendo las asociadas a cuentas eliminadas.
     */
    @Transactional(readOnly = true)
    public List<ConversationSummary> listConversations(Long userId) {

        requireActiveUser(userId);

        List<ConversationSummary> summaries = new ArrayList<>();

        List<ConversationMember> memberships =
                conversationMemberRepository
                        .findByUser_IdOrderByJoinedAtDesc(userId);

        for (ConversationMember membership : memberships) {
            Long conversationId = membership.getConversation().getId();

            List<ConversationMember> members =
                    conversationMemberRepository.findByConversation_Id(
                            conversationId);

            Optional<ConversationMember> otherMembership =
                    members.stream()
                            .filter(member ->
                                    !Objects.equals(
                                            member.getUser().getId(),
                                            userId))
                            .findFirst();

            if (otherMembership.isEmpty()) {
                continue;
            }

            AppUser otherUser = otherMembership.get().getUser();
            boolean deleted = otherUser.isAccountDeleted();

            // Las conversaciones bloqueadas con cuentas activas se ocultan.
            // El historial de cuentas eliminadas se conserva.
            if (!deleted) {
                boolean blocked =
                        userBlockRepository
                                .existsByBlocker_IdAndBlocked_Id(
                                        userId, otherUser.getId())
                        || userBlockRepository
                                .existsByBlocker_IdAndBlocked_Id(
                                        otherUser.getId(), userId);

                if (blocked) {
                    continue;
                }
            }

            List<Message> latestMessages =
                    messageRepository
                            .findByConversation_IdOrderBySentAtDesc(
                                    conversationId,
                                    PageRequest.of(0, 1));

            String lastMessage = latestMessages.isEmpty()
                    ? "Todavía no hay mensajes."
                    : latestMessages.get(0).getContent();

            Instant lastMessageAt = latestMessages.isEmpty()
                    ? membership.getConversation().getCreatedAt()
                    : latestMessages.get(0).getSentAt();

            long unreadCount =
                    messageRepository
                            .countByConversation_IdAndReadAtIsNullAndSender_IdNot(
                                    conversationId, userId);

            String otherUsername = deleted
                    ? "Cuenta eliminada"
                    : otherUser.getUsername();

            String otherDisplayName = deleted
                    ? "Cuenta eliminada"
                    : (otherUser.getDisplayName() != null
                        && !otherUser.getDisplayName().isBlank()
                            ? otherUser.getDisplayName()
                            : otherUser.getUsername());

            String otherAvatarUrl = deleted
                    ? null
                    : otherUser.getAvatarUrl();

            summaries.add(new ConversationSummary(
                    conversationId,
                    otherUser.getId(),
                    otherUsername,
                    otherDisplayName,
                    lastMessage,
                    lastMessageAt,
                    unreadCount,
                    otherAvatarUrl
            ));
        }

        summaries.sort(
                Comparator.comparing(
                        ConversationSummary::lastMessageAt,
                        Comparator.nullsLast(
                                Comparator.reverseOrder())));

        return summaries;
    }

    /**
     * Recupera los últimos 50 mensajes en orden cronológico.
     * Los mensajes recibidos se marcan como entregados y leídos
     * al recuperar el historial.
     */
    public List<MessageView> getMessages(
            Long conversationId,
            Long currentUserId) {

        requireActiveUser(currentUserId);
        requireConversationAvailable(conversationId, currentUserId);

        List<Message> unreadMessages =
                messageRepository
                        .findByConversation_IdAndReadAtIsNullAndSender_IdNot(
                                conversationId, currentUserId);

        Instant now = Instant.now();

        for (Message message : unreadMessages) {
            if (message.getDeliveredAt() == null) {
                message.setDeliveredAt(now);
            }

            if (message.getReadAt() == null) {
                message.setReadAt(now);
            }
        }

        if (!unreadMessages.isEmpty()) {
            messageRepository.saveAll(unreadMessages);
        }

        List<Message> messages =
                messageRepository
                        .findByConversation_IdOrderBySentAtDesc(
                                conversationId,
                                PageRequest.of(0, 50));

        return messages.stream()
                .map(message -> {
                    AppUser sender = message.getSender();

                    boolean senderDeleted =
                            sender == null || sender.isAccountDeleted();

                    String senderUsername = senderDeleted
                            ? "Cuenta eliminada"
                            : sender.getUsername();

                    String senderDisplayName = senderDeleted
                            ? "Cuenta eliminada"
                            : (sender.getDisplayName() != null
                                && !sender.getDisplayName().isBlank()
                                    ? sender.getDisplayName()
                                    : sender.getUsername());

                    String senderAvatarUrl = senderDeleted
                            ? null
                            : sender.getAvatarUrl();

                    boolean mine = sender != null
                            && Objects.equals(
                                    sender.getId(), currentUserId);

                    return new MessageView(
                            message.getId(),
                            sender == null ? null : sender.getId(),
                            senderUsername,
                            message.getContent(),
                            message.getSentAt(),
                            mine,
                            message.getDeliveredAt(),
                            message.getReadAt(),
                            senderDisplayName,
                            senderAvatarUrl
                    );
                })
                .sorted(Comparator.comparing(
                        MessageView::sentAt,
                        Comparator.nullsLast(
                                Comparator.naturalOrder())))
                .toList();
    }

    /**
     * Guarda el mensaje y devuelve el registro guardado.
     */
    public MessageView sendMessage(
            Long conversationId,
            Long currentUserId,
            String content) {

        AppUser sender = requireActiveUser(currentUserId);

        requireConversationAvailable(conversationId, currentUserId);

        List<ConversationMember> members =
                conversationMemberRepository.findByConversation_Id(
                        conversationId);

        if (members.size() != 2) {
            throw new IllegalArgumentException(
                    "Esta función solo admite conversaciones privadas.");
        }

        AppUser otherUser = members.stream()
                .map(ConversationMember::getUser)
                .filter(user -> !Objects.equals(
                        user.getId(), currentUserId))
                .findFirst()
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "No se encontró al otro participante."));

        if (otherUser.isAccountDeleted()) {
            throw new IllegalArgumentException(
                    "No puedes enviar mensajes a una cuenta eliminada.");
        }

        requireAcceptedContact(currentUserId, otherUser.getId());
        requireNotBlocked(currentUserId, otherUser.getId());

        if (content == null || content.isBlank()) {
            throw new IllegalArgumentException(
                    "El mensaje no puede estar vacío.");
        }

        String normalizedContent = content.strip();

        if (normalizedContent.length() > 5000) {
            throw new IllegalArgumentException(
                    "El mensaje no puede superar los 5000 caracteres.");
        }

        Message message = new Message();
        message.setConversation(members.get(0).getConversation());
        message.setSender(sender);
        message.setContent(normalizedContent);

        Message saved = messageRepository.saveAndFlush(message);

        String senderDisplayName =
                sender.getDisplayName() != null
                        && !sender.getDisplayName().isBlank()
                        ? sender.getDisplayName()
                        : sender.getUsername();

        return new MessageView(
                saved.getId(),
                sender.getId(),
                sender.getUsername(),
                saved.getContent(),
                saved.getSentAt(),
                true,
                saved.getDeliveredAt(),
                saved.getReadAt(),
                senderDisplayName,
                sender.getAvatarUrl()
        );
    }

    /**
     * Registra la entrega de un mensaje al destinatario.
     */
    public MessageStatusView markMessageDelivered(
            Long messageId,
            Long expectedConversationId,
            Long currentUserId) {

        requireActiveUser(currentUserId);

        Message message = messageRepository.findById(messageId)
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "El mensaje no existe."));

        Long conversationId = message.getConversation().getId();

        if (!Objects.equals(conversationId, expectedConversationId)) {
            throw new IllegalArgumentException(
                    "El mensaje no pertenece a esa conversación.");
        }

        requireConversationAvailable(conversationId, currentUserId);

        if (message.getSender() != null
                && Objects.equals(
                        message.getSender().getId(), currentUserId)) {
            throw new IllegalArgumentException(
                    "No puedes confirmar la entrega de tu propio mensaje.");
        }

        if (message.getDeliveredAt() == null) {
            message.setDeliveredAt(Instant.now());
            messageRepository.save(message);
        }

        return new MessageStatusView(
                conversationId,
                message.getId(),
                message.getSender() == null
                        ? null
                        : message.getSender().getId(),
                message.getDeliveredAt(),
                message.getReadAt());
    }

    /**
     * Registra la lectura de un mensaje por parte del destinatario.
     */
    public MessageStatusView markMessageRead(
            Long messageId,
            Long expectedConversationId,
            Long currentUserId) {

        requireActiveUser(currentUserId);

        Message message = messageRepository.findById(messageId)
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "El mensaje no existe."));

        Long conversationId = message.getConversation().getId();

        if (!Objects.equals(conversationId, expectedConversationId)) {
            throw new IllegalArgumentException(
                    "El mensaje no pertenece a esa conversación.");
        }

        requireConversationAvailable(conversationId, currentUserId);

        if (message.getSender() != null
                && Objects.equals(
                        message.getSender().getId(), currentUserId)) {
            throw new IllegalArgumentException(
                    "No puedes marcar tu propio mensaje como leído.");
        }

        Instant now = Instant.now();

        // La lectura implica que el mensaje fue entregado.
        if (message.getDeliveredAt() == null) {
            message.setDeliveredAt(now);
        }

        if (message.getReadAt() == null) {
            message.setReadAt(now);
        }

        messageRepository.save(message);

        return new MessageStatusView(
                conversationId,
                message.getId(),
                message.getSender() == null
                        ? null
                        : message.getSender().getId(),
                message.getDeliveredAt(),
                message.getReadAt());
    }
    
        /**
         * Obtiene el nombre de usuario del otro participante
         * para enviarle notificaciones privadas.
         */
        @Transactional(readOnly = true)
        public String getOtherParticipantUsername(
                Long conversationId,
                Long currentUserId) {

        requireActiveUser(currentUserId);
        requireConversationAvailable(conversationId, currentUserId);

        List<ConversationMember> members =
                conversationMemberRepository.findByConversation_Id(
                        conversationId);

        if (members.size() != 2) {
                throw new IllegalArgumentException(
                        "La conversación no es privada o no tiene dos participantes.");
        }

        AppUser recipient = members.stream()
                .map(ConversationMember::getUser)
                .filter(user -> !Objects.equals(
                        user.getId(), currentUserId))
                .findFirst()
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "No se encontró al destinatario de la notificación."));

        if (recipient.isAccountDeleted()) {
                throw new IllegalArgumentException(
                        "No se puede notificar a una cuenta eliminada.");
        }

        return recipient.getUsername();
        }
}
