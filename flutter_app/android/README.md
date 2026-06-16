Android runner placeholder.

Generate the real Flutter Android project after installing Flutter:

```powershell
cd flutter_app
flutter create . --platforms=android
flutter build apk --release
```

This directory is intentionally scoped inside `flutter_app` and does not modify the existing WebView/Capacitor Android project at the repository root.
