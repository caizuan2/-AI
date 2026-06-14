import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../core/config/app_config.dart';
import '../../core/utils/version_utils.dart';
import 'update_manifest.dart';

class UpdateCheckResult {
  const UpdateCheckResult({
    required this.manifest,
    required this.needsUpdate,
    required this.forceUpdate,
  });

  final UpdateManifest manifest;
  final bool needsUpdate;
  final bool forceUpdate;

  bool get shouldPrompt => needsUpdate || forceUpdate;
}

class UpdateService {
  UpdateService({
    required this.latestManifestUrl,
    this.mockMode = false,
    http.Client? client,
  }) : _client = client ?? http.Client();

  final String latestManifestUrl;
  final bool mockMode;
  final http.Client _client;

  Future<UpdateManifest> fetchLatest() async {
    if (mockMode) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      return UpdateManifest.fromJson({
        'version': AppConfig.currentVersion,
        'build': AppConfig.currentBuild,
        'forceUpdate': false,
        'minSupportedBuild': AppConfig.currentBuild,
        'releaseNotes': ['当前已是最新版本。'],
        'downloads': {
          'android':
              'https://github.com/caizuan2/-AI/releases/download/1.0.8/ai-knowledge-chat-latest.apk',
          'windows':
              'https://github.com/caizuan2/-AI/releases/download/1.0.8/ai-knowledge-chat-latest.exe',
        },
      });
    }

    final response = await _client.get(Uri.parse(latestManifestUrl));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Failed to fetch latest.json: ${response.statusCode}');
    }

    final json = jsonDecode(response.body);
    if (json is! Map) {
      throw Exception('latest.json must be a JSON object.');
    }

    return UpdateManifest.fromJson(
      json.map((key, value) => MapEntry(key?.toString() ?? '', value)),
    );
  }

  Future<UpdateCheckResult> checkForUpdate() async {
    final manifest = await fetchLatest();
    final needsUpdate = isRemoteNewer(
      localVersion: AppConfig.currentVersion,
      localBuild: AppConfig.currentBuild,
      remoteVersion: manifest.version,
      remoteBuild: manifest.build,
    );
    final forceUpdate = manifest.forceUpdate ||
        AppConfig.currentBuild < manifest.minSupportedBuild;

    return UpdateCheckResult(
      manifest: manifest,
      needsUpdate: needsUpdate,
      forceUpdate: forceUpdate,
    );
  }

  void dispose() {
    _client.close();
  }
}
