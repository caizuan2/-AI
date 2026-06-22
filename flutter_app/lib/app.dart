import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/api/api_service.dart';
import 'core/config/app_config.dart';
import 'core/storage/session_store.dart';
import 'modules/auth/login_page.dart';
import 'modules/chat/chat_page.dart';
import 'modules/settings/settings_page.dart';
import 'modules/update/update_gate.dart';
import 'modules/update/update_page.dart';
import 'modules/update/update_service.dart';
import 'modules/update/test_update_gate.dart';
import 'modules/update/test_update_service.dart';

class AiKnowledgeNativeApp extends StatefulWidget {
  const AiKnowledgeNativeApp({super.key});

  @override
  State<AiKnowledgeNativeApp> createState() => _AiKnowledgeNativeAppState();
}

class _AiKnowledgeNativeAppState extends State<AiKnowledgeNativeApp> {
  late final SessionStore sessionStore;
  late final ApiService apiService;
  late final UpdateService updateService;
  late final TestUpdateService testUpdateService;
  late final Future<void> bootstrapFuture;

  @override
  void initState() {
    super.initState();
    sessionStore = SessionStore();
    apiService = ApiService(
      baseUrl: AppConfig.apiBaseUrl,
      mockMode: AppConfig.useMockApi,
      sessionStore: sessionStore,
    );
    updateService = UpdateService(
      latestManifestUrl: AppConfig.latestManifestUrl,
      latestManifestUrls: AppConfig.latestManifestUrls,
    );
    testUpdateService = TestUpdateService();
    bootstrapFuture = apiService.restoreSession();
  }

  @override
  void dispose() {
    apiService.dispose();
    updateService.dispose();
    testUpdateService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiService>.value(value: apiService),
        Provider<UpdateService>.value(value: updateService),
        Provider<TestUpdateService>.value(value: testUpdateService),
        Provider<SessionStore>.value(value: sessionStore),
      ],
      child: FutureBuilder<void>(
        future: bootstrapFuture,
        builder: (context, snapshot) {
          return MaterialApp(
            title: 'AI Knowledge',
            debugShowCheckedModeBanner: false,
            theme: ThemeData(
              colorScheme:
                  ColorScheme.fromSeed(seedColor: const Color(0xFF0F172A)),
              scaffoldBackgroundColor: const Color(0xFFF8FAFC),
              useMaterial3: true,
            ),
            builder: (context, child) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const _BootstrapScreen();
              }

              return TestUpdateGate(
                testUpdateService: testUpdateService,
                child: UpdateGate(
                  updateService: updateService,
                  child: child ?? const SizedBox.shrink(),
                ),
              );
            },
            initialRoute: LoginPage.routeName,
            routes: {
              LoginPage.routeName: (_) => LoginPage(apiService: apiService),
              ChatPage.routeName: (_) => ChatPage(apiService: apiService),
              UpdatePage.routeName: (_) =>
                  UpdatePage(updateService: updateService),
              '/updates': (_) => UpdatePage(updateService: updateService),
              SettingsPage.routeName: (_) =>
                  SettingsPage(apiService: apiService),
            },
          );
        },
      ),
    );
  }
}

class _BootstrapScreen extends StatelessWidget {
  const _BootstrapScreen();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: Color(0xFFF8FAFC),
      child: Center(child: CircularProgressIndicator()),
    );
  }
}
