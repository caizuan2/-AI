import 'package:flutter/foundation.dart';

import '../../core/api/api_service.dart';
import 'chat_memory_service.dart';
import 'chat_message.dart';

class ChatController extends ChangeNotifier {
  ChatController({
    required this.apiService,
    ChatMemoryService? memoryService,
  }) : _memoryService = memoryService ?? ChatMemoryService() {
    _activeConversation = _ChatConversationState(
      id: _memoryService.sessionId,
      memoryService: _memoryService,
      messages: [_welcomeMessage()],
    );
    _conversations.add(_activeConversation);
  }

  static const modelOptions = ApiService.supportedChatModels;

  final ApiService apiService;
  ChatMemoryService _memoryService;
  late _ChatConversationState _activeConversation;
  final List<_ChatConversationState> _conversations = [];
  String? _failedPrompt;
  List<ChatAttachment> _failedAttachments = const [];
  String _selectedModel = 'gpt';
  bool _sending = false;
  bool _thinking = false;
  bool _cancelRequested = false;
  bool _syncing = false;
  bool _loadingConversationFeatures = false;
  String? _lastSyncError;
  ConversationFeatureFlags _conversationFeatures =
      const ConversationFeatureFlags.disabled();
  String _lastConversationFeatureSource = '';
  int? _lastConversationFeatureStatusCode;
  String? _lastConversationFeatureError;
  Map<String, bool> _lastConversationFeatureParsedValues =
      ConversationFeatureFlags.disabledValues;

  List<ChatMessage> get _messages => _activeConversation.messages;
  List<ChatMessage> get messages =>
      List.unmodifiable(_activeConversation.messages);
  bool get sending => _sending;
  bool get thinking => _thinking;
  bool get syncing => _syncing;
  bool get loadingConversationFeatures => _loadingConversationFeatures;
  String? get lastSyncError => _lastSyncError;
  ConversationFeatureFlags get conversationFeatures => _conversationFeatures;
  String get lastConversationFeatureSource => _lastConversationFeatureSource;
  int? get lastConversationFeatureStatusCode =>
      _lastConversationFeatureStatusCode;
  String? get lastConversationFeatureError => _lastConversationFeatureError;
  Map<String, bool> get lastConversationFeatureParsedValues =>
      Map.unmodifiable(_lastConversationFeatureParsedValues);
  bool get canRetry => _failedPrompt != null && !_sending;
  String get selectedModel => _selectedModel;
  String get sessionId => _activeConversation.id;
  ChatMemoryService get memoryService => _memoryService;
  List<ChatConversationSummary> get loadedConversations {
    final summaries = [
      for (final conversation in _conversations.reversed)
        if (conversation.hasVisibleContent && !conversation.archived)
          ChatConversationSummary(
            id: conversation.id,
            title: conversation.title,
            subtitle: conversation.subtitle,
            updatedAt: conversation.updatedAt,
            selected: identical(conversation, _activeConversation),
            cloudSynced: conversation.remoteConversationId != null,
            pinned: conversation.pinned,
          ),
    ];
    summaries.sort((left, right) {
      if (left.pinned != right.pinned) {
        return left.pinned ? -1 : 1;
      }
      return right.updatedAt.compareTo(left.updatedAt);
    });
    return summaries;
  }

  bool setConversationPinned(String id, bool pinned) {
    final conversation = _findConversation(id);
    if (conversation == null || conversation.pinned == pinned) {
      return conversation != null;
    }
    conversation.pinned = pinned;
    notifyListeners();
    return true;
  }

  Future<Map<String, dynamic>> shareConversation(String id) async {
    final conversation = _requireConversation(id);
    return apiService.shareConversation(_conversationActionId(conversation));
  }

  Future<Map<String, dynamic>> startConversationGroupChat(String id) async {
    final conversation = _requireConversation(id);
    return apiService.startConversationGroupChat(
      _conversationActionId(conversation),
    );
  }

  Future<String> renameConversation(String id, String title) async {
    final conversation = _requireConversation(id);
    final trimmedTitle = title.trim();
    if (trimmedTitle.isEmpty) {
      throw const ApiException('标题不能为空');
    }

    final data = await apiService.renameConversation(
      conversationId: _conversationActionId(conversation),
      title: trimmedTitle,
    );
    final nestedConversation = _mapValue(data['conversation']);
    final nextTitle = _firstString(data, const ['title', 'name']) ??
        _firstString(nestedConversation, const ['title', 'name']) ??
        trimmedTitle;
    conversation.cloudTitle = nextTitle;
    conversation.cloudUpdatedAt = DateTime.now();
    notifyListeners();
    return nextTitle;
  }

  Future<void> archiveConversation(String id) async {
    final conversation = _requireConversation(id);
    await apiService.archiveConversation(_conversationActionId(conversation));
    conversation.archived = true;
    conversation.cloudUpdatedAt = DateTime.now();
    notifyListeners();
  }

  Future<void> deleteConversation(String id) async {
    final conversation = _requireConversation(id);
    await apiService.deleteConversation(_conversationActionId(conversation));
    final wasActive = identical(conversation, _activeConversation);
    _conversations.remove(conversation);
    if (wasActive) {
      _memoryService = ChatMemoryService();
      _activeConversation = _ChatConversationState(
        id: _memoryService.sessionId,
        memoryService: _memoryService,
        messages: [_welcomeMessage()],
      );
      _conversations.add(_activeConversation);
    }
    notifyListeners();
  }

  void setModel(String model) {
    if (!modelOptions.contains(model) || model == _selectedModel || _sending) {
      return;
    }

    _selectedModel = model;
    notifyListeners();
  }

  void startNewConversation() {
    if (_sending) {
      return;
    }

    _failedPrompt = null;
    _failedAttachments = const [];
    _thinking = false;
    _cancelRequested = false;
    _memoryService = ChatMemoryService();
    _activeConversation = _ChatConversationState(
      id: _memoryService.sessionId,
      memoryService: _memoryService,
      messages: [_welcomeMessage()],
    );
    _conversations.add(_activeConversation);
    notifyListeners();
  }

  Future<void> loadCloudConversations() async {
    if (_syncing || apiService.mockMode) {
      return;
    }

    _syncing = true;
    _lastSyncError = null;
    notifyListeners();

    try {
      final items = await apiService.getConversations();
      for (final item in items) {
        _upsertCloudConversation(item);
      }
    } catch (error) {
      _lastSyncError = '云端会话同步失败：$error';
      debugPrint(_lastSyncError);
    } finally {
      _syncing = false;
      notifyListeners();
    }
  }

  Future<void> loadConversationFeatures({bool force = false}) async {
    if (_loadingConversationFeatures ||
        (!force && _conversationFeatures.loaded)) {
      return;
    }

    _loadingConversationFeatures = true;
    notifyListeners();

    try {
      _conversationFeatures = await apiService.getConversationFeatureFlags();
      _rememberConversationFeatureDebug(_conversationFeatures);
    } catch (error) {
      _conversationFeatures = ConversationFeatureFlags.disabled(
        error: error.toString(),
      );
      _rememberConversationFeatureDebug(_conversationFeatures);
      debugPrint('Conversation feature flags failed: $error');
    } finally {
      _loadingConversationFeatures = false;
      debugPrint(
        '[conversation-features] controller updated; menu should refresh',
      );
      notifyListeners();
    }
  }

  void _rememberConversationFeatureDebug(ConversationFeatureFlags flags) {
    _lastConversationFeatureSource = flags.source;
    _lastConversationFeatureStatusCode = flags.statusCode;
    _lastConversationFeatureError = flags.error;
    _lastConversationFeatureParsedValues = Map.unmodifiable(flags.values);
  }

  Future<void> openConversation(String id) async {
    if (_sending || id == _activeConversation.id) {
      return;
    }

    final conversation = _findConversation(id);
    if (conversation == null) {
      return;
    }

    if (conversation.remoteConversationId != null) {
      final remoteId = conversation.remoteConversationId!;
      debugPrint('Selected cloud conversationId: $remoteId');
      await loadCloudConversationHistory(remoteId);
      return;
    }

    _activeConversation = conversation;
    _memoryService = conversation.memoryService;
    _failedPrompt = null;
    _failedAttachments = const [];
    _thinking = false;
    _cancelRequested = false;
    notifyListeners();
  }

  _ChatConversationState? _findConversation(String id) {
    return _conversations
        .where((item) => item.id == id || item.remoteConversationId == id)
        .cast<_ChatConversationState?>()
        .firstWhere((item) => item != null, orElse: () => null);
  }

  _ChatConversationState _requireConversation(String id) {
    final conversation = _findConversation(id);
    if (conversation == null) {
      throw const ApiException('会话不存在');
    }
    return conversation;
  }

  String _conversationActionId(_ChatConversationState conversation) {
    final id = conversation.remoteConversationId ?? conversation.id;
    final trimmed = id.trim();
    if (trimmed.isEmpty) {
      throw const ApiException('会话不存在');
    }
    return trimmed;
  }

  Future<void> loadCloudConversationHistory(String conversationId) async {
    if (_sending || apiService.mockMode) {
      return;
    }

    final remoteId = conversationId.trim();
    if (remoteId.isEmpty) {
      return;
    }

    final conversation = _conversations
        .where((item) =>
            item.remoteConversationId == remoteId || item.id == remoteId)
        .cast<_ChatConversationState?>()
        .firstWhere((item) => item != null, orElse: () => null);
    if (conversation == null) {
      _lastSyncError = '云端历史消息加载失败：会话不存在';
      debugPrint(_lastSyncError);
      notifyListeners();
      return;
    }

    final previousMessages = List<ChatMessage>.of(conversation.messages);
    _activeConversation = conversation;
    _memoryService = conversation.memoryService;
    _failedPrompt = null;
    _failedAttachments = const [];
    _thinking = false;
    _cancelRequested = false;
    _syncing = true;
    _lastSyncError = null;
    conversation.messages
      ..clear()
      ..add(ChatMessage(
        role: ChatRole.assistant,
        content: '正在加载云端历史消息...',
        status: ChatMessageStatus.sending,
      ));
    notifyListeners();

    try {
      final data = await apiService.getConversationHistory(remoteId);
      _applyCloudHistoryData(conversation, data);
    } catch (error) {
      _lastSyncError = '云端历史消息加载失败：$error';
      debugPrint(_lastSyncError);
      conversation.messages
        ..clear()
        ..addAll(previousMessages);
      if (conversation.messages.length == 1 &&
          conversation.messages.first.content == _welcomeMessage().content) {
        conversation.messages
          ..clear()
          ..add(ChatMessage(
            role: ChatRole.assistant,
            content: _lastSyncError!,
            status: ChatMessageStatus.error,
          ));
      }
    } finally {
      _syncing = false;
      notifyListeners();
    }
  }

  void addUploadedAttachment({
    required ChatAttachment attachment,
    required String message,
  }) {
    if (_sending) {
      return;
    }

    _messages.add(ChatMessage(
      role: ChatRole.user,
      content: message,
      status: ChatMessageStatus.success,
      attachments: [attachment],
    ));
    notifyListeners();
  }

  Future<void> send(
    String text, {
    List<ChatAttachment> attachments = const [],
  }) async {
    final trimmed = text.trim();
    if ((trimmed.isEmpty && attachments.isEmpty) || _sending) {
      return;
    }

    await _sendPrompt(trimmed, attachments: attachments);
  }

  Future<void> retryLastFailed() async {
    final prompt = _failedPrompt;
    if (prompt == null || _sending) {
      return;
    }

    final attachments = _failedAttachments;
    _failedPrompt = null;
    _failedAttachments = const [];
    await _sendPrompt(prompt, attachments: attachments);
  }

  void cancelStreaming() {
    if (!_sending) {
      return;
    }

    _cancelRequested = true;
  }

  Future<void> _sendPrompt(
    String trimmed, {
    List<ChatAttachment> attachments = const [],
  }) async {
    _sending = true;
    _thinking = true;
    _cancelRequested = false;
    final promptForApi =
        trimmed.isEmpty ? _attachmentOnlyMessage(attachments) : trimmed;
    _messages.add(ChatMessage(
      role: ChatRole.user,
      content: promptForApi,
      status: ChatMessageStatus.sending,
      attachments: attachments,
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
        text: promptForApi,
        conversationId: _activeConversation.remoteConversationId,
        model: _selectedModel,
        contextMessages: _memoryService.contextMessages(),
        attachments: attachments.map(_attachmentPayload).toList(),
        localClientId: _activeConversation.id,
        metadata: {
          'client': 'flutter',
          'session_id': _activeConversation.id,
        },
        onToken: _appendToken,
        shouldStop: () => _cancelRequested,
      );
      if (_cancelRequested) {
        _finishStreamingMessage(ChatMessageStatus.success);
        _markLastUserMessage(ChatMessageStatus.success);
        _rememberLastTurn(promptForApi);
        return;
      }

      final nextConversationId = result['conversation_id'];
      if (nextConversationId is String && nextConversationId.isNotEmpty) {
        _activeConversation.remoteConversationId = nextConversationId;
        _activeConversation.cloudTitle ??=
            _ChatConversationState._clip(promptForApi, 28);
        _activeConversation.cloudSubtitle =
            _ChatConversationState._clip(promptForApi, 34);
        _activeConversation.cloudUpdatedAt = DateTime.now();
      }
      final answer = _answerFrom(result);
      if (_lastStreamingMessageContent().trim().isEmpty &&
          answer.trim().isNotEmpty) {
        _replaceStreamingMessage(answer,
            status: ChatMessageStatus.success, isStreaming: false);
      } else {
        _finishStreamingMessage(ChatMessageStatus.success);
      }
      _markLastUserMessage(ChatMessageStatus.success);
      _rememberLastTurn(promptForApi);
      _failedPrompt = null;
      _failedAttachments = const [];
      final cloudConversationId = _stringValue(nextConversationId);
      if (cloudConversationId.isNotEmpty) {
        await _refreshCloudHistoryAfterSend(
          cloudConversationId,
          fallbackMessages: List<ChatMessage>.of(_messages),
        );
      }
    } catch (error) {
      _failedPrompt = trimmed;
      _failedAttachments = List.unmodifiable(attachments);
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

  Future<void> _refreshCloudHistoryAfterSend(
    String conversationId, {
    required List<ChatMessage> fallbackMessages,
  }) async {
    try {
      final data = await apiService.getConversationHistory(conversationId);
      _applyCloudHistoryData(
        _activeConversation,
        data,
        fallbackMessages: fallbackMessages,
      );
      _lastSyncError = null;
    } catch (error) {
      _lastSyncError = '云端同步失败：$error';
      debugPrint(_lastSyncError);
      _activeConversation.messages
        ..clear()
        ..addAll(fallbackMessages);
    }
  }

  Map<String, dynamic> _attachmentPayload(ChatAttachment attachment) {
    return {
      'name': attachment.name,
      'filename': attachment.name,
      'type': attachment.isImage ? 'image' : 'file',
      if (attachment.size != null) 'size': attachment.size,
      if ((attachment.mimeType ?? '').isNotEmpty)
        'mimeType': attachment.mimeType,
      if ((attachment.mimeType ?? '').isNotEmpty)
        'mime_type': attachment.mimeType,
      if ((attachment.url ?? '').isNotEmpty) ...{
        'url': attachment.url,
        'publicUrl': attachment.url,
        'fileUrl': attachment.url,
        'downloadUrl': attachment.url,
      },
      'status': attachment.status,
    };
  }

  void _upsertCloudConversation(Map<String, dynamic> item) {
    final remoteId = _stringValue(item['id']);
    if (remoteId.isEmpty) {
      return;
    }

    final existingIndex = _conversations.indexWhere(
      (conversation) =>
          conversation.remoteConversationId == remoteId ||
          conversation.id == remoteId,
    );
    final title = _stringValue(item['title']);
    final updatedAt = _dateValue(item['updated_at']) ??
        _dateValue(item['updatedAt']) ??
        DateTime.now();
    final messageCount = _intValue(item['message_count']) ?? 0;
    final subtitle = messageCount > 0 ? '$messageCount 条消息' : '云端会话';

    if (existingIndex >= 0) {
      final existing = _conversations[existingIndex];
      existing.remoteConversationId = remoteId;
      existing.cloudTitle = title.isEmpty ? existing.cloudTitle : title;
      existing.cloudSubtitle = subtitle;
      existing.cloudUpdatedAt = updatedAt;
      return;
    }

    _conversations.add(_ChatConversationState(
      id: remoteId,
      remoteConversationId: remoteId,
      cloudTitle: title.isEmpty ? '云端会话' : title,
      cloudSubtitle: subtitle,
      cloudUpdatedAt: updatedAt,
      memoryService: ChatMemoryService(sessionId: remoteId),
      messages: [_welcomeMessage()],
    ));
  }

  void _applyCloudHistoryData(
    _ChatConversationState conversation,
    Map<String, dynamic> data, {
    List<ChatMessage>? fallbackMessages,
  }) {
    final conversationData = _mapValue(data['conversation']);
    final title = _stringValue(conversationData['title']);
    final updatedAt = _dateValue(conversationData['updated_at']) ??
        _dateValue(conversationData['updatedAt']);
    if (title.isNotEmpty) {
      conversation.cloudTitle = title;
    }
    if (updatedAt != null) {
      conversation.cloudUpdatedAt = updatedAt;
    }

    final cloudMessages = _listValue(data['messages'])
        .map(_messageFromCloud)
        .whereType<ChatMessage>()
        .toList(growable: false);
    final nextMessages = cloudMessages.isNotEmpty
        ? cloudMessages
        : (fallbackMessages != null && fallbackMessages.isNotEmpty)
            ? fallbackMessages
            : [
                ChatMessage(
                  role: ChatRole.assistant,
                  content: '该会话暂无消息',
                )
              ];

    conversation.messages
      ..clear()
      ..addAll(nextMessages);
    _rebuildMemoryFor(conversation);
  }

  void _rebuildMemoryFor(_ChatConversationState conversation) {
    final memoryService = ChatMemoryService(sessionId: conversation.id);
    for (final message in conversation.messages) {
      if (message.status == ChatMessageStatus.success &&
          message.content.trim().isNotEmpty &&
          message.content != '该会话暂无消息') {
        memoryService.remember(message);
      }
    }
    conversation.memoryService = memoryService;
    if (identical(conversation, _activeConversation)) {
      _memoryService = memoryService;
    }
  }

  ChatMessage? _messageFromCloud(Object? value) {
    final data = _mapValue(value);
    if (data.isEmpty) {
      return null;
    }

    final roleText = _stringValue(data['role']).toLowerCase();
    final role = roleText == 'assistant' ? ChatRole.assistant : ChatRole.user;
    final rawContent = _firstString(data, const [
          'content',
          'text',
          'message',
        ]) ??
        '';
    final content = role == ChatRole.assistant
        ? _formatAssistantAnswer(rawContent)
        : rawContent;
    final createdAt =
        _dateValue(data['created_at']) ?? _dateValue(data['createdAt']);
    final attachments = _listValue(data['attachments'])
        .map(_attachmentFromCloud)
        .whereType<ChatAttachment>()
        .toList(growable: false);

    return ChatMessage(
      role: role,
      content: content,
      status: ChatMessageStatus.success,
      createdAt: createdAt,
      attachments: attachments,
    );
  }

  ChatAttachment? _attachmentFromCloud(Object? value) {
    final data = _mapValue(value);
    if (data.isEmpty) {
      return null;
    }

    final name = _firstString(data, const ['name', 'filename']) ?? '附件';
    final mimeType = _firstString(data, const ['mimeType', 'mime_type']);
    final url = _firstString(data, const [
      'url',
      'publicUrl',
      'public_url',
      'fileUrl',
      'file_url',
      'downloadUrl',
      'download_url',
      'src',
    ]);
    final rawType = _stringValue(data['type']).toLowerCase();
    final type = rawType.contains('image') ||
            (mimeType ?? '').toLowerCase().startsWith('image/') ||
            _looksLikeImageName(name)
        ? ChatAttachmentType.image
        : ChatAttachmentType.file;

    return ChatAttachment(
      type: type,
      name: name,
      status: '已同步',
      mimeType: mimeType,
      size: _intValue(data['size']),
      url: url,
    );
  }

  static Map<String, dynamic> _mapValue(Object? value) {
    if (value is Map<String, dynamic>) {
      return value;
    }
    if (value is Map) {
      return value.map((key, item) => MapEntry('$key', item));
    }
    return <String, dynamic>{};
  }

  static List<dynamic> _listValue(Object? value) {
    if (value is List) {
      return value;
    }
    return const [];
  }

  static String _stringValue(Object? value) {
    return value is String ? value.trim() : '';
  }

  static String? _firstString(Map<String, dynamic> data, List<String> keys) {
    for (final key in keys) {
      final value = _stringValue(data[key]);
      if (value.isNotEmpty) {
        return value;
      }
    }
    return null;
  }

  static int? _intValue(Object? value) {
    if (value is int) {
      return value;
    }
    if (value is num) {
      return value.toInt();
    }
    if (value is String) {
      return int.tryParse(value);
    }
    return null;
  }

  static DateTime? _dateValue(Object? value) {
    if (value is DateTime) {
      return value;
    }
    if (value is String && value.trim().isNotEmpty) {
      return DateTime.tryParse(value);
    }
    return null;
  }

  static bool _looksLikeImageName(String name) {
    final lower = name.toLowerCase();
    return lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.gif') ||
        lower.endsWith('.webp');
  }

  String _attachmentOnlyMessage(List<ChatAttachment> attachments) {
    if (attachments.isEmpty) {
      return '';
    }
    final names = attachments.map((item) => item.name).join('、');
    return '已上传附件：$names';
  }

  void _rememberLastTurn(String userPrompt) {
    _memoryService.remember(ChatMessage(
      role: ChatRole.user,
      content: userPrompt,
      status: ChatMessageStatus.success,
    ));

    final assistantIndex = _messages
        .lastIndexWhere((message) => message.role == ChatRole.assistant);
    if (assistantIndex == -1) {
      return;
    }

    _memoryService.remember(
        _messages[assistantIndex].copyWith(status: ChatMessageStatus.success));
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
    final index =
        _messages.lastIndexWhere((message) => message.role == ChatRole.user);
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
        return _formatAssistantAnswer(value);
      }
    }

    final aiMessage = result['aiMessage'];
    if (aiMessage is Map && aiMessage['content'] is String) {
      return _formatAssistantAnswer(aiMessage['content'] as String);
    }

    return _formatAssistantAnswer('知识库中暂无明确资料。');
  }

  String _formatAssistantAnswer(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      return _gptStyleAssistantAnswer('知识库中暂无明确资料。');
    }

    if (_looksLikeMockDebugAnswer(trimmed)) {
      return _gptStyleAssistantAnswer('当前知识库中暂无明确资料。');
    }

    if (trimmed.startsWith('#') ||
        trimmed.contains('## 回答摘要') ||
        trimmed.contains('### 建议步骤') ||
        trimmed.contains('```') ||
        trimmed.contains('|')) {
      return value;
    }

    final normalized = trimmed.replaceAll(RegExp(r'\s+'), '');
    final lacksKnowledge = normalized.contains('知识库中暂无明确资料') ||
        normalized.contains('暂无明确资料') ||
        normalized.contains('没有找到相关资料') ||
        normalized.contains('未找到相关资料');

    return _gptStyleAssistantAnswer(trimmed, lacksKnowledge: lacksKnowledge);
  }

  bool _looksLikeMockDebugAnswer(String value) {
    return value.contains('切换真实接口') ||
        value.contains('本地模拟的 GPT 级回复') ||
        value.contains('用于验证 Flutter 原生聊天 UI') ||
        value.contains('当前模型结构：') ||
        value.contains('--dart-define=USE_MOCK_API=false');
  }

  String _gptStyleAssistantAnswer(String summary,
      {bool lacksKnowledge = true}) {
    final safeSummary = summary.trim().isEmpty ? '知识库中暂无明确资料。' : summary.trim();
    final steps = lacksKnowledge
        ? const [
            '可以继续补充与问题相关的资料到知识库。',
            '可以换一种更具体的提问方式再次检索。',
            '如果这是业务必需资料，可以联系管理员补充知识来源。',
          ]
        : const [
            '可以继续补充背景信息，让回答更贴近你的场景。',
            '可以围绕当前结论继续追问细节或执行步骤。',
            '如需沉淀为知识，可将关键资料补充到知识库后再次检索。',
          ];

    return '''
## 回答摘要

$safeSummary

### 建议步骤

1. ${steps[0]}
2. ${steps[1]}
3. ${steps[2]}
''';
  }

  static ChatMessage _welcomeMessage() {
    return ChatMessage(
      role: ChatRole.assistant,
      content: '你好，我是 AI 知识库助手。你可以输入问题，也可以通过加号菜单上传图片、文件或拍照。',
    );
  }
}

class ChatConversationSummary {
  const ChatConversationSummary({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.updatedAt,
    required this.selected,
    this.cloudSynced = false,
    this.pinned = false,
  });

  final String id;
  final String title;
  final String subtitle;
  final DateTime updatedAt;
  final bool selected;
  final bool cloudSynced;
  final bool pinned;
}

class _ChatConversationState {
  _ChatConversationState({
    required this.id,
    required this.memoryService,
    required List<ChatMessage> messages,
    this.remoteConversationId,
    this.cloudTitle,
    this.cloudSubtitle,
    this.cloudUpdatedAt,
  }) : messages = List<ChatMessage>.of(messages);

  final String id;
  ChatMemoryService memoryService;
  final List<ChatMessage> messages;
  String? remoteConversationId;
  String? cloudTitle;
  String? cloudSubtitle;
  DateTime? cloudUpdatedAt;
  bool pinned = false;
  bool archived = false;

  bool get hasVisibleContent {
    if (remoteConversationId != null) {
      return true;
    }
    return messages.any((message) {
      if (message.role != ChatRole.user) {
        return false;
      }
      return message.content.trim().isNotEmpty ||
          message.attachments.isNotEmpty;
    });
  }

  String get title {
    if (cloudTitle != null && cloudTitle!.trim().isNotEmpty) {
      return _clip(cloudTitle!.trim(), 28);
    }
    final message = messages.firstWhere(
      (item) =>
          item.role == ChatRole.user &&
          (item.content.trim().isNotEmpty || item.attachments.isNotEmpty),
      orElse: () => messages.first,
    );
    final rawTitle = message.content.trim().isNotEmpty
        ? message.content.trim()
        : message.attachments.firstOrNull?.name ?? '新会话';
    return _clip(rawTitle, 28);
  }

  String get subtitle {
    if (cloudSubtitle != null && cloudSubtitle!.trim().isNotEmpty) {
      return _clip(cloudSubtitle!.trim(), 34);
    }
    final message = messages.lastWhere(
      (item) => item.content.trim().isNotEmpty || item.attachments.isNotEmpty,
      orElse: () => messages.last,
    );
    final rawSubtitle = message.content.trim().isNotEmpty
        ? message.content.trim()
        : message.attachments.firstOrNull?.name ?? '暂无内容';
    return _clip(rawSubtitle, 34);
  }

  DateTime get updatedAt {
    if (cloudUpdatedAt != null) {
      return cloudUpdatedAt!;
    }
    final message = messages.lastWhere(
      (item) => item.content.trim().isNotEmpty || item.attachments.isNotEmpty,
      orElse: () => messages.last,
    );
    return message.createdAt;
  }

  static String _clip(String value, int maxLength) {
    if (value.length <= maxLength) {
      return value;
    }
    return '${value.substring(0, maxLength)}...';
  }
}

extension _FirstOrNull<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
