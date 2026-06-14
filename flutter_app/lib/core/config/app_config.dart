class AppConfig {
  const AppConfig._();

  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://stately-sawine-1efd4d.netlify.app',
  );

  static const String latestManifestUrl =
      'https://stately-sawine-1efd4d.netlify.app/releases/latest.json';

  static const latestJsonUrl = latestManifestUrl;

  static const useMockApi = bool.fromEnvironment(
    'USE_MOCK_API',
    defaultValue: true,
  );

  static const currentVersion = String.fromEnvironment(
    'APP_VERSION',
    defaultValue: '1.0.9',
  );

  static const currentBuild = int.fromEnvironment(
    'APP_BUILD',
    defaultValue: 109,
  );
}
