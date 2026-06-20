const conversationFeatureShareKey = 'conversation.share.enabled';
const conversationFeatureGroupChatKey = 'conversation.group_chat.enabled';
const conversationFeatureRenameKey = 'conversation.rename.enabled';
const conversationFeatureArchiveKey = 'conversation.archive.enabled';
const conversationFeatureDeleteKey = 'conversation.delete.enabled';
const conversationFeaturePinCloudSyncKey =
    'conversation.pin.cloud_sync_enabled';

const conversationFeatureDisabledValues = <String, bool>{
  conversationFeatureShareKey: false,
  conversationFeatureGroupChatKey: false,
  conversationFeatureRenameKey: false,
  conversationFeatureArchiveKey: false,
  conversationFeatureDeleteKey: false,
  conversationFeaturePinCloudSyncKey: false,
};

const conversationShareUrlKeys = <String>[
  'shareUrl',
  'share_url',
  'shareLink',
  'share_link',
  'link',
  'url',
];

const conversationGroupInviteUrlKeys = <String>[
  'inviteUrl',
  'invite_url',
  'inviteLink',
  'invite_link',
  'groupLink',
  'group_link',
  'groupChatLink',
  'group_chat_link',
  'shareUrl',
  'share_url',
  'link',
  'url',
  'joinUrl',
  'join_url',
  'joinLink',
  'join_link',
];

const conversationGroupIdKeys = <String>[
  'groupChatId',
  'group_chat_id',
  'groupId',
  'group_id',
  'conversationId',
  'conversation_id',
];

Map<String, bool> parseConversationFeatureValues(Object? data) {
  return Map.unmodifiable(<String, bool>{
    conversationFeatureShareKey: conversationFeatureEnabled(
      _featureFlagValue(data, const [
        conversationFeatureShareKey,
        'features.conversation.share.enabled',
        'data.features.conversation.share.enabled',
        'data.conversation.share.enabled',
        'success.data.features.conversation.share.enabled',
        'success.data.conversation.share.enabled',
        'success.data.share',
        'result.features.conversation.share.enabled',
        'result.conversation.share.enabled',
        'result.share',
        'data.share',
        'share',
        'shareEnabled',
        'share_enabled',
        'canShare',
        'can_share',
      ]),
    ),
    conversationFeatureGroupChatKey: conversationFeatureEnabled(
      _featureFlagValue(data, const [
        conversationFeatureGroupChatKey,
        'groupChat',
        'group_chat',
        'groupChatEnabled',
        'group_chat_enabled',
        'canGroupChat',
        'can_group_chat',
      ]),
    ),
    conversationFeatureRenameKey: conversationFeatureEnabled(
      _featureFlagValue(data, const [
        conversationFeatureRenameKey,
        'rename',
        'renameEnabled',
        'rename_enabled',
        'canRename',
        'can_rename',
      ]),
    ),
    conversationFeatureArchiveKey: conversationFeatureEnabled(
      _featureFlagValue(data, const [
        conversationFeatureArchiveKey,
        'archive',
        'archiveEnabled',
        'archive_enabled',
        'canArchive',
        'can_archive',
      ]),
    ),
    conversationFeatureDeleteKey: conversationFeatureEnabled(
      _featureFlagValue(data, const [
        conversationFeatureDeleteKey,
        'delete',
        'deleteEnabled',
        'delete_enabled',
        'canDelete',
        'can_delete',
      ]),
    ),
    conversationFeaturePinCloudSyncKey: conversationFeatureEnabled(
      _featureFlagValue(data, const [
        conversationFeaturePinCloudSyncKey,
        'conversation.pin_cloud_sync_enabled',
        'pinCloudSync',
        'pin_cloud_sync',
        'pinCloudSyncEnabled',
        'pin_cloud_sync_enabled',
        'canSyncPinned',
        'can_sync_pinned',
      ]),
    ),
  });
}

bool conversationFeatureEnabled(Object? value) {
  if (value is bool) {
    return value;
  }
  if (value is num) {
    return value == 1;
  }
  if (value is Map || value is List) {
    return conversationFeatureEnabled(_featureFlagValue(value, const [
      'enabled',
      'value',
    ]));
  }
  return const {'true', '1', 'yes', 'on', 'enabled', 'open'}
      .contains(_stringValue(value).toLowerCase());
}

String conversationFeatureMessage(Map<String, dynamic> data) {
  for (final key in const ['message', 'msg', 'reason', 'tips']) {
    final value = _stringValue(data[key]);
    if (value.isNotEmpty) {
      return value;
    }
  }
  return '';
}

String conversationActionFailureMessage(
  int statusCode,
  Map<String, dynamic> envelope, {
  required String unauthenticatedMessage,
  required String forbiddenMessage,
  required String notFoundMessage,
  required String methodNotAllowedMessage,
}) {
  return switch (statusCode) {
    401 => unauthenticatedMessage,
    403 => forbiddenMessage,
    404 => notFoundMessage,
    405 => methodNotAllowedMessage,
    >= 500 => '服务器异常，请稍后重试',
    _ => conversationMessageFromEnvelope(envelope, '操作失败，请稍后重试'),
  };
}

String conversationMessageFromEnvelope(
  Map<String, dynamic> envelope,
  String fallback,
) {
  for (final key in const ['message', 'msg', 'error', 'reason']) {
    final value = _stringValue(envelope[key]);
    if (value.isNotEmpty) {
      return value;
    }
  }
  return fallback;
}

String extractShareUrl(Object? value) {
  return extractConversationActionUrl(value, conversationShareUrlKeys);
}

String extractGroupChatInviteUrl(Object? value) {
  return extractConversationActionUrl(value, conversationGroupInviteUrlKeys);
}

String extractConversationActionUrl(
  Object? value,
  List<String> keys, {
  int depth = 0,
}) {
  if (value == null || depth > 4) {
    return '';
  }
  if (value is Map) {
    for (final key in keys) {
      final raw = value[key];
      if (raw is String && isHttpConversationActionUrl(raw)) {
        return raw.trim();
      }
    }
    for (final item in value.values) {
      final nested = extractConversationActionUrl(
        item,
        keys,
        depth: depth + 1,
      );
      if (nested.isNotEmpty) {
        return nested;
      }
    }
  }
  if (value is List) {
    for (final item in value) {
      final nested = extractConversationActionUrl(
        item,
        keys,
        depth: depth + 1,
      );
      if (nested.isNotEmpty) {
        return nested;
      }
    }
  }
  return '';
}

String extractConversationActionString(
  Object? value,
  List<String> keys, {
  int depth = 0,
}) {
  if (value == null || depth > 4) {
    return '';
  }
  if (value is Map) {
    for (final key in keys) {
      final raw = value[key];
      if (raw is String && raw.trim().isNotEmpty) {
        return raw.trim();
      }
    }
    for (final item in value.values) {
      final nested = extractConversationActionString(
        item,
        keys,
        depth: depth + 1,
      );
      if (nested.isNotEmpty) {
        return nested;
      }
    }
  }
  if (value is List) {
    for (final item in value) {
      final nested = extractConversationActionString(
        item,
        keys,
        depth: depth + 1,
      );
      if (nested.isNotEmpty) {
        return nested;
      }
    }
  }
  return '';
}

bool isHttpConversationActionUrl(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return false;
  }
  final uri = Uri.tryParse(trimmed);
  if (uri == null || !uri.hasScheme) {
    return false;
  }
  final scheme = uri.scheme.toLowerCase();
  return scheme == 'http' || scheme == 'https';
}

String buildGroupChatNoInviteMessage(Map<String, dynamic> data) {
  final id = extractConversationActionString(data, conversationGroupIdKeys);
  final buffer = StringBuffer()
    ..writeln('服务器已创建群聊，但没有返回邀请链接。')
    ..writeln('请联系管理员检查 group-chat 接口返回字段。')
    ..write(
        '用户端支持 inviteUrl、inviteLink、groupLink、shareUrl、joinUrl、link、url 等字段。');
  if (id.isNotEmpty) {
    buffer
      ..writeln()
      ..write('群聊 ID：$id');
  }
  return buffer.toString();
}

Object? _featureFlagValue(
  Object? source,
  List<String> aliases, {
  int depth = 0,
}) {
  if (source == null || depth > 4) {
    return null;
  }

  if (source is List) {
    for (final item in source) {
      final map = _asStringKeyMap(item);
      final key = _stringValue(
        map['key'] ??
            map['name'] ??
            map['code'] ??
            map['permission'] ??
            map['feature'],
      );
      if (aliases.contains(key)) {
        return map['enabled'] ??
            map['value'] ??
            map['active'] ??
            map['status'] ??
            map['state'];
      }

      final nested = _featureFlagValue(item, aliases, depth: depth + 1);
      if (nested != null) {
        return nested;
      }
    }
    return null;
  }

  final map = _asStringKeyMap(source);
  if (map.isEmpty) {
    return null;
  }

  for (final alias in aliases) {
    final pathValue = _featurePathValue(source, alias);
    if (pathValue != null) {
      return pathValue;
    }
    if (map.containsKey(alias)) {
      return map[alias];
    }
  }

  for (final value in map.values) {
    if (value is Map || value is List) {
      final nested = _featureFlagValue(value, aliases, depth: depth + 1);
      if (nested != null) {
        return nested;
      }
    }
  }

  return null;
}

Object? _featurePathValue(Object? source, String path) {
  if (!path.contains('.')) {
    return null;
  }

  Object? current = source;
  for (final segment in path.split('.')) {
    final map = _asStringKeyMap(current);
    if (map.isEmpty || !map.containsKey(segment)) {
      return null;
    }
    current = map[segment];
  }
  return current;
}

Map<String, dynamic> _asStringKeyMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map) {
    return value.map((key, item) => MapEntry(key?.toString() ?? '', item));
  }
  return const <String, dynamic>{};
}

String _stringValue(Object? value) {
  if (value == null) {
    return '';
  }
  if (value is String) {
    return value.trim();
  }
  return value.toString().trim();
}
