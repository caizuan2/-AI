# AI Knowledge Flutter App

Flutter native client skeleton for the existing AI Knowledge Base backend. This app is a new independent client and does not use the current WebView or Capacitor APK runtime.

## Scope

This project does not change the existing Next.js backend, database, auth, license activation, admin features, or CI/CD. It only adds a new mobile client that talks to existing REST APIs.

## Run

Default mode uses local mock responses, so the app can open the login page and chat page without a backend session:

```powershell
cd flutter_app
flutter pub get
flutter run
```

Use the existing backend REST APIs:

```powershell
cd flutter_app
flutter run --dart-define=USE_MOCK_API=false --dart-define=API_BASE_URL=https://stately-sawine-1efd4d.netlify.app --dart-define=LATEST_JSON_URL=https://stately-sawine-1efd4d.netlify.app/releases/latest.json
```

If Android/iOS platform folders are not present yet, generate them after installing Flutter. This only creates Flutter runner files inside `flutter_app` and does not touch the existing WebView/Capacitor project:

```powershell
cd flutter_app
flutter create . --platforms=android,ios
flutter run
```

Build Android APK:

```powershell
cd flutter_app
flutter build apk --release --dart-define=USE_MOCK_API=false --dart-define=API_BASE_URL=https://stately-sawine-1efd4d.netlify.app
```

## Main Modules

- `lib/modules/auth`: login, register, license activation UI.
- `lib/modules/chat`: GPT-style chat UI, 30-80ms streaming tokens, stop generating, local conversation memory, model presets, thinking indicator, message states, retry, markdown rendering, code block copy and lightweight syntax highlighting.
- `lib/modules/update`: latest.json check, update dialog, force update handling.
- `lib/modules/upload`: upload file model used by the API layer.
- `lib/core/api`: existing backend REST API adapter.
- `lib/core/utils`: shared version comparison helpers.
