import 'package:flutter/foundation.dart';

import '../../core/api/api_service.dart';
import 'chat_memory_service.dart';
import 'chat_message.dart';

class ChatController extends ChangeNotifier {
  ChatController({
    required this.apiService,
    ChatMemoryService? memoryService,
  }) : memoryService = memoryService ?? ChatMemoryService() {
    _messages.add(ChatMessage(
      role: ChatRole.assistant,
      content: '你好，我是 AI 知识库助手。你可以输入问题，也可以通过加号菜单预留图片、文件和语音入口。',
    ));
  }

  static const modelOptions = ApiService.supportedChatModels;

  final ApiService apiService;
  final ChatMemoryService memoryService;
  final List<ChatMessage> _messages = [];
  String? _conversationId;
  String? _failedPrompt;
  String _selectedModel = 'gpt';
  bool _sending = false;
  bool _thinking = false;
  bool _cancelRequested = false;

  List<ChatMessage> get messages => List.unmodifiable(_messages);
  bool get sending => _sending;
  bool get thinking => _thinking;
  bool get canRetry => _failedPrompt != null && !_sending;
  String get selectedModel => _selectedModel;
  String get sessionId => memoryService.sessionId;

  void setModel(String model) {
    if (!modelOptions.contains(model) || model == _selectedModel || _sending) {
      return;
    }

    _selectedModel = model;
    notifyListeners();
  }

  Future<void> send(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || _sending) {
      return;
    }

    await _sendPrompt(trimmed);
  }

  Future<void> retryLastFailed() async {
    final prompt = _failedPrompt;
    if (prompt == null || _sending) {
      return;
    }

    _failedPrompt = null;
    await _sendPrompt(prompt);
  }

  void cancelStreaming() {
    if (!_sending) {
      return;
    }

    _cancelRequested = true;
  }

  Future<void> _sendPrompt(String trimmed) async {
    _sending = true;
    _thinking = true;
    _cancelRequested = false;
    _messages.add(ChatMessage(
      role: ChatRole.user,
      content: trimmed,
      status: ChatMessageStatus.sending,
    ));
    _messages.add(ChatMessage(
      role: ChatRole.assistant,
      content: '',
      status: ChatMessageStatus.sending,
      isStreaming: true,
    ));
    notifyListeners();

    try {
      final result = await apiService.chat(
        text: trimmed,
        conversationId: _conversationId,
        model: _selectedModel,
        contextMessages: memoryService.contextMessages(),
        onToken: _appendToken,
        shouldStop: () => _cancelRequested,
      );
      if (_cancelRequested) {
        _finishStreamingMessage(ChatMessageStatus.success);
        _markLastUserMessage(ChatMessageStatus.success);
        _rememberLastTurn(trimmed);
        return;
      }

      final nextConversationId = result['conversation_id'];
      if (nextConversationId is String && nextConversationId.isNotEmpty) {
        _conversationId = nextConversationId;
      }
      final answer = _answerFrom(result);
      if (_lastStreamingMessageContent().trim().isEmpty && answer.trim().isNotEmpty) {
        _replaceStreamingMessage(answer, status: ChatMessageStatus.success, isStreaming: false);
      } else {
        _finishStreamingMessage(ChatMessageStatus.success);
      }
      _markLastUserMessage(ChatMessageStatus.success);
      _rememberLastTurn(trimmed);
      _failedPrompt = null;
    } catch (error) {
      _failedPrompt = trimmed;
      _markLastUserMessage(ChatMessageStatus.error);
      _replaceStreamingMessage(
        '发送失败：$error',
        status: ChatMessageStatus.error,
        isStreaming: false,
      );
    } finally {
      _sending = false;
      _thinking = false;
      notifyListeners();
    }
  }

  void _rememberLastTurn(String userPrompt) {
    memoryService.remember(ChatMessage(
      role: ChatRole.user,
      content: userPrompt,
      status: ChatMessageStatus.success,
    ));

    final assistantIndex = _messages.lastIndexWhere((message) => message.role == ChatRole.assistant);
    if (assistantIndex == -1) {
      return;
    }

    memoryService.remember(_messages[assistantIndex].copyWith(status: ChatMessageStatus.success));
  }

  void _appendToken(String token) {
    if (_cancelRequested) {
      return;
    }

    _thinking = false;
    final index = _messages.lastIndexWhere((message) => message.isStreaming);
    if (index == -1) {
      _messages.add(ChatMessage(
        role: ChatRole.assistant,
        content: token,
        status: ChatMessageStatus.sending,
        isStreaming: true,
      ));
    } else {
      _messages[index] = _messages[index].copyWith(
        content: '${_messages[index].content}$token',
        status: ChatMessageStatus.sending,
        isStreaming: true,
      );
    }
    notifyListeners();
  }

  void _replaceStreamingMessage(
    String content, {
    required ChatMessageStatus status,
    required bool isStreaming,
  }) {
    final index = _messages.lastIndexWhere((message) => message.isStreaming);
    if (index == -1) {
      _messages.add(ChatMessage(
        role: ChatRole.assistant,
        content: content,
        status: status,
        isStreaming: isStreaming,
      ));
      return;
    }

    _messages[index] = _messages[index].copyWith(
      content: content,
      status: status,
      isStreaming: isStreaming,
    );
  }

  void _finishStreamingMessage(ChatMessageStatus status) {
    final index = _messages.lastIndexWhere((message) => message.isStreaming);
    if (index == -1) {
      return;
    }

    _messages[index] = _messages[index].copyWith(
      status: status,
      isStreaming: false,
    );
  }

  void _markLastUserMessage(ChatMessageStatus status) {
    final index = _messages.lastIndexWhere((message) => message.role == ChatRole.user);
    if (index == -1) {
      return;
    }

    _messages[index] = _messages[index].copyWith(status: status);
  }

  String _lastStreamingMessageContent() {
    final index = _messages.lastIndexWhere((message) => message.isStreaming);
    if (index == -1) {
      return '';
    }

    return _messages[index].content;
  }

  String _answerFrom(Map<String, dynamic> result) {
    for (final key in ['answer', 'finalAnswer', 'content', 'message']) {
      final value = result[key];
      if (value is String && value.trim().isNotEmpty) {
        return value;
      }
    }

    final aiMessage = result['aiMessage'];
    if (aiMessage is Map && aiMessage['content'] is String) {
      return aiMessage['content'] as String;
    }

    return '已收到服务端响应，但当前客户端暂未识别答案字段。';
  }
}
