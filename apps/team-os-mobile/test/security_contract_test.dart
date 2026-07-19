import 'package:flutter_test/flutter_test.dart';
import 'package:teamos/auth/team_role.dart';
import 'package:teamos/core/app_config.dart';
import 'package:teamos/notifications/notification_context.dart';
import 'package:teamos/webview/navigation_policy.dart';

void main() {
  group('AppConfig', () {
    test('accepts a canonical production HTTPS origin', () {
      final config = AppConfig.parse('https://team.example.com');

      expect(config.baseUri.origin, 'https://team.example.com');
      expect(config.exactOriginPattern, r'^https://team\.example\.com$');
      final navigationPattern = RegExp(config.allowedMainFramePattern);
      expect(
        navigationPattern.hasMatch(
          'https://team.example.com/team-os/tasks?mine=1',
        ),
        isTrue,
      );
      expect(
        navigationPattern.hasMatch('https://team.example.com/super-admin'),
        isFalse,
      );
      expect(
        navigationPattern.hasMatch('https://attacker.example/team-os'),
        isFalse,
      );
      expect(config.insecureLocalDevelopment, isFalse);
    });

    test('rejects cleartext production endpoints', () {
      expect(
        () => AppConfig.parse('http://team.example.com'),
        throwsA(isA<AppConfigException>()),
      );
    });

    test('only allows cleartext loopback in explicit debug mode', () {
      final config = AppConfig.parse(
        'http://127.0.0.1:3000',
        allowInsecureLocal: true,
        debugMode: true,
      );
      expect(config.insecureLocalDevelopment, isTrue);

      expect(
        () => AppConfig.parse(
          'http://127.0.0.1:3000',
          allowInsecureLocal: true,
          debugMode: false,
        ),
        throwsA(isA<AppConfigException>()),
      );
    });

    test('rejects production IPs, user info and nonstandard ports', () {
      for (final value in [
        'https://47.238.0.23',
        'https://user@team.example.com',
        'https://team.example.com:8443',
      ]) {
        expect(
          () => AppConfig.parse(value),
          throwsA(isA<AppConfigException>()),
        );
      }
    });

    test('preserves internal query strings and rejects external URLs', () {
      final config = AppConfig.parse('https://team.example.com');

      expect(
        config.resolve('/login?next=/team-os').toString(),
        'https://team.example.com/login?next=/team-os',
      );
      expect(
        () => config.resolve('https://attacker.example/login'),
        throwsA(isA<AppConfigException>()),
      );
    });
  });

  group('TeamOsNavigationPolicy', () {
    final config = AppConfig.parse('https://team.example.com');
    final policy = TeamOsNavigationPolicy(config);

    test('allows only approved same-origin top-level paths', () {
      expect(
        policy.allows(
          Uri.parse('https://team.example.com/team-os/notifications'),
          isMainFrame: true,
        ),
        isTrue,
      );
      expect(
        policy.allows(
          Uri.parse('https://team.example.com/login?next=/team-os'),
          isMainFrame: true,
        ),
        isTrue,
      );
      expect(
        policy.allows(
          Uri.parse('https://team.example.com/super-admin'),
          isMainFrame: true,
        ),
        isFalse,
      );
      expect(
        policy.allows(
          Uri.parse('https://attacker.example/team-os'),
          isMainFrame: true,
        ),
        isFalse,
      );
    });
  });

  group('server context parsing', () {
    test('selects the highest verified Team OS role', () {
      final context = NotificationContext.fromBridgeArguments([
        {
          'schemaVersion': 1,
          'roles': ['TEAM_MEMBER', 'TRAINER', 'TEAM_MANAGER'],
          'unreadCount': 8,
        },
      ]);

      expect(context, isNotNull);
      expect(context!.role, TeamRole.manager);
      expect(context.unreadCount, 8);
    });

    test('rejects malformed bridge payloads', () {
      expect(
        NotificationContext.fromBridgeArguments([
          {
            'schemaVersion': 2,
            'roles': ['TEAM_OWNER'],
            'unreadCount': -1,
          },
        ]),
        isNull,
      );
    });
  });
}
