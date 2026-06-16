class AppConfig {
  const AppConfig._();

  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://47.238.0.23',
  );

  static const String latestManifestUrl =
      'https://stately-sawine-1efd4d.netlify.app/releases/latest.json';

  static const latestManifestUrls = <String>[
    latestManifestUrl,
    'https://github.com/caizuan2/-AI/releases/latest/download/latest.json',
    'https://raw.githubusercontent.com/caizuan2/-AI/main/public/releases/latest.json',
  ];

  static const latestJsonUrl = latestManifestUrl;

  static const userTestRawManifestUrl =
      'https://raw.githubusercontent.com/caizuan2/-AI/user-test-manifest/public/manifests/user-test/version.json';

  static const userTestJsDelivrManifestUrl =
      'https://cdn.jsdelivr.net/gh/caizuan2/-AI@user-test-manifest/public/manifests/user-test/version.json';

  static const userTestGitHubApiManifestUrl =
      'https://api.github.com/repos/caizuan2/-AI/contents/public/manifests/user-test/version.json?ref=user-test-manifest';

  static const userTestReleaseManifestUrl =
      'https://github.com/caizuan2/-AI/releases/download/user-test/version.json';

  static const userTestManifestUrl = userTestRawManifestUrl;

  static const userTestManifestUrls = <String>[
    userTestRawManifestUrl,
    userTestReleaseManifestUrl,
  ];

  static const userTestAndroidManifestUrls = <String>[
    userTestRawManifestUrl,
    userTestGitHubApiManifestUrl,
    userTestReleaseManifestUrl,
    userTestJsDelivrManifestUrl,
  ];

  static const userTestApkUrl =
      'https://github.com/caizuan2/-AI/releases/download/user-test/ai-knowledge-user-test.apk';

  static const userTestWindowsReleaseUrl =
      'https://github.com/caizuan2/-AI/releases/download/user-test/ai-knowledge-user-windows-release.zip';

  static const userTestWindowsDebugUrl =
      'https://github.com/caizuan2/-AI/releases/download/user-test/ai-knowledge-user-windows-debug.zip';

  static const downloadPageUrl =
      'https://stately-sawine-1efd4d.netlify.app/download';

  static const appChannel = String.fromEnvironment(
    'APP_CHANNEL',
    defaultValue: 'production',
  );

  static const isUserTestChannel = appChannel == 'user-test';

  static const useMockApi = bool.fromEnvironment(
    'USE_MOCK_API',
    defaultValue: false,
  );

  static const currentVersion = String.fromEnvironment(
    'APP_VERSION',
    defaultValue: '1.0.11',
  );

  static const currentBuild = int.fromEnvironment(
    'APP_BUILD',
    defaultValue: 136,
  );

  static const currentTestBuildNumber = int.fromEnvironment(
    'TEST_BUILD_NUMBER',
    defaultValue: currentBuild,
  );
}
