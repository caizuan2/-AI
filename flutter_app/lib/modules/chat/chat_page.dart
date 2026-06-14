import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api/api_service.dart';
import '../settings/settings_page.dart';
import '../update/update_page.dart';
import 'chat_controller.dart';
import 'chat_markdown_view.dart';
import 'chat_message.dart';
import 'thinking_indicator.dart';

class ChatPage extends StatefulWidget {
  const ChatPage({
    required this.apiService,
    super.key,
  });

  static const routeName = '/chat';

  final ApiService apiService;

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  late final ChatController _controller;

  @override
  void initState() {
    super.initState();
    _controller = ChatController(apiService: widget.apiService);
    _controller.addListener(_scrollToBottom);
  }

  @override
  void dispose() {
    _controller.dispose();
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _inputController.text.trim();
    if (text.isEmpty || _controller.sending) {
      return;
    }

    _inputController.clear();
    await _controller.send(text);
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) {
        return;
      }

      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  void _showAttachmentMenu() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _AttachmentAction(
                  icon: Icons.image_outlined,
                  label: '图片上传',
                  onTap: () => Navigator.pop(context),
                ),
                _AttachmentAction(
                  icon: Icons.attach_file,
                  label: '文件上传',
                  onTap: () => Navigator.pop(context),
                ),
                _AttachmentAction(
                  icon: Icons.mic_none,
                  label: '语音输入',
                  onTap: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('AI 知识库助手'),
                Text(
                  '${_modelLabel(_controller.selectedModel)} · ${_controller.sessionId}',
                  style: const TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            );
          },
        ),
        actions: [
          PopupMenuButton<String>(
            tooltip: '选择模型',
            initialValue: _controller.selectedModel,
            onSelected: (value) {
              _controller.setModel(value);
              setState(() {});
            },
            itemBuilder: (context) {
              return [
                for (final model in ChatController.modelOptions)
                  PopupMenuItem<String>(
                    value: model,
                    child: Text(_modelLabel(model)),
                  ),
              ];
            },
            icon: const Icon(Icons.tune),
          ),
          IconButton(
            tooltip: '更新',
            onPressed: () => Navigator.of(context).pushNamed(UpdatePage.routeName),
            icon: const Icon(Icons.system_update_alt),
          ),
          IconButton(
            tooltip: '设置',
            onPressed: () => Navigator.of(context).pushNamed(SettingsPage.routeName),
            icon: const Icon(Icons.settings_outlined),
          ),
        ],
      ),
      body: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final messages = _controller.messages;
          return Column(
            children: [
              Expanded(
                child: ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
                  itemCount: messages.length,
                  itemBuilder: (context, index) {
                    return TweenAnimationBuilder<double>(
                      key: ValueKey('${messages[index].createdAt.microsecondsSinceEpoch}-$index'),
                      tween: Tween(begin: 0, end: 1),
                      duration: const Duration(milliseconds: 260),
                      curve: Curves.easeOutCubic,
                      builder: (context, value, child) {
                        return Opacity(
                          opacity: value,
                          child: Transform.translate(
                            offset: Offset(0, 14 * (1 - value)),
                            child: child,
                          ),
                        );
                      },
                      child: _MessageBubble(
                        message: messages[index],
                        onCancel: _controller.sending ? _controller.cancelStreaming : null,
                        onRetry: _controller.canRetry ? _controller.retryLastFailed : null,
                      ),
                    );
                  },
                ),
              ),
              SafeArea(
                top: false,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: const Border(top: BorderSide(color: Color(0xFFE2E8F0))),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.04),
                        blurRadius: 18,
                        offset: const Offset(0, -6),
                      ),
                    ],
                  ),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(6, 4, 8, 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          IconButton(
                            tooltip: '添加',
                            onPressed: _showAttachmentMenu,
                            icon: const Icon(Icons.add_circle_outline),
                            color: const Color(0xFF64748B),
                          ),
                          Expanded(
                            child: TextField(
                              controller: _inputController,
                              minLines: 1,
                              maxLines: 6,
                              textInputAction: TextInputAction.newline,
                              decoration: const InputDecoration(
                                hintText: '发送消息给 AI 知识库...',
                                border: InputBorder.none,
                                isDense: true,
                                contentPadding: EdgeInsets.symmetric(vertical: 14),
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          SizedBox(
                            width: 42,
                            height: 42,
                            child: FilledButton(
                              onPressed: _controller.sending ? null : _send,
                              style: FilledButton.styleFrom(
                                padding: EdgeInsets.zero,
                                shape: const CircleBorder(),
                                backgroundColor: const Color(0xFF0F172A),
                              ),
                              child: _controller.sending
                                  ? const SizedBox(
                                      width: 17,
                                      height: 17,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : const Icon(Icons.arrow_upward),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  String _modelLabel(String model) {
    return switch (model) {
      'deepseek' => 'DeepSeek',
      'qwen' => 'Qwen',
      _ => 'GPT',
    };
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    this.onRetry,
    this.onCancel,
  });

  final ChatMessage message;
  final VoidCallback? onRetry;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == ChatRole.user;
    final bubbleColor = isUser ? const Color(0xFF0F172A) : Colors.white;
    final textColor = isUser ? Colors.white : const Color(0xFF0F172A);
    final time = _formatTime(message.createdAt);
    final isThinking = !isUser && message.status == ChatMessageStatus.sending && message.content.trim().isEmpty;

    return GestureDetector(
      onLongPress: () => _copyMessage(context),
      child: Align(
        alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * (isUser ? 0.82 : 0.92)),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: bubbleColor,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(18),
                topRight: const Radius.circular(18),
                bottomLeft: Radius.circular(isUser ? 18 : 6),
                bottomRight: Radius.circular(isUser ? 6 : 18),
              ),
              border: isUser ? null : Border.all(color: const Color(0xFFE2E8F0)),
              boxShadow: [
                if (!isUser)
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.035),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (isThinking)
                  ThinkingIndicator(onCancel: onCancel)
                else
                  ChatMarkdownView(
                    data: message.content,
                    isUser: isUser,
                    textColor: textColor,
                    streaming: message.isStreaming,
                  ),
                const SizedBox(height: 6),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '$time · ${_statusLabel(message.status, message.isStreaming)}',
                      style: TextStyle(
                        color: isUser ? Colors.white70 : const Color(0xFF64748B),
                        fontSize: 11,
                      ),
                    ),
                    if (message.status == ChatMessageStatus.sending) ...[
                      const SizedBox(width: 6),
                      const SizedBox(
                        width: 10,
                        height: 10,
                        child: CircularProgressIndicator(strokeWidth: 1.6),
                      ),
                    ],
                  ],
                ),
                if (!isUser && message.isStreaming && message.content.trim().isNotEmpty && onCancel != null) ...[
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: onCancel,
                    icon: const Icon(Icons.stop_circle_outlined, size: 16),
                    label: const Text('Stop generating'),
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xFF64748B),
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
                ],
                if (!isUser && message.content.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: () => _copyMessage(context),
                    icon: const Icon(Icons.copy, size: 16),
                    label: const Text('复制'),
                  ),
                ],
                if (isUser && message.status == ChatMessageStatus.error && onRetry != null) ...[
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: onRetry,
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('重试'),
                    style: TextButton.styleFrom(foregroundColor: Colors.white),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatTime(DateTime time) {
    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  String _statusLabel(ChatMessageStatus status, bool streaming) {
    if (streaming) {
      return '生成中';
    }

    switch (status) {
      case ChatMessageStatus.sending:
        return '发送中';
      case ChatMessageStatus.success:
        return '成功';
      case ChatMessageStatus.error:
        return '失败';
    }
  }

  void _copyMessage(BuildContext context) {
    if (message.content.trim().isEmpty) {
      return;
    }

    Clipboard.setData(ClipboardData(text: message.content));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('消息已复制')),
    );
  }
}

class _AttachmentAction extends StatelessWidget {
  const _AttachmentAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon),
      title: Text(label),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}
