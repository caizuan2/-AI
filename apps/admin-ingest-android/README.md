# AI知识库投喂端 APK Shell

This directory is an independent Android shell plan for `/admin-ingest`.

- App name: `AI知识库投喂端`
- Package id: `com.aiknowledge.ingestadmin`
- Default URL: `http://10.0.2.2:3015/admin-ingest?app=ingest-admin&platform=apk`
- Blocked user path: `/chat-ui`
- Sync target: Web / EXE / APK

The current repository Android project is the existing user-side package. This task does not modify `android/**` or `flutter_app/**`, so no APK is generated from this directory yet.

Next independent APK build step:

```powershell
# Use this directory as the source of truth for a future standalone Android WebView shell.
# Do not reuse the existing user APK project.
```
