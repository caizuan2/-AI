import 'dart:async';
import 'dart:convert';

import 'package:ai_knowledge_flutter_app/core/api/api_service.dart';
import 'package:ai_knowledge_flutter_app/core/api/conversation_actions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('conversation feature flags', () {
    test('share enabled makes the share menu logically clickable', () {
      final flags = ConversationFeatureFlags(
        values: parseConversationFeatureValues({
          'conversation.share.enabled': true,
        }),
        loaded: true,
      );

      expect(flags.isEnabled(ConversationFeatureKeys.share), isTrue);
    });

    test('share enabled supports result feature map and enabled-like values',
        () {
      final flags = ConversationFeatureFlags(
        values: parseConversationFeatureValues({
          'result': {
            'features': {
              'conversation.share.enabled': 1,
            },
          },
        }),
        loaded: true,
      );

      expect(flags.isEnabled(ConversationFeatureKeys.share), isTrue);
    });

    test('share enabled supports compact backend feature aliases', () {
      final flags = ConversationFeatureFlags(
        values: parseConversationFeatureValues({
          'data': {
            'featureFlags': {
              'share': 'enabled',
            },
          },
        }),
        loaded: true,
      );

      expect(flags.isEnabled(ConversationFeatureKeys.share), isTrue);
    });

    test('share falls back to action endpoint when other actions are enabled',
        () {
      final flags = ConversationFeatureFlags(
        values: parseConversationFeatureValues({
          'groupChat': true,
          'rename': true,
          'archive': true,
          'delete': true,
        }),
        loaded: true,
      );

      expect(flags.isEnabled(ConversationFeatureKeys.share), isTrue);
    });

    test('share true alias wins when backend also includes stale share false',
        () {
      final flags = ConversationFeatureFlags(
        values: parseConversationFeatureValues({
          'share': false,
          'canShare': true,
        }),
        loaded: true,
      );

      expect(flags.isEnabled(ConversationFeatureKeys.share), isTrue);
    });

    test('share enabled supports array feature rows with uppercase key', () {
      final flags = ConversationFeatureFlags(
        values: parseConversationFeatureValues({
          'features': [
            {'key': 'SHARE', 'enabled': true},
          ],
        }),
        loaded: true,
      );

      expect(flags.isEnabled(ConversationFeatureKeys.share), isTrue);
    });

    test('share disabled keeps the share menu unavailable', () {
      final flags = ConversationFeatureFlags(
        values: parseConversationFeatureValues({
          'conversation.share.enabled': false,
        }),
        loaded: true,
      );

      expect(flags.isEnabled(ConversationFeatureKeys.share), isFalse);
      expect(flags.message, contains('暂未开放'));
    });

    test('share disabled remains disabled for explicit false-like value', () {
      final flags = ConversationFeatureFlags(
        values: parseConversationFeatureValues({
          'data': {
            'features': {
              'conversation.share.enabled': 'false',
            },
          },
        }),
        loaded: true,
      );

      expect(flags.isEnabled(ConversationFeatureKeys.share), isFalse);
    });
  });

  group('share conversation action', () {
    test('success response extracts result share link', () async {
      final api = _apiReturning(
        statusCode: 200,
        body: {
          'ok': true,
          'result': {'link': 'https://example.com/share/abc'},
        },
      );
      addTearDown(api.dispose);

      final data = await api.shareConversation('conversation-1');

      expect(extractShareUrl(data), 'https://example.com/share/abc');
    });

    test('404 maps to deployed-endpoint message, not unavailable state',
        () async {
      final api = _apiReturning(
        statusCode: 404,
        body: {'message': 'not found'},
      );
      addTearDown(api.dispose);

      await expectLater(
        api.shareConversation('conversation-1'),
        throwsA(
          isA<ApiException>()
              .having((error) => error.message, 'message', '分享接口未部署')
              .having((error) => error.statusCode, 'statusCode', 404),
        ),
      );
    });

    test('405 maps to unimplemented-action message, not copy success',
        () async {
      final api = _apiReturning(
        statusCode: 405,
        body: {'message': 'method not allowed'},
      );
      addTearDown(api.dispose);

      await expectLater(
        api.shareConversation('conversation-1'),
        throwsA(
          isA<ApiException>()
              .having((error) => error.message, 'message', '分享接口未接入')
              .having((error) => error.statusCode, 'statusCode', 405),
        ),
      );
    });

    test('403 keeps backend feature message', () async {
      final api = _apiReturning(
        statusCode: 403,
        body: {
          'ok': false,
          'success': false,
          'code': 'FORBIDDEN',
          'message': '该会话功能暂未开放，请联系超级管理员。',
        },
      );
      addTearDown(api.dispose);

      await expectLater(
        api.shareConversation('conversation-1'),
        throwsA(
          isA<ApiException>()
              .having(
                (error) => error.message,
                'message',
                '该会话功能暂未开放，请联系超级管理员。',
              )
              .having((error) => error.code, 'code', 'FORBIDDEN')
              .having((error) => error.statusCode, 'statusCode', 403),
        ),
      );
    });

    test('502 maps to gateway failure message', () async {
      final api = _apiReturning(
        statusCode: 502,
        body: {'message': 'Bad Gateway'},
      );
      addTearDown(api.dispose);

      await expectLater(
        api.shareConversation('conversation-1'),
        throwsA(
          isA<ApiException>()
              .having(
                (error) => error.message,
                'message',
                '服务器网关异常，请稍后重试或联系管理员',
              )
              .having((error) => error.statusCode, 'statusCode', 502),
        ),
      );
    });

    test('success response without link gives full explanatory message', () {
      final message = buildShareNoLinkMessage({
        'shareId': 'share-1',
      });

      expect(message, contains('服务器已创建分享记录，但没有返回分享链接'));
      expect(message, contains('shareUrl'));
      expect(message, contains('shareLink'));
      expect(message, contains('link'));
      expect(message, contains('url'));
      expect(message, contains('分享 ID：share-1'));
    });

    test('failure dialog message includes endpoint status code and suggestion',
        () {
      final message = buildShareFailureMessage(
        conversationId: 'conversation/1',
        message: '该会话功能暂未开放，请联系超级管理员。',
        statusCode: 403,
        code: 'FEATURE_DISABLED',
      );

      expect(
        message,
        contains('接口：POST /api/user/conversations/conversation%2F1/share'),
      );
      expect(message, contains('状态码：403'));
      expect(message, contains('错误 code：FEATURE_DISABLED'));
      expect(message, contains('该会话功能暂未开放，请联系超级管理员。'));
      expect(message, contains('后端拒绝分享'));
    });
  });

  group('group chat action', () {
    test('success response exposes invite link', () async {
      final api = _apiReturning(
        statusCode: 200,
        body: {
          'ok': true,
          'data': {'inviteUrl': 'https://example.com/group/abc'},
        },
      );
      addTearDown(api.dispose);

      final data = await api.startConversationGroupChat('conversation-1');

      expect(extractGroupChatInviteUrl(data), 'https://example.com/group/abc');
    });

    test('success response exposes result nested invite link', () async {
      final api = _apiReturning(
        statusCode: 200,
        body: {
          'ok': true,
          'result': {'joinUrl': 'https://example.com/group/result'},
        },
      );
      addTearDown(api.dispose);

      final data = await api.startConversationGroupChat('conversation-1');

      expect(
        extractGroupChatInviteUrl(data),
        'https://example.com/group/result',
      );
    });

    test('success response without link gives full explanatory message', () {
      final message = buildGroupChatNoInviteMessage({
        'groupChatId': 'abc',
      });

      expect(message, contains('服务器已创建群聊，但没有返回邀请链接'));
      expect(message, contains('inviteUrl'));
      expect(message, contains('link'));
      expect(message, contains('url'));
      expect(message, contains('群聊 ID：abc'));
    });

    test('404 maps to group chat deployment message', () async {
      final api = _apiReturning(
        statusCode: 404,
        body: {'message': 'not found'},
      );
      addTearDown(api.dispose);

      await expectLater(
        api.startConversationGroupChat('conversation-1'),
        throwsA(
          isA<ApiException>()
              .having((error) => error.message, 'message', '群聊接口未部署')
              .having((error) => error.statusCode, 'statusCode', 404),
        ),
      );
    });

    test('405 maps to group chat unimplemented message', () async {
      final api = _apiReturning(
        statusCode: 405,
        body: {'message': 'method not allowed'},
      );
      addTearDown(api.dispose);

      await expectLater(
        api.startConversationGroupChat('conversation-1'),
        throwsA(
          isA<ApiException>()
              .having((error) => error.message, 'message', '群聊接口未接入')
              .having((error) => error.statusCode, 'statusCode', 405),
        ),
      );
    });

    test('network timeout completes so loading can close in finally', () async {
      final api = ApiService(
        baseUrl: 'https://example.com',
        client: MockClient((request) async {
          throw TimeoutException('simulated timeout');
        }),
      );
      addTearDown(api.dispose);

      var loading = false;
      Object? caught;

      loading = true;
      try {
        await api.startConversationGroupChat('conversation-1');
      } catch (error) {
        caught = error;
      } finally {
        loading = false;
      }

      expect(loading, isFalse);
      expect(
        caught,
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          '创建群聊链接超时，请稍后重试',
        ),
      );
    });
  });
}

ApiService _apiReturning({
  required int statusCode,
  required Map<String, dynamic> body,
}) {
  return ApiService(
    baseUrl: 'https://example.com',
    client: MockClient((request) async {
      return http.Response(
        jsonEncode(body),
        statusCode,
        headers: {'content-type': 'application/json; charset=utf-8'},
        request: request,
      );
    }),
  );
}
