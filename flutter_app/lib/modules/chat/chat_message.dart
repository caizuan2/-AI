enum ChatRole {
  user,
  assistant,
}

enum ChatMessageStatus {
  sending,
  success,
  error,
}

class ChatMessage {
  ChatMessage({
    required this.role,
    required this.content,
    this.status = ChatMessageStatus.success,
    DateTime? createdAt,
    this.isStreaming = false,
  }) : createdAt = createdAt ?? DateTime.now();

  final ChatRole role;
  final String content;
  final ChatMessageStatus status;
  final DateTime createdAt;
  final bool isStreaming;

  ChatMessage copyWith({
    String? content,
    ChatMessageStatus? status,
    bool? isStreaming,
  }) {
    return ChatMessage(
      role: role,
      content: content ?? this.content,
      status: status ?? this.status,
      createdAt: createdAt,
      isStreaming: isStreaming ?? this.isStreaming,
    );
  }
}
