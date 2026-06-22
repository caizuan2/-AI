import 'dart:typed_data';

enum ChatRole {
  user,
  assistant,
}

enum ChatMessageStatus {
  sending,
  success,
  error,
}

enum ChatAttachmentType {
  image,
  file,
}

class ChatAttachment {
  const ChatAttachment({
    required this.type,
    required this.name,
    required this.status,
    this.mimeType,
    this.size,
    this.bytes,
    this.url,
  });

  final ChatAttachmentType type;
  final String name;
  final String status;
  final String? mimeType;
  final int? size;
  final Uint8List? bytes;
  final String? url;

  bool get isImage => type == ChatAttachmentType.image;
}

class ChatMessage {
  ChatMessage({
    required this.role,
    required this.content,
    this.status = ChatMessageStatus.success,
    DateTime? createdAt,
    this.isStreaming = false,
    List<ChatAttachment> attachments = const [],
  })  : createdAt = createdAt ?? DateTime.now(),
        attachments = List.unmodifiable(attachments);

  final ChatRole role;
  final String content;
  final ChatMessageStatus status;
  final DateTime createdAt;
  final bool isStreaming;
  final List<ChatAttachment> attachments;

  ChatMessage copyWith({
    String? content,
    ChatMessageStatus? status,
    bool? isStreaming,
    List<ChatAttachment>? attachments,
  }) {
    return ChatMessage(
      role: role,
      content: content ?? this.content,
      status: status ?? this.status,
      createdAt: createdAt,
      isStreaming: isStreaming ?? this.isStreaming,
      attachments: attachments ?? this.attachments,
    );
  }
}
