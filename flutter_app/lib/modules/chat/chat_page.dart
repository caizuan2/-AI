import 'dart:async';
import 'dart:convert';

import 'package:file_selector/file_selector.dart' as file_selector;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart' as image_picker;
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_service.dart';
import '../update/test_update_dialog.dart';
import '../update/test_update_service.dart';
import '../update/update_page.dart';
import '../upload/upload_models.dart';
import 'assistant_answer_card.dart';
import 'chat_controller.dart';
import 'chat_markdown_view.dart';
import 'chat_message.dart';
import 'thinking_indicator.dart';

const _appDisplayName = '小董AI';
const _appLogoAsset = 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png';
const _legacyAppTitle = 'AI 知识库助手';
const _legacyAppDrawerTitle = 'AI知识库助手';
const _initialWelcomeMessageContent =
    '你好，我是 AI 知识库助手。你可以输入问题，也可以通过加号菜单上传图片、文件或拍照。';

void _showLocalActionHint(
  BuildContext context,
  String message, {
  bool error = false,
}) {
  final text = message.trim();
  if (text.isEmpty) {
    return;
  }

  final overlay = Overlay.maybeOf(context);
  final targetObject = context.findRenderObject();
  final overlayObject = overlay?.context.findRenderObject();
  if (overlay == null ||
      targetObject is! RenderBox ||
      overlayObject is! RenderBox ||
      !targetObject.attached ||
      !overlayObject.attached) {
    debugPrint(text);
    return;
  }

  final targetOffset = overlayObject.globalToLocal(
    targetObject.localToGlobal(Offset.zero),
  );
  final targetSize = targetObject.size;
  final overlaySize = overlayObject.size;
  final estimatedWidth = (text.length * 13.0 + 28.0).clamp(58.0, 168.0);
  final maxLeft = overlaySize.width > estimatedWidth + 16.0
      ? overlaySize.width - estimatedWidth - 8.0
      : 8.0;
  final maxTop = overlaySize.height > 50.0 ? overlaySize.height - 42.0 : 8.0;
  final left = (targetOffset.dx + targetSize.width / 2 - estimatedWidth / 2)
      .clamp(8.0, maxLeft)
      .toDouble();
  final preferredTop = targetOffset.dy - 36.0;
  final top = (preferredTop < 8.0
          ? targetOffset.dy + targetSize.height + 8.0
          : preferredTop)
      .clamp(8.0, maxTop)
      .toDouble();

  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) {
      return Positioned(
        left: left,
        top: top,
        child: IgnorePointer(
          child: Material(
            color: Colors.transparent,
            child: Container(
              constraints: const BoxConstraints(maxWidth: 168),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color:
                    error ? const Color(0xFFFEF2F2) : const Color(0xE60F172A),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color:
                      error ? const Color(0xFFFCA5A5) : const Color(0x22000000),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.12),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Text(
                text,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: error ? const Color(0xFFB91C1C) : Colors.white,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ),
      );
    },
  );
  overlay.insert(entry);
  Future<void>.delayed(const Duration(milliseconds: 1050), () {
    entry.remove();
  });
}

String _compactHintText(String message) {
  final text = message.trim();
  if (text.isEmpty) {
    return '';
  }
  if (text.contains('权限')) {
    return '权限未开';
  }
  if (text.contains('上传失败')) {
    return '上传失败';
  }
  if (text.contains('正在上传')) {
    return '上传中';
  }
  if (text.contains('取消')) {
    return '已取消';
  }
  if (text.contains('待接入')) {
    return '待接入';
  }
  if (text.contains('不支持')) {
    return '暂不支持';
  }
  if (text.contains('失败') || text.contains('不可用')) {
    return '操作失败';
  }
  if (text.length <= 6) {
    return text;
  }
  return '请重试';
}

bool _isErrorHint(String message) {
  return message.contains('失败') ||
      message.contains('权限') ||
      message.contains('不可用') ||
      message.contains('不支持') ||
      message.contains('请重试');
}

class ChatPage extends StatefulWidget {
  const ChatPage({required this.apiService, super.key});

  static const routeName = '/chat';

  final ApiService apiService;

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  final _imagePicker = image_picker.ImagePicker();
  late final ChatController _controller;
  late Future<Map<String, dynamic>> _currentUserFuture;
  Uint8List? _avatarPreviewBytes;
  int _avatarCacheToken = 0;
  bool _uploading = false;
  bool _desktopSidebarExpanded = true;
  final List<_PendingAttachment> _pendingAttachments = [];
  static const MethodChannel _speechChannel = MethodChannel(
    'ai_knowledge_flutter_app/speech',
  );

  @override
  void initState() {
    super.initState();
    _controller = ChatController(apiService: widget.apiService);
    _currentUserFuture = _loadCurrentUser();
    _currentUserFuture.then((_) {
      unawaited(_controller.loadConversationFeatures(force: true));
      return _controller.loadCloudConversations();
    }).catchError((error) {
      debugPrint('Initial cloud conversation sync failed: $error');
    });
    _controller.addListener(_scrollToBottom);
  }

  @override
  void dispose() {
    _controller.dispose();
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send([BuildContext? actionContext]) async {
    final text = _inputController.text.trim();
    if ((text.isEmpty && _pendingAttachments.isEmpty) ||
        _controller.sending ||
        _uploading) {
      return;
    }

    final attachments = _pendingAttachments
        .map((pending) => pending.attachment)
        .toList(growable: false);
    _inputController.clear();
    setState(() => _pendingAttachments.clear());
    if (mounted && actionContext != null) {
      _showLocalActionHint(actionContext, '已发送');
    }
    await _controller.send(text, attachments: attachments);
  }

  void _applyWelcomePrompt(String prompt) {
    final text = prompt.trim();
    if (text.isEmpty) {
      return;
    }

    _inputController.text = text;
    _inputController.selection = TextSelection.collapsed(offset: text.length);
    _showLocalActionHint(context, '已填入');
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

  Future<Map<String, dynamic>> _loadCurrentUser() async {
    try {
      return await widget.apiService.currentUser();
    } catch (error) {
      debugPrint('Current user load failed: $error');
      return <String, dynamic>{};
    }
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
                  onTap: () {
                    Navigator.pop(context);
                    _pickAndUploadImage();
                  },
                ),
                _AttachmentAction(
                  icon: Icons.attach_file,
                  label: '文件上传',
                  onTap: () {
                    Navigator.pop(context);
                    _pickAndUploadFile();
                  },
                ),
                _AttachmentAction(
                  icon: Icons.photo_camera_outlined,
                  label: '拍照',
                  onTap: () {
                    Navigator.pop(context);
                    _captureAndUploadImage();
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _pickAndUploadImage() async {
    try {
      if (_isMobilePlatform) {
        try {
          final files = await _imagePicker.pickMultiImage(
            imageQuality: 92,
          );
          await _uploadPickedFiles(files, '图片');
        } catch (error) {
          debugPrint('Multi image picker failed, fallback to single: $error');
          final file = await _imagePicker.pickImage(
            source: image_picker.ImageSource.gallery,
            imageQuality: 92,
          );
          await _uploadPickedFile(file, '图片');
        }
        return;
      }

      final files = await file_selector.openFiles(
        acceptedTypeGroups: const [
          file_selector.XTypeGroup(
            label: 'Images',
            extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
          ),
        ],
      );
      await _uploadPickedFiles(files, '图片');
    } catch (error) {
      _showSnack('图片上传失败：$error');
    }
  }

  Future<void> _pickAndUploadFile() async {
    try {
      final files = await file_selector.openFiles();
      await _uploadPickedFiles(files, '文件');
    } catch (error) {
      _showSnack('文件上传失败：$error');
    }
  }

  Future<void> _captureAndUploadImage() async {
    try {
      if (_isMobilePlatform) {
        final file = await _imagePicker.pickImage(
          source: image_picker.ImageSource.camera,
          imageQuality: 92,
        );
        await _uploadPickedFile(file, '拍照图片');
        return;
      }

      _showSnack('当前平台不支持直接拍照，已切换为选择图片文件。');
      final file = await file_selector.openFile(
        acceptedTypeGroups: const [
          file_selector.XTypeGroup(
            label: 'Images',
            extensions: ['jpg', 'jpeg', 'png', 'webp'],
          ),
        ],
      );
      await _uploadPickedFile(file, '图片');
    } catch (error) {
      _showSnack('拍照入口暂不可用：$error');
    }
  }

  Future<void> _uploadPickedFile(Object? pickedFile, String label) async {
    if (pickedFile == null) {
      _showSnack('已取消选择$label');
      return;
    }
    if (_uploading) {
      _showSnack('正在上传，请稍候');
      return;
    }

    setState(() => _uploading = true);
    try {
      await _uploadPickedFileToPending(pickedFile, label);
    } catch (error) {
      await _showUploadFailure(label, error);
    } finally {
      if (mounted) {
        setState(() => _uploading = false);
      }
    }
  }

  Future<void> _uploadPickedFiles(
      List<Object> pickedFiles, String label) async {
    if (pickedFiles.isEmpty) {
      _showSnack('已取消选择$label');
      return;
    }
    if (_uploading) {
      _showSnack('正在上传，请稍候');
      return;
    }

    final files = _uniquePickedFiles(pickedFiles);
    final total = files.length;
    if (total == 0) {
      _showSnack('已取消选择$label');
      return;
    }

    var successCount = 0;
    var failureCount = 0;
    _showUploadHint('已选择 $total 个附件');
    setState(() => _uploading = true);
    try {
      for (var index = 0; index < total; index += 1) {
        if (!mounted) {
          return;
        }
        _showUploadHint('正在上传 ${index + 1}/$total');
        try {
          await _uploadPickedFileToPending(files[index], label);
          successCount += 1;
        } catch (error) {
          failureCount += 1;
          debugPrint('$label upload failed (${index + 1}/$total): $error');
        }
      }
    } finally {
      if (mounted) {
        setState(() => _uploading = false);
      }
    }

    if (!mounted) {
      return;
    }
    if (failureCount == 0) {
      _showUploadHint('上传完成 $successCount/$total');
    } else {
      _showUploadHint('上传完成 $successCount/$total，失败 $failureCount',
          error: true);
    }
  }

  Future<void> _uploadPickedFileToPending(
      Object pickedFile, String label) async {
    final file = pickedFile as dynamic;
    final Uint8List bytes = await file.readAsBytes() as Uint8List;
    final String name = (file.name as String?)?.trim().isNotEmpty == true
        ? file.name as String
        : '$label-${DateTime.now().millisecondsSinceEpoch}';
    final String? mimeType = file.mimeType as String?;
    final result = await widget.apiService.upload(
      UploadFile(name: name, bytes: bytes, mimeType: mimeType),
    );
    final uploadUrl = _extractUploadUrl(result);
    if (uploadUrl == null || uploadUrl.trim().isEmpty) {
      throw ApiException(
        '服务器未返回附件 URL',
        debugDetails:
            'requestUrl=/api/ai/chat/attachments\nfileName=$name\nfileSize=${bytes.length}\nmimeType=${mimeType ?? ''}\nresponse=$result',
      );
    }
    final isImage = _isImageUpload(label, mimeType, name);
    final attachment = ChatAttachment(
      type: isImage ? ChatAttachmentType.image : ChatAttachmentType.file,
      name: name,
      status: '上传成功',
      mimeType: mimeType,
      size: bytes.length,
      bytes: bytes,
      url: uploadUrl,
    );
    if (!mounted) {
      return;
    }
    setState(() {
      _pendingAttachments.add(
        _PendingAttachment(
          id: '${DateTime.now().microsecondsSinceEpoch}-${_pendingAttachments.length}',
          sourceLabel: label,
          attachment: attachment,
        ),
      );
    });
  }

  List<Object> _uniquePickedFiles(List<Object> pickedFiles) {
    final seen = <String>{};
    final files = <Object>[];
    for (final pickedFile in pickedFiles) {
      final key = _pickedFileIdentity(pickedFile);
      if (key != null && !seen.add(key)) {
        continue;
      }
      files.add(pickedFile);
    }
    return files;
  }

  String? _pickedFileIdentity(Object pickedFile) {
    final file = pickedFile as dynamic;
    try {
      final path = file.path as String?;
      if (path != null && path.trim().isNotEmpty) {
        return path.trim();
      }
    } catch (_) {
      // Some pickers do not expose a filesystem path.
    }
    try {
      final name = file.name as String?;
      if (name != null && name.trim().isNotEmpty) {
        return name.trim();
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  void _showUploadHint(String message, {bool error = false}) {
    if (!mounted) {
      debugPrint(message);
      return;
    }
    _showLocalActionHint(context, message, error: error);
  }

  void _removePendingAttachment(String id, [BuildContext? actionContext]) {
    if (actionContext != null) {
      _showLocalActionHint(actionContext, '已删除');
    }
    setState(() {
      _pendingAttachments.removeWhere((item) => item.id == id);
    });
  }

  void _clearComposer() {
    _inputController.clear();
    setState(() {
      _pendingAttachments.clear();
    });
  }

  double get _sendButtonSize {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 48;
    }
    return 40;
  }

  double get _sendProgressSize {
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 17;
    }
    return 15;
  }

  bool _editUserMessage(ChatMessage message) {
    if (message.role != ChatRole.user) {
      return false;
    }
    if (_controller.sending || _uploading) {
      _showSnack('当前正在处理消息，请稍后再编辑');
      return false;
    }

    final shouldHideAttachmentOnlyText = _isAttachmentOnlyMessage(
      message.content,
      message.attachments,
    );
    final text = shouldHideAttachmentOnlyText ? '' : message.content.trim();
    _inputController.text = text;
    _inputController.selection = TextSelection.collapsed(offset: text.length);
    setState(() {
      _pendingAttachments
        ..clear()
        ..addAll(
          message.attachments.map((attachment) {
            return _PendingAttachment(
              id: 'edit-${DateTime.now().microsecondsSinceEpoch}-${attachment.name}',
              sourceLabel: attachment.isImage ? '图片' : '文件',
              attachment: attachment,
            );
          }),
        );
    });
    return true;
  }

  void _insertTextIntoInput(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) {
      return;
    }

    final selection = _inputController.selection;
    final oldText = _inputController.text;
    final int start = selection.isValid ? selection.start : oldText.length;
    final int end = selection.isValid ? selection.end : oldText.length;
    final inserted = oldText.replaceRange(start, end, trimmed);
    _inputController.text = inserted;
    _inputController.selection = TextSelection.collapsed(
      offset: start + trimmed.length,
    );
  }

  void _handleRenamePreview(String name) {
    if (!mounted) {
      return;
    }
    setState(() {
      _currentUserFuture = _currentUserFuture.then((data) {
        final user = _extractUser(data);
        return {
          'user': {...user, 'name': name},
        };
      });
    });
  }

  Future<void> _handleVoiceInput([BuildContext? actionContext]) async {
    final hintContext = actionContext ?? context;
    if (kIsWeb || defaultTargetPlatform == TargetPlatform.windows) {
      _showLocalActionHint(hintContext, '语音待接入');
      return;
    }
    if (defaultTargetPlatform != TargetPlatform.android) {
      _showLocalActionHint(hintContext, '暂不支持', error: true);
      return;
    }

    try {
      final status = await Permission.microphone.status;
      final nextStatus =
          status.isGranted ? status : await Permission.microphone.request();
      if (!nextStatus.isGranted) {
        if (hintContext.mounted) {
          _showLocalActionHint(hintContext, '权限未开', error: true);
        }
        return;
      }

      final result = await _speechChannel.invokeMethod<String>('listen');
      if (!mounted || !hintContext.mounted) {
        return;
      }
      final text = result?.trim() ?? '';
      if (text.isEmpty) {
        _showLocalActionHint(hintContext, '未识别到', error: true);
        return;
      }
      final shouldInsert = await showDialog<bool>(
        context: context,
        builder: (context) {
          return AlertDialog(
            title: const Text('语音识别结果'),
            content: SelectableText(text),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('取消'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('插入输入框'),
              ),
            ],
          );
        },
      );
      if (shouldInsert == true) {
        _insertTextIntoInput(text);
      }
    } on PlatformException catch (error) {
      if (error.code == 'not_available') {
        if (hintContext.mounted) {
          _showLocalActionHint(hintContext, '语音不可用', error: true);
        }
        return;
      }
      debugPrint('Voice input failed: ${error.message ?? error.code}');
      if (hintContext.mounted) {
        _showLocalActionHint(hintContext, '语音失败', error: true);
      }
    } catch (error) {
      debugPrint('Voice input failed: $error');
      if (hintContext.mounted) {
        _showLocalActionHint(hintContext, '语音失败', error: true);
      }
    }
  }

  Future<void> _handleScan() async {
    if (kIsWeb || defaultTargetPlatform == TargetPlatform.windows) {
      final shouldPick = await _showConfirmDialog(
        title: '扫码',
        message: 'Windows 扫码识别待接入，可先选择二维码图片上传，让 AI 识别。',
        confirmText: '选择二维码图片',
      );
      if (shouldPick) {
        await _pickAndUploadImage();
      }
      return;
    }

    try {
      if (_isMobilePlatform) {
        final status = await Permission.camera.status;
        final nextStatus =
            status.isGranted ? status : await Permission.camera.request();
        if (!nextStatus.isGranted) {
          _showSnack('相机权限未开启，请在系统设置中允许相机权限');
          return;
        }
      }

      final action = await _showScanActionDialog();
      if (action == _ScanAction.camera) {
        await _captureAndUploadImage();
      } else if (action == _ScanAction.gallery) {
        await _pickAndUploadImage();
      }
    } catch (error) {
      _showSnack('扫码入口暂不可用：$error');
    }
  }

  Future<_ScanAction?> _showScanActionDialog() async {
    if (!mounted) {
      return null;
    }

    return showDialog<_ScanAction>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('扫一扫'),
          content: const Text(
            '二维码实时识别接口待接入。你可以先拍摄或选择二维码图片，附件会进入输入等待区，再发送给 AI 识别。',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('取消'),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(_ScanAction.gallery),
              child: const Text('选择图片'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(_ScanAction.camera),
              child: const Text('拍照上传'),
            ),
          ],
        );
      },
    );
  }

  void _showNotifications() {
    _showInfoDialog(title: '消息通知', message: '暂无通知');
  }

  void _showSettingsSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (context) {
        return _UserSettingsSheet(
          apiService: widget.apiService,
          userFuture: _currentUserFuture,
          avatarPreviewBytes: _avatarPreviewBytes,
          avatarCacheToken: _avatarCacheToken,
          onAvatarUpdated: _handleAvatarUpdated,
          onNameUpdated: _handleRenamePreview,
          onLogout: () {
            Navigator.of(context).pop();
            Navigator.of(context).pushReplacementNamed('/login');
          },
        );
      },
    );
  }

  void _handleAvatarUpdated(Uint8List bytes, Map<String, dynamic> result) {
    if (!mounted) {
      return;
    }

    setState(() {
      _avatarPreviewBytes = bytes;
      _avatarCacheToken = DateTime.now().millisecondsSinceEpoch;
      _currentUserFuture = _loadCurrentUser().then((data) {
        final user = _extractUser(data);
        final avatarUrl = _extractAvatarUrlFromResult(result);
        if (avatarUrl.isNotEmpty) {
          return {
            'user': {
              ...user,
              'avatar_url': _cacheBustedUrl(avatarUrl, _avatarCacheToken),
            },
          };
        }
        return data;
      });
    });
  }

  void _showSnack(String message) {
    if (!mounted) {
      return;
    }
    debugPrint(message);
    _showLocalActionHint(
      context,
      _compactHintText(message),
      error: _isErrorHint(message),
    );
  }

  Future<void> _showUploadFailure(String label, Object error) async {
    if (!mounted) {
      return;
    }

    final details = error is ApiException
        ? (error.debugDetails?.trim().isNotEmpty == true
            ? error.debugDetails!.trim()
            : 'statusCode=${error.statusCode ?? ''}\nmessage=${error.message}')
        : error.toString();
    final userMessage = error is ApiException ? error.message : '上传失败，请稍后重试';
    final statusText = error is ApiException && error.statusCode != null
        ? '状态码：${error.statusCode}'
        : '请检查网络或稍后重试';
    debugPrint('$label upload failed:\n$details');
    _showSnack('上传失败，请稍后重试');

    await showDialog<void>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text('$label上传失败'),
          content: Text('$userMessage\n$statusText'),
          actions: [
            TextButton(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: details));
                Navigator.of(context).pop();
              },
              child: const Text('复制错误信息'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('知道了'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _showInfoDialog({
    required String title,
    required String message,
  }) async {
    if (!mounted) {
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(title),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('知道了'),
            ),
          ],
        );
      },
    );
  }

  Future<bool> _showConfirmDialog({
    required String title,
    required String message,
    required String confirmText,
  }) async {
    if (!mounted) {
      return false;
    }

    return await showDialog<bool>(
          context: context,
          builder: (context) {
            return AlertDialog(
              title: Text(title),
              content: Text(message),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('取消'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: Text(confirmText),
                ),
              ],
            );
          },
        ) ??
        false;
  }

  bool get _isMobilePlatform {
    if (kIsWeb) {
      return false;
    }
    return defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS;
  }

  double _historyDrawerWidth(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    if (width < 700) {
      return width * 0.82;
    }
    return width.clamp(340, 420).toDouble();
  }

  bool _useDesktopSidebar(BuildContext context) {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.windows) {
      return false;
    }
    return MediaQuery.sizeOf(context).width >= 900;
  }

  bool get _useWindowsBrand {
    return !kIsWeb && defaultTargetPlatform == TargetPlatform.windows;
  }

  void _openHistoryDrawer(BuildContext drawerContext) {
    unawaited(_controller.loadCloudConversations());
    Scaffold.of(drawerContext).openDrawer();
  }

  Widget _buildHistoryContent({required bool embedded}) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return _HistoryDrawer(
          conversations: _controller.loadedConversations,
          userFuture: _currentUserFuture,
          avatarPreviewBytes: _avatarPreviewBytes,
          avatarCacheToken: _avatarCacheToken,
          sending: _controller.sending,
          syncing: _controller.syncing,
          syncError: _controller.lastSyncError,
          conversationFeatures: _controller.conversationFeatures,
          useOfficialBrand: _useWindowsBrand,
          onSetConversationPinned: _controller.setConversationPinned,
          onNewConversation: () {
            _clearComposer();
            _controller.startNewConversation();
            if (!embedded) {
              Navigator.of(context).pop();
            }
          },
          onOpenConversation: (id) {
            _clearComposer();
            unawaited(_controller.openConversation(id));
            if (!embedded) {
              Navigator.of(context).pop();
            }
          },
          onOpenSettings: () {
            if (!embedded) {
              Navigator.of(context).pop();
            }
            _showSettingsSheet();
          },
          onClose: embedded
              ? () => setState(() => _desktopSidebarExpanded = false)
              : () => Navigator.of(context).pop(),
          onScan: _handleScan,
          onNotifications: _showNotifications,
        );
      },
    );
  }

  PreferredSizeWidget _buildAppBar({required bool desktopSidebar}) {
    return AppBar(
      leading: Builder(
        builder: (context) {
          return IconButton(
            tooltip: desktopSidebar
                ? (_desktopSidebarExpanded ? '折叠历史栏' : '展开历史栏')
                : '历史记录',
            onPressed: desktopSidebar
                ? () => setState(
                      () => _desktopSidebarExpanded = !_desktopSidebarExpanded,
                    )
                : () => _openHistoryDrawer(context),
            icon: Icon(
              desktopSidebar && _desktopSidebarExpanded
                  ? Icons.menu_open
                  : Icons.menu,
            ),
          );
        },
      ),
      title: desktopSidebar
          ? const SizedBox.shrink()
          : AnimatedBuilder(
              animation: _controller,
              builder: (context, _) {
                final subtitle =
                    '${_modelLabel(_controller.selectedModel)} · ${_controller.sessionId}';
                if (!_useWindowsBrand) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(_legacyAppTitle),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          color: Color(0xFF64748B),
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  );
                }

                return Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const _AppBrandLogo(size: 32, radius: 9),
                    const SizedBox(width: 10),
                    Flexible(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text(
                            _appDisplayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
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
          onPressed: () =>
              Navigator.of(context).pushNamed(UpdatePage.routeName),
          icon: const Icon(Icons.system_update_alt),
        ),
      ],
    );
  }

  Widget _buildChatBody() {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final messages = _visibleChatMessages(_controller.messages);
        final showWelcome = messages.isEmpty;
        return Column(
          children: [
            Expanded(
              child: showWelcome
                  ? _UserWelcomeEmptyState(
                      role: _welcomeRoleForSession(_controller.sessionId),
                      onPromptSelected: _applyWelcomePrompt,
                    )
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
                      itemCount: messages.length,
                      itemBuilder: (context, index) {
                        return TweenAnimationBuilder<double>(
                          key: ValueKey(
                            '${messages[index].createdAt.microsecondsSinceEpoch}-$index',
                          ),
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
                            onCancel: _controller.sending
                                ? _controller.cancelStreaming
                                : null,
                            onRetry: _controller.canRetry
                                ? _controller.retryLastFailed
                                : null,
                            onEdit: messages[index].role == ChatRole.user
                                ? (_) => _editUserMessage(messages[index])
                                : null,
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
                  border: const Border(
                    top: BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.04),
                      blurRadius: 18,
                      offset: const Offset(0, -6),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_pendingAttachments.isNotEmpty) ...[
                      _PendingAttachmentTray(
                        attachments: _pendingAttachments,
                        onRemove: _removePendingAttachment,
                      ),
                      const SizedBox(height: 8),
                    ],
                    DecoratedBox(
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
                              onPressed:
                                  _uploading ? null : _showAttachmentMenu,
                              icon: _uploading
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Icon(Icons.add_circle_outline),
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
                                  contentPadding: EdgeInsets.symmetric(
                                    vertical: 14,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Builder(
                              builder: (voiceContext) {
                                return IconButton(
                                  tooltip: '语音输入',
                                  onPressed: () =>
                                      _handleVoiceInput(voiceContext),
                                  icon: const Icon(Icons.mic_none),
                                  color: const Color(0xFF64748B),
                                );
                              },
                            ),
                            const SizedBox(width: 4),
                            Builder(
                              builder: (sendContext) {
                                return SizedBox(
                                  width: _sendButtonSize,
                                  height: _sendButtonSize,
                                  child: FilledButton(
                                    onPressed: _controller.sending || _uploading
                                        ? null
                                        : () => _send(sendContext),
                                    style: FilledButton.styleFrom(
                                      padding: EdgeInsets.zero,
                                      shape: const CircleBorder(),
                                      backgroundColor: const Color(0xFF0F172A),
                                    ),
                                    child: _controller.sending
                                        ? SizedBox(
                                            width: _sendProgressSize,
                                            height: _sendProgressSize,
                                            child:
                                                const CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: Colors.white,
                                            ),
                                          )
                                        : Icon(
                                            Icons.arrow_upward,
                                            size:
                                                _sendButtonSize <= 40 ? 19 : 21,
                                          ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  List<ChatMessage> _visibleChatMessages(List<ChatMessage> messages) {
    final hasRealContent = messages.any((message) {
      return !_isInitialWelcomeMessage(message) &&
          (message.content.trim().isNotEmpty ||
              message.attachments.isNotEmpty ||
              message.isStreaming);
    });
    if (!hasRealContent) {
      return const [];
    }

    return messages
        .where((message) => !_isInitialWelcomeMessage(message))
        .toList(growable: false);
  }

  bool _isInitialWelcomeMessage(ChatMessage message) {
    return message.role == ChatRole.assistant &&
        message.attachments.isEmpty &&
        !message.isStreaming &&
        message.content.trim() == _initialWelcomeMessageContent;
  }

  @override
  Widget build(BuildContext context) {
    final desktopSidebar = _useDesktopSidebar(context);
    return Scaffold(
      drawer: desktopSidebar
          ? null
          : Drawer(
              width: _historyDrawerWidth(context),
              backgroundColor: Colors.white,
              child: _buildHistoryContent(embedded: false),
            ),
      appBar: _buildAppBar(desktopSidebar: desktopSidebar),
      body: desktopSidebar
          ? Row(
              children: [
                if (_desktopSidebarExpanded)
                  SizedBox(
                    width: _historyDrawerWidth(context),
                    child: DecoratedBox(
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        border: Border(
                          right: BorderSide(color: Color(0xFFE2E8F0)),
                        ),
                      ),
                      child: _buildHistoryContent(embedded: true),
                    ),
                  ),
                Expanded(child: _buildChatBody()),
              ],
            )
          : _buildChatBody(),
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

enum _ScanAction { camera, gallery }

class _AppBrandLogo extends StatelessWidget {
  const _AppBrandLogo({required this.size, this.radius = 12});

  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.asset(
        _appLogoAsset,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) {
          return Container(
            width: size,
            height: size,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(radius),
            ),
            child: Text(
              _appDisplayName.characters.first,
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: size * 0.42,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _HistoryDrawer extends StatefulWidget {
  const _HistoryDrawer({
    required this.conversations,
    required this.userFuture,
    required this.avatarPreviewBytes,
    required this.avatarCacheToken,
    required this.sending,
    required this.syncing,
    required this.syncError,
    required this.conversationFeatures,
    required this.useOfficialBrand,
    required this.onSetConversationPinned,
    required this.onNewConversation,
    required this.onOpenConversation,
    required this.onOpenSettings,
    required this.onClose,
    required this.onScan,
    required this.onNotifications,
  });

  final List<ChatConversationSummary> conversations;
  final Future<Map<String, dynamic>> userFuture;
  final Uint8List? avatarPreviewBytes;
  final int avatarCacheToken;
  final bool sending;
  final bool syncing;
  final String? syncError;
  final ConversationFeatureFlags conversationFeatures;
  final bool useOfficialBrand;
  final bool Function(String id, bool pinned) onSetConversationPinned;
  final VoidCallback onNewConversation;
  final ValueChanged<String> onOpenConversation;
  final VoidCallback onOpenSettings;
  final VoidCallback onClose;
  final VoidCallback onScan;
  final VoidCallback onNotifications;

  @override
  State<_HistoryDrawer> createState() => _HistoryDrawerState();
}

class _HistoryDrawerState extends State<_HistoryDrawer> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  bool _isFeatureEnabled(String key) {
    return widget.conversationFeatures.isEnabled(key);
  }

  void _showUnavailableFeature() {
    _showLocalActionHint(context, '功能暂未开放', error: true);
  }

  void _showMissingOperation() {
    _showLocalActionHint(context, '操作接口未接入', error: true);
  }

  Future<bool> _confirmDeleteConversation(
    ChatConversationSummary conversation,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('删除会话'),
          content: Text('确认删除“${conversation.title}”？此操作需要服务端接口支持。'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('取消'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626),
              ),
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('确认删除'),
            ),
          ],
        );
      },
    );
    return confirmed == true;
  }

  Future<void> _handleConversationMenu(
    _ConversationMenuAction action,
    ChatConversationSummary conversation,
  ) async {
    switch (action) {
      case _ConversationMenuAction.share:
        if (!_isFeatureEnabled(ConversationFeatureKeys.share)) {
          _showUnavailableFeature();
          return;
        }
        _showMissingOperation();
        return;
      case _ConversationMenuAction.startGroupChat:
        if (!_isFeatureEnabled(ConversationFeatureKeys.groupChat)) {
          _showUnavailableFeature();
          return;
        }
        _showMissingOperation();
        return;
      case _ConversationMenuAction.rename:
        if (!_isFeatureEnabled(ConversationFeatureKeys.rename)) {
          _showUnavailableFeature();
          return;
        }
        _showMissingOperation();
        return;
      case _ConversationMenuAction.togglePinned:
        final nextPinned = !conversation.pinned;
        // Cloud pin sync still needs a dedicated operation endpoint; until then
        // the visible pin action remains a local sort only.
        final updated = widget.onSetConversationPinned(
          conversation.id,
          nextPinned,
        );
        if (!mounted) return;
        _showLocalActionHint(
          context,
          updated ? (nextPinned ? '已本地置顶' : '已取消本地置顶') : '当前会话暂时无法置顶',
          error: !updated,
        );
        return;
      case _ConversationMenuAction.archive:
        if (!_isFeatureEnabled(ConversationFeatureKeys.archive)) {
          _showUnavailableFeature();
          return;
        }
        _showMissingOperation();
        return;
      case _ConversationMenuAction.delete:
        if (!_isFeatureEnabled(ConversationFeatureKeys.delete)) {
          _showUnavailableFeature();
          return;
        }
        final confirmed = await _confirmDeleteConversation(conversation);
        if (!mounted || !confirmed) {
          return;
        }
        _showMissingOperation();
        return;
    }
  }

  @override
  Widget build(BuildContext context) {
    final normalizedQuery = _query.trim().toLowerCase();
    final conversations = normalizedQuery.isEmpty
        ? widget.conversations
        : widget.conversations.where((conversation) {
            return conversation.title.toLowerCase().contains(
                      normalizedQuery,
                    ) ||
                conversation.subtitle.toLowerCase().contains(
                      normalizedQuery,
                    );
          }).toList(growable: false);
    final pinnedConversations = conversations
        .where((conversation) => conversation.pinned)
        .toList(growable: false);
    final normalConversations = conversations
        .where((conversation) => !conversation.pinned)
        .toList(growable: false);

    List<Widget> buildConversationTiles(
      List<ChatConversationSummary> items,
    ) {
      final tiles = <Widget>[];
      for (var index = 0; index < items.length; index += 1) {
        if (index > 0) {
          tiles.add(const SizedBox(height: 6));
        }
        final conversation = items[index];
        tiles.add(
          _ConversationTile(
            conversation: conversation,
            conversationFeatures: widget.conversationFeatures,
            index: conversations.indexOf(conversation),
            onTap: () => widget.onOpenConversation(conversation.id),
            onMenuSelected: (action) =>
                _handleConversationMenu(action, conversation),
          ),
        );
      }
      return tiles;
    }

    return SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        onChanged: (value) => setState(() => _query = value),
                        decoration: InputDecoration(
                          hintText: '搜索历史会话',
                          prefixIcon: const Icon(Icons.search),
                          filled: true,
                          fillColor: const Color(0xFFF1F5F9),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide.none,
                          ),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Tooltip(
                      message: '新建对话',
                      child: Material(
                        color: const Color(0xFF0F172A),
                        borderRadius: BorderRadius.circular(14),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(14),
                          onTap:
                              widget.sending ? null : widget.onNewConversation,
                          child: const SizedBox(
                            width: 40,
                            height: 40,
                            child: Icon(
                              Icons.edit_square,
                              color: Colors.white,
                              size: 18,
                            ),
                          ),
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: '关闭',
                      onPressed: widget.onClose,
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _AppInfoCard(
                  useOfficialBrand: widget.useOfficialBrand,
                  onTap: widget.onOpenSettings,
                ),
                if (widget.syncing || (widget.syncError ?? '').isNotEmpty) ...[
                  const SizedBox(height: 10),
                  _CloudConversationStatus(
                    syncing: widget.syncing,
                    message: widget.syncError,
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: conversations.isEmpty
                ? _DrawerEmptyState(
                    text: widget.conversations.isEmpty ? '暂无历史记录' : '暂无匹配会话',
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                    children: [
                      if (pinnedConversations.isNotEmpty)
                        const _ConversationGroupTitle('已置顶'),
                      ...buildConversationTiles(pinnedConversations),
                      if (pinnedConversations.isNotEmpty &&
                          normalConversations.isNotEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 8,
                          ),
                          child: Divider(
                            height: 1,
                            thickness: 0.7,
                            color: Color(0xFFE5E7EB),
                          ),
                        ),
                      if (normalConversations.isNotEmpty)
                        const _ConversationGroupTitle('最近'),
                      ...buildConversationTiles(normalConversations),
                    ],
                  ),
          ),
          _DrawerUserFooter(
            userFuture: widget.userFuture,
            avatarPreviewBytes: widget.avatarPreviewBytes,
            avatarCacheToken: widget.avatarCacheToken,
            onScan: widget.onScan,
            onNotifications: widget.onNotifications,
            onSettings: widget.onOpenSettings,
          ),
        ],
      ),
    );
  }
}

class _AppInfoCard extends StatelessWidget {
  const _AppInfoCard({
    required this.useOfficialBrand,
    required this.onTap,
  });

  final bool useOfficialBrand;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFF8FAFC),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              if (useOfficialBrand)
                const _AppBrandLogo(size: 40)
              else
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Center(
                    child: Text(
                      'AI',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  useOfficialBrand ? _appDisplayName : _legacyAppDrawerTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              const Icon(Icons.chevron_right, color: Color(0xFF94A3B8)),
            ],
          ),
        ),
      ),
    );
  }
}

class _DrawerEmptyState extends StatelessWidget {
  const _DrawerEmptyState({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          text,
          style: const TextStyle(color: Color(0xFF64748B)),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

class _UserWelcomeRole {
  const _UserWelcomeRole({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.prompts,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final List<String> prompts;
}

const _welcomeRoles = [
  _UserWelcomeRole(
    icon: Icons.workspace_premium_outlined,
    title: 'Hi，我是销售教练',
    subtitle: '销售辅导、异议处理、成交技巧，帮你把话术说到客户心里。',
    color: Color(0xFF2563EB),
    prompts: [
      '帮我设计一套客户开场话术',
      '如何处理客户说价格贵？',
      '帮我优化这段销售话术',
      '客户已读不回怎么跟进？',
    ],
  ),
  _UserWelcomeRole(
    icon: Icons.handshake_outlined,
    title: 'Hi，我是成交顾问',
    subtitle: '帮你拆解客户顾虑，生成更容易成交的沟通方案。',
    color: Color(0xFF059669),
    prompts: [
      '客户一直犹豫怎么推进成交？',
      '帮我写一段成交收口话术',
      '客户说再考虑下怎么回复？',
      '怎么把产品价值讲清楚？',
    ],
  ),
  _UserWelcomeRole(
    icon: Icons.record_voice_over_outlined,
    title: 'Hi，我是客户沟通教练',
    subtitle: '帮你把问题问准，把回复说顺，把客户重新聊回来。',
    color: Color(0xFF7C3AED),
    prompts: [
      '帮我分析客户这句话的真实顾虑',
      '怎么让客户愿意继续聊？',
      '帮我把回复说得更自然',
      '给我一套跟进节奏',
    ],
  ),
  _UserWelcomeRole(
    icon: Icons.edit_note_outlined,
    title: 'Hi，我是朋友圈文案助手',
    subtitle: '帮你写更有吸引力的朋友圈、私域转化和种草文案。',
    color: Color(0xFFEA580C),
    prompts: [
      '帮我写一条朋友圈成交文案',
      '把这段产品介绍改得更吸引人',
      '帮我设计三条私域种草内容',
      '朋友圈怎么写不硬广？',
    ],
  ),
  _UserWelcomeRole(
    icon: Icons.psychology_alt_outlined,
    title: 'Hi，我是异议处理专家',
    subtitle: '客户说贵、考虑下、不需要时，我帮你组织回应话术。',
    color: Color(0xFFDC2626),
    prompts: [
      '客户说太贵了怎么回答？',
      '客户说不需要怎么继续沟通？',
      '客户拿竞品对比怎么办？',
      '帮我整理常见异议回复',
    ],
  ),
  _UserWelcomeRole(
    icon: Icons.trending_up_outlined,
    title: 'Hi，我是复购增长顾问',
    subtitle: '帮你设计复购提醒、老客维护和业绩增长动作。',
    color: Color(0xFF0F766E),
    prompts: [
      '老客户多久跟进一次合适？',
      '帮我写复购提醒话术',
      '怎么做客户分层维护？',
      '帮我设计一周跟进计划',
    ],
  ),
];

_UserWelcomeRole _welcomeRoleForSession(String sessionId) {
  if (_welcomeRoles.isEmpty) {
    throw StateError('Welcome roles cannot be empty.');
  }
  final seed = sessionId.trim().isEmpty
      ? DateTime.now().millisecondsSinceEpoch
      : sessionId.hashCode.abs();
  return _welcomeRoles[seed % _welcomeRoles.length];
}

class _UserWelcomeEmptyState extends StatelessWidget {
  const _UserWelcomeEmptyState({
    required this.role,
    required this.onPromptSelected,
  });

  final _UserWelcomeRole role;
  final ValueChanged<String> onPromptSelected;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 520;
        return Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              compact ? 18 : 24,
              24,
              compact ? 18 : 24,
              42,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 620),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 320),
                    switchInCurve: Curves.easeOutCubic,
                    child: _SalesCoachFigure(
                      key: ValueKey(role.title),
                      role: role,
                      compact: compact,
                    ),
                  ),
                  SizedBox(height: compact ? 20 : 24),
                  Text(
                    role.title,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: const Color(0xFF0F172A),
                      fontSize: compact ? 24 : 30,
                      fontWeight: FontWeight.w800,
                      height: 1.18,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    role.subtitle,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: const Color(0xFF475569),
                      fontSize: compact ? 14.5 : 15.5,
                      height: 1.6,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  SizedBox(height: compact ? 18 : 22),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      for (final prompt in role.prompts.take(compact ? 3 : 4))
                        _WelcomePromptButton(
                          prompt: prompt,
                          color: role.color,
                          onPressed: () => onPromptSelected(prompt),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _SalesCoachFigure extends StatelessWidget {
  const _SalesCoachFigure({
    required this.role,
    required this.compact,
    super.key,
  });

  final _UserWelcomeRole role;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final size = compact ? 132.0 : 156.0;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 520),
      curve: Curves.easeOutBack,
      builder: (context, value, child) {
        return Opacity(
          opacity: value.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, 12 * (1 - value)),
            child: Transform.scale(scale: 0.92 + value * 0.08, child: child),
          ),
        );
      },
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      role.color.withValues(alpha: 0.16),
                      role.color.withValues(alpha: 0.06),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              top: size * 0.11,
              child: Container(
                width: size * 0.46,
                height: size * 0.46,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: role.color.withValues(alpha: 0.24),
                    width: 2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: role.color.withValues(alpha: 0.18),
                      blurRadius: 24,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Icon(role.icon, color: role.color, size: size * 0.24),
              ),
            ),
            Positioned(
              bottom: size * 0.16,
              child: Container(
                width: size * 0.68,
                height: size * 0.44,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      role.color.withValues(alpha: 0.92),
                      const Color(0xFF0F172A),
                    ],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: role.color.withValues(alpha: 0.22),
                      blurRadius: 28,
                      offset: const Offset(0, 14),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              right: size * 0.08,
              top: size * 0.22,
              child: _FigureBadge(color: role.color, label: '增长'),
            ),
            Positioned(
              left: size * 0.07,
              bottom: size * 0.22,
              child: _FigureBadge(color: role.color, label: '成交'),
            ),
          ],
        ),
      ),
    );
  }
}

class _FigureBadge extends StatelessWidget {
  const _FigureBadge({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.2)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _WelcomePromptButton extends StatelessWidget {
  const _WelcomePromptButton({
    required this.prompt,
    required this.color,
    required this.onPressed,
  });

  final String prompt;
  final Color color;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: const Color(0xFF0F172A),
        backgroundColor: Colors.white,
        side: BorderSide(color: color.withValues(alpha: 0.18)),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        textStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
      ),
      child: Text(prompt),
    );
  }
}

class _ConversationGroupTitle extends StatelessWidget {
  const _ConversationGroupTitle(this.title);

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 7, 8, 5),
      child: Text(
        title,
        style: const TextStyle(
          color: Color(0xFF64748B),
          fontSize: 13,
          fontWeight: FontWeight.w600,
          height: 1.2,
        ),
      ),
    );
  }
}

enum _ConversationMenuAction {
  share,
  startGroupChat,
  rename,
  togglePinned,
  archive,
  delete,
}

class _ConversationTile extends StatefulWidget {
  const _ConversationTile({
    required this.conversation,
    required this.conversationFeatures,
    required this.index,
    required this.onTap,
    required this.onMenuSelected,
  });

  final ChatConversationSummary conversation;
  final ConversationFeatureFlags conversationFeatures;
  final int index;
  final VoidCallback onTap;
  final ValueChanged<_ConversationMenuAction> onMenuSelected;

  @override
  State<_ConversationTile> createState() => _ConversationTileState();
}

class _ConversationTileState extends State<_ConversationTile> {
  bool _hovering = false;

  bool get _showsDesktopMenuButton {
    return !kIsWeb && defaultTargetPlatform == TargetPlatform.windows;
  }

  Future<void> _showMenuAt(Offset globalPosition) async {
    final overlay = Overlay.maybeOf(context)?.context.findRenderObject();
    if (overlay is! RenderBox) {
      return;
    }
    final action = await showMenu<_ConversationMenuAction>(
      context: context,
      color: Colors.white,
      elevation: 10,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      position: RelativeRect.fromLTRB(
        globalPosition.dx,
        globalPosition.dy,
        overlay.size.width - globalPosition.dx,
        overlay.size.height - globalPosition.dy,
      ),
      items: _conversationMenuItems(
        widget.conversation,
        widget.conversationFeatures,
      ),
    );
    if (action != null && mounted) {
      widget.onMenuSelected(action);
    }
  }

  Future<void> _showMenuFromButton(BuildContext buttonContext) async {
    final button = buttonContext.findRenderObject();
    if (button is! RenderBox) {
      return;
    }
    final origin = button.localToGlobal(Offset(button.size.width, 0));
    await _showMenuAt(origin);
  }

  @override
  Widget build(BuildContext context) {
    final conversation = widget.conversation;
    final showMenuButton =
        _showsDesktopMenuButton && (_hovering || conversation.selected);
    return MouseRegion(
      onEnter: _showsDesktopMenuButton
          ? (_) => setState(() => _hovering = true)
          : null,
      onExit: _showsDesktopMenuButton
          ? (_) => setState(() => _hovering = false)
          : null,
      child: GestureDetector(
        onSecondaryTapDown: _showsDesktopMenuButton
            ? (details) => _showMenuAt(details.globalPosition)
            : null,
        onLongPressStart: _showsDesktopMenuButton
            ? null
            : (details) => _showMenuAt(details.globalPosition),
        child: Material(
          color: conversation.selected
              ? const Color(0xFFEFF6FF)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: widget.onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: _conversationIconColor(
                      widget.index,
                      conversation.selected,
                    ),
                    child: Icon(
                      Icons.chat_bubble_outline,
                      size: 18,
                      color: conversation.selected
                          ? const Color(0xFF1D4ED8)
                          : const Color(0xFF475569),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Row(
                      children: [
                        if (conversation.pinned) ...[
                          const Icon(
                            Icons.push_pin,
                            size: 13,
                            color: Color(0xFF64748B),
                          ),
                          const SizedBox(width: 4),
                        ],
                        Expanded(
                          child: Text(
                            conversation.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _formatBeijingConversationTime(conversation.updatedAt),
                    style: const TextStyle(
                      color: Color(0xFF94A3B8),
                      fontSize: 11,
                    ),
                  ),
                  if (_showsDesktopMenuButton)
                    Visibility(
                      visible: showMenuButton,
                      maintainAnimation: true,
                      maintainSize: true,
                      maintainState: true,
                      child: Builder(
                        builder: (buttonContext) {
                          return IconButton(
                            tooltip: '更多',
                            visualDensity: VisualDensity.compact,
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints.tightFor(
                              width: 30,
                              height: 30,
                            ),
                            onPressed: () => _showMenuFromButton(
                              buttonContext,
                            ),
                            icon: const Icon(Icons.more_horiz, size: 18),
                            color: const Color(0xFF64748B),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

List<PopupMenuEntry<_ConversationMenuAction>> _conversationMenuItems(
  ChatConversationSummary conversation,
  ConversationFeatureFlags features,
) {
  return [
    _conversationMenuItem(
      action: _ConversationMenuAction.share,
      featureKey: ConversationFeatureKeys.share,
      features: features,
      icon: Icons.ios_share,
      label: '分享',
    ),
    _conversationMenuItem(
      action: _ConversationMenuAction.startGroupChat,
      featureKey: ConversationFeatureKeys.groupChat,
      features: features,
      icon: Icons.group_add_outlined,
      label: '开始群聊',
    ),
    _conversationMenuItem(
      action: _ConversationMenuAction.rename,
      featureKey: ConversationFeatureKeys.rename,
      features: features,
      icon: Icons.drive_file_rename_outline,
      label: '重命名',
    ),
    _conversationMenuItem(
      action: _ConversationMenuAction.togglePinned,
      icon: Icons.push_pin_outlined,
      label: conversation.pinned ? '取消置顶聊天' : '置顶聊天',
    ),
    _conversationMenuItem(
      action: _ConversationMenuAction.archive,
      featureKey: ConversationFeatureKeys.archive,
      features: features,
      icon: Icons.archive_outlined,
      label: '归档',
    ),
    const PopupMenuDivider(height: 6),
    _conversationMenuItem(
      action: _ConversationMenuAction.delete,
      featureKey: ConversationFeatureKeys.delete,
      features: features,
      icon: Icons.delete_outline,
      label: '删除',
      destructive: true,
    ),
  ];
}

PopupMenuEntry<_ConversationMenuAction> _conversationMenuItem({
  required _ConversationMenuAction action,
  required IconData icon,
  required String label,
  ConversationFeatureFlags? features,
  String? featureKey,
  bool destructive = false,
}) {
  final enabled =
      featureKey == null || (features?.isEnabled(featureKey) ?? false);
  return PopupMenuItem<_ConversationMenuAction>(
    enabled: enabled,
    value: enabled ? action : null,
    padding: EdgeInsets.zero,
    height: 42,
    child: _ConversationMenuItemRow(
      icon: icon,
      label: label,
      enabled: enabled,
      destructive: destructive && enabled,
      badge: enabled ? null : '未开放',
    ),
  );
}

class _ConversationMenuItemRow extends StatelessWidget {
  const _ConversationMenuItemRow({
    required this.icon,
    required this.label,
    this.enabled = true,
    this.destructive = false,
    this.badge,
  });

  final IconData icon;
  final String label;
  final bool enabled;
  final bool destructive;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final color = enabled
        ? (destructive ? const Color(0xFFDC2626) : const Color(0xFF0F172A))
        : const Color(0xFF94A3B8);

    return MouseRegion(
      cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 150, maxWidth: 190),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 19, color: color),
              const SizedBox(width: 12),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: color,
                    fontWeight: enabled ? FontWeight.w600 : FontWeight.w500,
                  ),
                ),
              ),
              if (badge != null) ...[
                const SizedBox(width: 12),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Text(
                    badge!,
                    style: const TextStyle(
                      color: Color(0xFF64748B),
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      height: 1,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _CloudConversationStatus extends StatelessWidget {
  const _CloudConversationStatus({
    required this.syncing,
    required this.message,
  });

  final bool syncing;
  final String? message;

  @override
  Widget build(BuildContext context) {
    final text = syncing ? '正在读取云端会话...' : message ?? '';
    if (text.trim().isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: syncing ? const Color(0xFFEFF6FF) : const Color(0xFFFFF7ED),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: syncing ? const Color(0xFFBFDBFE) : const Color(0xFFFED7AA),
        ),
      ),
      child: Row(
        children: [
          if (syncing)
            const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            const Icon(Icons.info_outline, size: 16, color: Color(0xFFEA580C)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color:
                    syncing ? const Color(0xFF1D4ED8) : const Color(0xFF9A3412),
                fontSize: 12,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DrawerUserFooter extends StatelessWidget {
  const _DrawerUserFooter({
    required this.userFuture,
    required this.avatarPreviewBytes,
    required this.avatarCacheToken,
    required this.onScan,
    required this.onNotifications,
    required this.onSettings,
  });

  final Future<Map<String, dynamic>> userFuture;
  final Uint8List? avatarPreviewBytes;
  final int avatarCacheToken;
  final VoidCallback onScan;
  final VoidCallback onNotifications;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Color(0xFFE2E8F0))),
        color: Colors.white,
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
        child: FutureBuilder<Map<String, dynamic>>(
          future: userFuture,
          builder: (context, snapshot) {
            final user = _extractUser(snapshot.data ?? const {});
            final account = _displayAccount(user);
            final name = _displayName(user);
            return Row(
              children: [
                _UserAvatar(
                  user: user,
                  radius: 20,
                  previewBytes: avatarPreviewBytes,
                  cacheToken: avatarCacheToken,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        account,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF64748B),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: '扫码',
                  onPressed: onScan,
                  icon: const Icon(Icons.qr_code_scanner, size: 20),
                ),
                IconButton(
                  tooltip: '通知',
                  onPressed: onNotifications,
                  icon: const Icon(Icons.notifications_none, size: 20),
                ),
                IconButton(
                  tooltip: '设置',
                  onPressed: onSettings,
                  icon: const Icon(Icons.settings_outlined, size: 20),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _UserSettingsSheet extends StatefulWidget {
  const _UserSettingsSheet({
    required this.apiService,
    required this.userFuture,
    required this.avatarPreviewBytes,
    required this.avatarCacheToken,
    required this.onAvatarUpdated,
    required this.onNameUpdated,
    required this.onLogout,
  });

  final ApiService apiService;
  final Future<Map<String, dynamic>> userFuture;
  final Uint8List? avatarPreviewBytes;
  final int avatarCacheToken;
  final void Function(Uint8List bytes, Map<String, dynamic> result)
      onAvatarUpdated;
  final ValueChanged<String> onNameUpdated;
  final VoidCallback onLogout;

  @override
  State<_UserSettingsSheet> createState() => _UserSettingsSheetState();
}

class _UserSettingsSheetState extends State<_UserSettingsSheet> {
  Uint8List? _avatarPreviewBytes;
  String? _localDisplayName;
  bool _savingAvatar = false;
  bool _checkingTestUpdate = false;

  @override
  void initState() {
    super.initState();
    _avatarPreviewBytes = widget.avatarPreviewBytes;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: widget.userFuture,
      builder: (context, snapshot) {
        final user = _extractUser(snapshot.data ?? const {});
        final displayName = _localDisplayName ?? _displayName(user);
        final account = _displayAccount(user);
        return SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            20,
            6,
            20,
            20 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  _UserAvatar(
                    user: user,
                    radius: 34,
                    previewBytes: _avatarPreviewBytes,
                    cacheToken: widget.avatarCacheToken,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          displayName,
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          account,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Color(0xFF64748B)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              _SettingsActionTile(
                icon: Icons.person_outline,
                title: '修改头像',
                subtitle: _savingAvatar ? '正在上传头像...' : '选择图片并上传到现有头像接口',
                onTap: _savingAvatar ? null : _pickAvatarPreview,
              ),
              _SettingsActionTile(
                icon: Icons.badge_outlined,
                title: '修改名称',
                subtitle: '修改名称接口待接入，当前仅本地预览',
                onTap: () => _showRenameDialog(context, displayName),
              ),
              _SettingsActionTile(
                icon: Icons.lock_outline,
                title: '修改密码',
                subtitle: '旧密码、新密码、确认新密码',
                onTap: () => _showPasswordDialog(context),
              ),
              _SettingsActionTile(
                icon: Icons.science_outlined,
                title: '检查测试版更新',
                subtitle: _checkingTestUpdate
                    ? '正在检查 GitHub user-test...'
                    : '查看当前测试版 buildNumber 和更新内容',
                onTap: _checkingTestUpdate ? null : _checkTestUpdate,
              ),
              _SettingsActionTile(
                icon: Icons.logout,
                title: '退出登录 / 切换账号',
                subtitle: '返回登录页，保留现有登录流程',
                onTap: widget.onLogout,
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _pickAvatarPreview() async {
    try {
      Object? pickedFile;
      if (!kIsWeb &&
          (defaultTargetPlatform == TargetPlatform.android ||
              defaultTargetPlatform == TargetPlatform.iOS)) {
        pickedFile = await image_picker.ImagePicker().pickImage(
          source: image_picker.ImageSource.gallery,
          imageQuality: 90,
        );
      } else {
        pickedFile = await file_selector.openFile(
          acceptedTypeGroups: const [
            file_selector.XTypeGroup(
              label: 'Images',
              extensions: ['jpg', 'jpeg', 'png', 'webp'],
            ),
          ],
        );
      }

      if (pickedFile == null) {
        _showSheetSnack('已取消选择头像');
        return;
      }

      final file = pickedFile as dynamic;
      final Uint8List bytes = await file.readAsBytes() as Uint8List;
      final String name = (file.name as String?)?.trim().isNotEmpty == true
          ? file.name as String
          : 'avatar-${DateTime.now().millisecondsSinceEpoch}.png';
      final String? mimeType = file.mimeType as String?;
      if (!mounted) {
        return;
      }
      setState(() {
        _avatarPreviewBytes = bytes;
        _savingAvatar = true;
      });

      final result = await widget.apiService.updateAvatar(
        UploadFile(name: name, bytes: bytes, mimeType: mimeType),
      );

      widget.onAvatarUpdated(bytes, result);
      _showSheetSnack('头像已更新');
    } catch (error) {
      await _showAvatarFailure(error);
    } finally {
      if (mounted) {
        setState(() => _savingAvatar = false);
      }
    }
  }

  Future<void> _showAvatarFailure(Object error) async {
    if (!mounted) {
      return;
    }

    final details = error is ApiException
        ? (error.debugDetails?.trim().isNotEmpty == true
            ? error.debugDetails!.trim()
            : 'statusCode=${error.statusCode ?? ''}\nmessage=${error.message}')
        : error.toString();
    final statusText = error is ApiException && error.statusCode != null
        ? '状态码：${error.statusCode}'
        : '请检查网络或稍后重试';

    debugPrint('Avatar upload failed:\n$details');
    _showSheetSnack('头像上传失败');

    await showDialog<void>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('头像上传失败'),
          content: Text('头像上传失败，请稍后重试。\n$statusText'),
          actions: [
            TextButton(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: details));
                Navigator.of(context).pop();
              },
              child: const Text('复制错误信息'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('知道了'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _showRenameDialog(
    BuildContext context,
    String currentName,
  ) async {
    final nameController = TextEditingController(text: currentName);
    String? errorText;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('修改名称'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '当前名称：$currentName',
                    style: const TextStyle(color: Color(0xFF64748B)),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: nameController,
                    autofocus: true,
                    maxLength: 20,
                    decoration: const InputDecoration(
                      labelText: '新名称',
                      helperText: '2-20 个字符',
                    ),
                  ),
                  if (errorText != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      errorText!,
                      style: const TextStyle(color: Color(0xFFB91C1C)),
                    ),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('取消'),
                ),
                FilledButton(
                  onPressed: () {
                    final nextName = nameController.text.trim();
                    if (nextName.isEmpty) {
                      setDialogState(() => errorText = '名称不能为空');
                      return;
                    }
                    if (nextName.length < 2 || nextName.length > 20) {
                      setDialogState(() => errorText = '名称长度需为 2-20 个字符');
                      return;
                    }
                    setState(() => _localDisplayName = nextName);
                    widget.onNameUpdated(nextName);
                    Navigator.of(dialogContext).pop();
                    _showSheetSnack('修改名称接口待接入，当前仅本地预览');
                  },
                  child: const Text('保存'),
                ),
              ],
            );
          },
        );
      },
    );

    nameController.dispose();
  }

  Future<void> _showPasswordDialog(BuildContext context) async {
    final oldPasswordController = TextEditingController();
    final newPasswordController = TextEditingController();
    final confirmPasswordController = TextEditingController();
    String? errorText;
    var saving = false;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('修改密码'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: oldPasswordController,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: '旧密码'),
                  ),
                  TextField(
                    controller: newPasswordController,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: '新密码'),
                  ),
                  TextField(
                    controller: confirmPasswordController,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: '确认新密码'),
                  ),
                  if (errorText != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      errorText!,
                      style: const TextStyle(color: Color(0xFFB91C1C)),
                    ),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('取消'),
                ),
                FilledButton(
                  onPressed: saving
                      ? null
                      : () async {
                          final oldPassword = oldPasswordController.text;
                          final newPassword = newPasswordController.text;
                          final confirmPassword =
                              confirmPasswordController.text;
                          if (oldPassword.isEmpty ||
                              newPassword.isEmpty ||
                              confirmPassword.isEmpty) {
                            setDialogState(() => errorText = '请完整填写密码信息');
                            return;
                          }
                          if (newPassword != confirmPassword) {
                            setDialogState(() => errorText = '两次新密码不一致');
                            return;
                          }

                          setDialogState(() {
                            saving = true;
                            errorText = null;
                          });
                          try {
                            await widget.apiService.changePassword(
                              currentPassword: oldPassword,
                              newPassword: newPassword,
                              confirmPassword: confirmPassword,
                            );
                            if (dialogContext.mounted) {
                              Navigator.of(dialogContext).pop();
                            }
                            _showSheetSnack('密码已修改');
                          } catch (error) {
                            setDialogState(() {
                              saving = false;
                              errorText = error.toString();
                            });
                          }
                        },
                  child: Text(saving ? '提交中...' : '确认'),
                ),
              ],
            );
          },
        );
      },
    );

    oldPasswordController.dispose();
    newPasswordController.dispose();
    confirmPasswordController.dispose();
  }

  Future<void> _checkTestUpdate() async {
    setState(() => _checkingTestUpdate = true);
    try {
      final result = await context.read<TestUpdateService>().checkForUpdate();
      if (!mounted) {
        return;
      }

      final manifest = result.manifest;
      if (result.shouldPrompt && manifest != null) {
        await showTestUpdateDialog(
          context,
          manifest: manifest,
          force: result.forceUpdate,
        );
      } else {
        await showNoTestUpdateDialog(context, result: result);
      }
    } catch (error) {
      debugPrint('User-test update check failed: $error');
      if (mounted) {
        await showTestUpdateFailedDialog(context, error: error);
      }
    } finally {
      if (mounted) {
        setState(() => _checkingTestUpdate = false);
      }
    }
  }

  void _showSheetSnack(String message) {
    if (!mounted) {
      return;
    }
    debugPrint(message);
    _showLocalActionHint(
      context,
      _compactHintText(message),
      error: _isErrorHint(message),
    );
  }
}

class _SettingsActionTile extends StatelessWidget {
  const _SettingsActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: const Color(0xFFF8FAFC),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      child: ListTile(
        enabled: onTap != null,
        leading: Icon(icon, color: const Color(0xFF0F172A)),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class _UserAvatar extends StatelessWidget {
  const _UserAvatar({
    required this.user,
    required this.radius,
    this.previewBytes,
    this.cacheToken = 0,
  });

  final Map<String, dynamic> user;
  final double radius;
  final Uint8List? previewBytes;
  final int cacheToken;

  @override
  Widget build(BuildContext context) {
    final avatarUrl = _avatarUrl(user);
    final name = _displayName(user);
    ImageProvider? image;
    if (previewBytes != null) {
      image = MemoryImage(previewBytes!);
    } else if (avatarUrl.isNotEmpty) {
      image = _avatarImageProvider(avatarUrl, cacheToken);
    }

    return CircleAvatar(
      radius: radius,
      backgroundColor: const Color(0xFFE2E8F0),
      backgroundImage: image,
      child: image == null
          ? Text(
              _avatarInitial(name),
              style: TextStyle(
                color: const Color(0xFF0F172A),
                fontWeight: FontWeight.w800,
                fontSize: radius * 0.62,
              ),
            )
          : null,
    );
  }
}

class _PendingAttachment {
  const _PendingAttachment({
    required this.id,
    required this.sourceLabel,
    required this.attachment,
  });

  final String id;
  final String sourceLabel;
  final ChatAttachment attachment;
}

class _PendingAttachmentTray extends StatelessWidget {
  const _PendingAttachmentTray({
    required this.attachments,
    required this.onRemove,
  });

  final List<_PendingAttachment> attachments;
  final void Function(String id, BuildContext actionContext) onRemove;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final pending in attachments)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _PendingAttachmentChip(
                  pending: pending,
                  onRemove: (actionContext) =>
                      onRemove(pending.id, actionContext),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _PendingAttachmentChip extends StatelessWidget {
  const _PendingAttachmentChip({required this.pending, required this.onRemove});

  final _PendingAttachment pending;
  final ValueChanged<BuildContext> onRemove;

  @override
  Widget build(BuildContext context) {
    final attachment = pending.attachment;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: attachment.isImage ? 116 : 210,
          height: 74,
          padding: EdgeInsets.all(attachment.isImage ? 0 : 10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: attachment.isImage
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(13),
                  child: attachment.bytes == null
                      ? const ColoredBox(
                          color: Color(0xFFF1F5F9),
                          child: Center(
                            child: Icon(
                              Icons.image_outlined,
                              color: Color(0xFF64748B),
                            ),
                          ),
                        )
                      : Image.memory(
                          attachment.bytes!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              const _ImagePreviewFallback(size: Size(116, 74)),
                        ),
                )
              : Row(
                  children: [
                    const Icon(
                      Icons.insert_drive_file_outlined,
                      color: Color(0xFF475569),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            attachment.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            [
                              if (attachment.size != null)
                                _formatBytes(attachment.size!),
                              attachment.status,
                            ].join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Color(0xFF64748B),
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
        ),
        Positioned(
          right: -6,
          top: -6,
          child: Material(
            color: const Color(0xFF0F172A),
            shape: const CircleBorder(),
            child: Builder(
              builder: (actionContext) {
                return InkWell(
                  customBorder: const CircleBorder(),
                  onTap: () => onRemove(actionContext),
                  child: const Padding(
                    padding: EdgeInsets.all(4),
                    child: Icon(Icons.close, color: Colors.white, size: 14),
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

class _AttachmentPreviewList extends StatelessWidget {
  const _AttachmentPreviewList({
    required this.attachments,
    required this.isUser,
  });

  final List<ChatAttachment> attachments;
  final bool isUser;

  @override
  Widget build(BuildContext context) {
    final images = attachments.where((item) => item.isImage).toList();
    final files = attachments.where((item) => !item.isImage).toList();
    final compactImages = images.length > 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (images.isNotEmpty)
          Padding(
            padding: EdgeInsets.only(bottom: files.isEmpty ? 0 : 8),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final attachment in images)
                  _ImageAttachmentPreview(
                    attachment: attachment,
                    compact: compactImages,
                  ),
              ],
            ),
          ),
        for (final attachment in files)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _FileAttachmentPreview(
              attachment: attachment,
              isUser: isUser,
            ),
          ),
      ],
    );
  }
}

class _ImageAttachmentPreview extends StatelessWidget {
  const _ImageAttachmentPreview({
    required this.attachment,
    required this.compact,
  });

  final ChatAttachment attachment;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final size = _imagePreviewSize(context, compact: compact);
    final image = _attachmentImage(
      attachment: attachment,
      width: size.width,
      height: size.height,
      fit: BoxFit.cover,
      fallback: _ImagePreviewFallback(size: size),
    );

    return Tooltip(
      message: '点击预览',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _openImagePreview(context, attachment),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                border: Border.all(color: const Color(0xFFE2E8F0)),
                borderRadius: BorderRadius.circular(14),
              ),
              child: image,
            ),
          ),
        ),
      ),
    );
  }
}

class _ImagePreviewFallback extends StatelessWidget {
  const _ImagePreviewFallback({required this.size});

  final Size size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size.width,
      height: size.height,
      child: const Center(
        child: Text(
          '图片已上传，预览失败',
          style: TextStyle(color: Color(0xFF64748B)),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

class _ImagePreviewDialog extends StatelessWidget {
  const _ImagePreviewDialog({required this.attachment});

  final ChatAttachment attachment;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.78),
      child: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => Navigator.of(context).pop(),
              child: const SizedBox.expand(),
            ),
          ),
          SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: InteractiveViewer(
                  minScale: 0.7,
                  maxScale: 4,
                  child: GestureDetector(
                    onTap: () {},
                    child: _attachmentImage(
                      attachment: attachment,
                      fit: BoxFit.contain,
                      fallback: const _LargeImagePreviewFallback(),
                    ),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            top: 16,
            right: 16,
            child: SafeArea(
              child: Material(
                color: Colors.black.withValues(alpha: 0.5),
                shape: const CircleBorder(),
                child: IconButton(
                  tooltip: '关闭',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close, color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LargeImagePreviewFallback extends StatelessWidget {
  const _LargeImagePreviewFallback();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 260,
      height: 180,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white24),
      ),
      child: const Text('图片预览失败', style: TextStyle(color: Colors.white70)),
    );
  }
}

class _FileAttachmentPreview extends StatelessWidget {
  const _FileAttachmentPreview({
    required this.attachment,
    required this.isUser,
  });

  final ChatAttachment attachment;
  final bool isUser;

  @override
  Widget build(BuildContext context) {
    final meta = [
      if ((attachment.mimeType ?? '').isNotEmpty) attachment.mimeType!,
      if (attachment.size != null) _formatBytes(attachment.size!),
    ].join(' · ');

    final card = Container(
      constraints: const BoxConstraints(maxWidth: 320),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isUser
            ? Colors.white.withValues(alpha: 0.08)
            : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isUser ? Colors.white24 : const Color(0xFFE2E8F0),
        ),
      ),
      child: Row(
        children: [
          Icon(
            Icons.insert_drive_file_outlined,
            color: isUser ? Colors.white : const Color(0xFF475569),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  attachment.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: isUser ? Colors.white : const Color(0xFF0F172A),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  meta.isEmpty
                      ? attachment.status
                      : '$meta · ${attachment.status}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: isUser ? Colors.white70 : const Color(0xFF64748B),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );

    final url = attachment.url?.trim() ?? '';
    if (url.isEmpty) {
      return card;
    }

    return Tooltip(
      message: '打开附件',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _openAttachmentUrl(context, url),
          child: card,
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    this.onRetry,
    this.onCancel,
    this.onEdit,
  });

  final ChatMessage message;
  final VoidCallback? onRetry;
  final VoidCallback? onCancel;
  final bool Function(BuildContext actionContext)? onEdit;

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == ChatRole.user;
    final bubbleColor = isUser ? const Color(0xFF0F172A) : Colors.white;
    final textColor = isUser ? Colors.white : const Color(0xFF0F172A);
    final time = _formatTime(message.createdAt);
    final isThinking = !isUser &&
        message.status == ChatMessageStatus.sending &&
        message.content.trim().isEmpty;

    final visibleContent = _visibleMessageContent(message);

    return GestureDetector(
      onLongPress: () {
        if (_copyMessage(context)) {
          _showLocalActionHint(context, '✅ 已复制');
        }
      },
      child: Align(
        alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.sizeOf(context).width *
                _messageMaxWidthFactor(context, isUser),
          ),
          child: Container(
            width: isUser ? null : double.infinity,
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
              border:
                  isUser ? null : Border.all(color: const Color(0xFFE2E8F0)),
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
                if (isUser && message.attachments.isNotEmpty) ...[
                  _AttachmentPreviewList(
                    attachments: message.attachments,
                    isUser: isUser,
                  ),
                  if (visibleContent.isNotEmpty) const SizedBox(height: 10),
                ],
                if (isThinking)
                  ThinkingIndicator(onCancel: onCancel)
                else if (visibleContent.isNotEmpty)
                  isUser
                      ? ChatMarkdownView(
                          data: visibleContent,
                          isUser: true,
                          textColor: textColor,
                          streaming: message.isStreaming,
                          bodyFontSize: _userPromptFontSize(context),
                        )
                      : AssistantAnswerCard(
                          data: visibleContent,
                          streaming: message.isStreaming,
                          bodyFontSize: _assistantAnswerFontSize(context),
                        ),
                if (!isUser && message.attachments.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  _AttachmentPreviewList(
                    attachments: message.attachments,
                    isUser: isUser,
                  ),
                ],
                const SizedBox(height: 6),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '$time · ${_statusLabel(message.status, message.isStreaming)}',
                      style: TextStyle(
                        color:
                            isUser ? Colors.white70 : const Color(0xFF64748B),
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
                if (isUser) ...[
                  const SizedBox(height: 6),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _CompactMessageAction(
                        tooltip: '复制',
                        icon: Icons.copy_outlined,
                        foregroundColor: Colors.white70,
                        successHint: '✅ 已复制',
                        onPressed: _copyMessage,
                      ),
                      if (onEdit != null) ...[
                        const SizedBox(width: 2),
                        _CompactMessageAction(
                          tooltip: '编辑',
                          icon: Icons.edit_outlined,
                          foregroundColor: Colors.white70,
                          successHint: '✏️ 已编辑',
                          onPressed: onEdit!,
                        ),
                      ],
                    ],
                  ),
                ],
                if (!isUser &&
                    message.isStreaming &&
                    message.content.trim().isNotEmpty &&
                    onCancel != null) ...[
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
                  Builder(
                    builder: (copyContext) {
                      return TextButton.icon(
                        onPressed: () {
                          if (_copyMessage(copyContext)) {
                            _showLocalActionHint(copyContext, '✅ 已复制');
                          }
                        },
                        icon: const Icon(Icons.copy, size: 16),
                        label: const Text('复制'),
                      );
                    },
                  ),
                ],
                if (isUser &&
                    message.status == ChatMessageStatus.error &&
                    onRetry != null) ...[
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

  bool _copyMessage(BuildContext context) {
    final text = _visibleMessageContent(message);
    final copyText = text.isNotEmpty
        ? text
        : message.attachments.map((item) => item.name).join('、').trim();
    if (copyText.isEmpty) {
      _showLocalActionHint(context, '无文字', error: true);
      return false;
    }

    Clipboard.setData(ClipboardData(text: copyText));
    return true;
  }
}

class _CompactMessageAction extends StatelessWidget {
  const _CompactMessageAction({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
    required this.foregroundColor,
    this.successHint,
  });

  final String tooltip;
  final IconData icon;
  final bool Function(BuildContext actionContext) onPressed;
  final Color foregroundColor;
  final String? successHint;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkResponse(
        onTap: () {
          final ok = onPressed(context);
          if (ok && successHint != null) {
            _showLocalActionHint(context, successHint!);
          }
        },
        radius: 16,
        child: Padding(
          padding: const EdgeInsets.all(5),
          child: Icon(icon, size: 16, color: foregroundColor),
        ),
      ),
    );
  }
}

String _visibleMessageContent(ChatMessage message) {
  if (_isAttachmentOnlyMessage(message.content, message.attachments)) {
    return '';
  }
  return message.content.trim();
}

bool _isAttachmentOnlyMessage(
  String content,
  List<ChatAttachment> attachments,
) {
  if (attachments.isEmpty) {
    return false;
  }
  return content.trim() == _attachmentOnlyContent(attachments);
}

String _attachmentOnlyContent(List<ChatAttachment> attachments) {
  if (attachments.isEmpty) {
    return '';
  }
  final names = attachments.map((item) => item.name).join('、');
  return '已上传附件：$names';
}

double _messageMaxWidthFactor(BuildContext context, bool isUser) {
  if (!isUser) {
    return 0.92;
  }
  final width = MediaQuery.sizeOf(context).width;
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 0.82;
  }
  if (width < 700) {
    return 0.84;
  }
  return 0.54;
}

double _userPromptFontSize(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 15.5;
  }
  return width < 700 ? 15 : 14.5;
}

double _assistantAnswerFontSize(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 15.5;
  }
  return width < 700 ? 15.2 : 15;
}

Size _imagePreviewSize(BuildContext context, {required bool compact}) {
  final width = MediaQuery.sizeOf(context).width;
  final mobile = (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) ||
      width < 700;
  if (compact) {
    return mobile ? const Size(118, 92) : const Size(140, 104);
  }
  return mobile ? const Size(184, 136) : const Size(206, 148);
}

Widget _attachmentImage({
  required ChatAttachment attachment,
  double? width,
  double? height,
  BoxFit fit = BoxFit.contain,
  required Widget fallback,
}) {
  if (attachment.bytes != null) {
    return Image.memory(
      attachment.bytes!,
      width: width,
      height: height,
      fit: fit,
      errorBuilder: (_, __, ___) => fallback,
    );
  }
  final url = attachment.url?.trim() ?? '';
  if (url.isNotEmpty) {
    return Image.network(
      url,
      width: width,
      height: height,
      fit: fit,
      errorBuilder: (_, __, ___) => fallback,
    );
  }
  return fallback;
}

Future<void> _openImagePreview(
  BuildContext context,
  ChatAttachment attachment,
) {
  return showDialog<void>(
    context: context,
    barrierColor: Colors.transparent,
    builder: (context) => _ImagePreviewDialog(attachment: attachment),
  );
}

Future<void> _openAttachmentUrl(BuildContext context, String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null || !uri.hasScheme) {
    await _showAttachmentOpenError(context);
    return;
  }

  try {
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && context.mounted) {
      await _showAttachmentOpenError(context);
    }
  } catch (_) {
    if (context.mounted) {
      await _showAttachmentOpenError(context);
    }
  }
}

Future<void> _showAttachmentOpenError(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('附件打开失败'),
      content: const Text('当前附件地址暂时无法打开，请稍后重试。'),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('知道了'),
        ),
      ],
    ),
  );
}

Map<String, dynamic> _extractUser(Map<String, dynamic> data) {
  final user = data['user'];
  if (user is Map<String, dynamic>) {
    return user;
  }
  if (user is Map) {
    return user.map((key, value) => MapEntry(key?.toString() ?? '', value));
  }
  return data;
}

String _displayName(Map<String, dynamic> user) {
  for (final key in ['name', 'nickname', 'displayName', 'phone', 'email']) {
    final value = user[key];
    if (value is String &&
        value.trim().isNotEmpty &&
        !_isPlaceholderUserValue(value)) {
      return _normalizeAccount(value);
    }
  }
  return '当前用户';
}

String _displayAccount(Map<String, dynamic> user) {
  for (final key in ['phone', 'account', 'email', 'username', 'name']) {
    final value = user[key];
    if (value is String &&
        value.trim().isNotEmpty &&
        !_isPlaceholderUserValue(value)) {
      return _normalizeAccount(value);
    }
  }
  return '未登录用户';
}

String _normalizeAccount(String account) {
  final trimmed = account.trim();
  if (trimmed.startsWith('+86')) {
    return trimmed.substring(3).trimLeft();
  }
  return trimmed;
}

String _avatarUrl(Map<String, dynamic> user) {
  for (final key in ['avatar', 'avatarUrl', 'avatar_url', 'image']) {
    final value = user[key];
    if (value is String &&
        value.trim().isNotEmpty &&
        (value.startsWith('http://') ||
            value.startsWith('https://') ||
            value.startsWith('data:') ||
            value.startsWith('mock-avatar://'))) {
      return value.trim();
    }
  }
  return '';
}

bool _isPlaceholderUserValue(String value) {
  final normalized = value.trim();
  return normalized == '本地演示用户' || normalized == 'mock-user';
}

bool _isImageUpload(String label, String? mimeType, String name) {
  final lowerName = name.toLowerCase();
  final lowerMime = (mimeType ?? '').toLowerCase();
  return label.contains('图片') ||
      lowerMime.startsWith('image/') ||
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg') ||
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.webp') ||
      lowerName.endsWith('.gif');
}

String? _extractUploadUrl(Map<String, dynamic> result) {
  for (final key in [
    'url',
    'file_url',
    'fileUrl',
    'download_url',
    'downloadUrl',
  ]) {
    final value = result[key];
    if (value is String && value.trim().isNotEmpty) {
      return value.trim();
    }
  }

  for (final key in ['attachment', 'file', 'data']) {
    final value = result[key];
    if (value is Map<String, dynamic>) {
      final nested = _extractUploadUrl(value);
      if (nested != null) {
        return nested;
      }
    } else if (value is Map) {
      final nested = _extractUploadUrl(
        value.map(
          (itemKey, itemValue) =>
              MapEntry(itemKey?.toString() ?? '', itemValue),
        ),
      );
      if (nested != null) {
        return nested;
      }
    }
  }

  return null;
}

String _extractAvatarUrlFromResult(Map<String, dynamic> result) {
  for (final key in ['avatarUrl', 'avatar_url', 'avatar', 'url']) {
    final value = result[key];
    if (value is String && value.trim().isNotEmpty) {
      return value.trim();
    }
  }

  for (final key in ['user', 'data']) {
    final value = result[key];
    if (value is Map<String, dynamic>) {
      final nested = _extractAvatarUrlFromResult(value);
      if (nested.isNotEmpty) {
        return nested;
      }
    } else if (value is Map) {
      final nested = _extractAvatarUrlFromResult(
        value.map(
          (itemKey, itemValue) =>
              MapEntry(itemKey?.toString() ?? '', itemValue),
        ),
      );
      if (nested.isNotEmpty) {
        return nested;
      }
    }
  }

  return '';
}

String _cacheBustedUrl(String url, int token) {
  if (token <= 0 ||
      url.startsWith('mock-avatar://') ||
      url.startsWith('data:') ||
      url.startsWith('blob:')) {
    return url;
  }

  final separator = url.contains('?') ? '&' : '?';
  return '$url${separator}t=$token';
}

ImageProvider? _avatarImageProvider(String url, int cacheToken) {
  final trimmed = url.trim();
  if (trimmed.isEmpty || trimmed.startsWith('mock-avatar://')) {
    return null;
  }

  if (trimmed.startsWith('data:')) {
    final commaIndex = trimmed.indexOf(',');
    if (commaIndex <= 0 || commaIndex >= trimmed.length - 1) {
      return null;
    }
    final metadata = trimmed.substring(0, commaIndex).toLowerCase();
    final payload = trimmed.substring(commaIndex + 1);
    try {
      final bytes = metadata.contains(';base64')
          ? base64Decode(payload)
          : utf8.encode(Uri.decodeComponent(payload));
      return MemoryImage(Uint8List.fromList(bytes));
    } catch (error) {
      debugPrint('Avatar data URL decode failed: $error');
      return null;
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return NetworkImage(_cacheBustedUrl(trimmed, cacheToken));
  }

  return null;
}

String _avatarInitial(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) {
    return 'AI';
  }
  return trimmed.characters.first.toUpperCase();
}

Color _conversationIconColor(int index, bool selected) {
  if (selected) {
    return const Color(0xFFDBEAFE);
  }
  const colors = [
    Color(0xFFE0F2FE),
    Color(0xFFEDE9FE),
    Color(0xFFDCFCE7),
    Color(0xFFFFF7ED),
  ];
  return colors[index % colors.length];
}

DateTime _toBeijingTime(DateTime value) {
  return value.toUtc().add(const Duration(hours: 8));
}

String _formatBeijingConversationTime(DateTime time) {
  final beijingTime = _toBeijingTime(time);
  final beijingNow = _toBeijingTime(DateTime.now());
  final beijingDate = DateTime.utc(
    beijingTime.year,
    beijingTime.month,
    beijingTime.day,
  );
  final today = DateTime.utc(
    beijingNow.year,
    beijingNow.month,
    beijingNow.day,
  );
  final dayDelta = today.difference(beijingDate).inDays;
  if (dayDelta == 0) {
    final hour = beijingTime.hour.toString().padLeft(2, '0');
    final minute = beijingTime.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }
  if (dayDelta == 1) {
    return '昨天';
  }
  final month = beijingTime.month.toString().padLeft(2, '0');
  final day = beijingTime.day.toString().padLeft(2, '0');
  if (beijingTime.year == beijingNow.year) {
    return '$month-$day';
  }
  final year = beijingTime.year.toString().padLeft(4, '0');
  return '$year-$month-$day';
}

String _formatBytes(int bytes) {
  if (bytes < 1024) {
    return '$bytes B';
  }
  final kb = bytes / 1024;
  if (kb < 1024) {
    return '${kb.toStringAsFixed(kb >= 100 ? 0 : 1)} KB';
  }
  final mb = kb / 1024;
  return '${mb.toStringAsFixed(mb >= 100 ? 0 : 1)} MB';
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
