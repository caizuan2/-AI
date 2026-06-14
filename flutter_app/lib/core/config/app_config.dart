class AppConfig {
  const AppConfig._();

  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://stately-sawine-1efd4d.netlify.app',
  );

  static const String latestManifestUrl =
      'https://stately-sawine-1efd4d.netlify.app/releases/latest.json';

  static const latestManifestUrls = <String>[
    latestManifestUrl,
    'https://github.com/caizuan2/-AI/releases/latest/download/latest.json',
    'https://raw.githubusercontent.com/caizuan2/-AI/main/public/releases/latest.json',
  ];

  static const latestJsonUrl = latestManifestUrl;

  static const downloadPageUrl =
      'https://stately-sawine-1efd4d.netlify.app/download';

  static const useMockApi = bool.fromEnvironment(
    'USE_MOCK_API',
    defaultValue: true,
  );

  static const currentVersion = String.fromEnvironment(
    'APP_VERSION',
    defaultValue: '1.0.10',
  );

  static const currentBuild = int.fromEnvironment(
    'APP_BUILD',
    defaultValue: 110,
  );
}
