import 'chat_message.dart';

class ChatMemoryService {
  ChatMemoryService({
    this.maxTurns = 12,
    String? sessionId,
  }) : sessionId = sessionId ?? 'session-${DateTime.now().millisecondsSinceEpoch}';

  final int maxTurns;
  final String sessionId;
  final List<ChatMemoryTurn> _turns = [];

  List<ChatMemoryTurn> get turns => List.unmodifiable(_turns);

  void remember(ChatMessage message) {
    if (message.content.trim().isEmpty || message.status != ChatMessageStatus.success) {
      return;
    }

    _turns.add(ChatMemoryTurn(
      role: message.role == ChatRole.user ? 'user' : 'assistant',
      content: message.content.trim(),
    ));

    while (_turns.length > maxTurns) {
      _turns.removeAt(0);
    }
  }

  List<Map<String, String>> contextMessages() {
    return [
      for (final turn in _turns)
        {
          'role': turn.role,
          'content': turn.content,
        },
    ];
  }

  String compactContext() {
    if (_turns.isEmpty) {
      return '暂无历史上下文。';
    }

    return _turns.map((turn) => '${turn.role}: ${turn.content}').join('\n');
  }

  void clear() {
    _turns.clear();
  }
}

class ChatMemoryTurn {
  const ChatMemoryTurn({
    required this.role,
    required this.content,
  });

  final String role;
  final String content;
}
