import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ai_knowledge_flutter_app/core/api/api_service.dart';
import 'package:ai_knowledge_flutter_app/modules/auth/login_page.dart';

void main() {
  testWidgets('renders login page smoke test', (WidgetTester tester) async {
    final apiService = ApiService(baseUrl: 'https://example.com', mockMode: true);
    addTearDown(apiService.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: LoginPage(apiService: apiService),
      ),
    );
    await tester.pump();

    expect(find.text('登录 AI 知识库'), findsOneWidget);
  });
}
