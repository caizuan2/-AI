import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  composeAdminIngestLiveVoiceInput,
  isCurrentAdminIngestVoiceEvent
} from "../lib/enterprise/admin-ingest-live-voice";

const modeToggleSource = readFileSync(
  "components/enterprise-admin/IngestModeToggle.tsx",
  "utf8"
);
const voiceClientSource = readFileSync(
  "lib/enterprise/admin-ingest-voice-client.ts",
  "utf8"
);
const voiceRouteSource = readFileSync(
  "app/api/admin/ingest-voice/transcribe/route.ts",
  "utf8"
);
const middlewareSource = readFileSync("middleware.ts", "utf8");
const androidManifest = readFileSync(
  "android/app/src/main/AndroidManifest.xml",
  "utf8"
);
const androidActivity = readFileSync(
  "android/app/src/main/java/com/aiknowledge/chat/MainActivity.java",
  "utf8"
);
const adminAndroidBuildScript = readFileSync(
  "scripts/build-admin-android-apk.ps1",
  "utf8"
);

assert.match(
  middlewareSource,
  /pathname === "\/admin-ingest" \|\| pathname\.startsWith\("\/admin-ingest\/"\)/
);
assert.match(
  middlewareSource,
  /"camera=\(\), microphone=\(self\), geolocation=\(\)"/
);

assert.match(
  modeToggleSource,
  /ADMIN_INGEST_NATIVE_SPEECH_EVENT = "admin-ingest-native-speech"/
);
assert.match(
  modeToggleSource,
  /platformContext\.platform === "apk" && typeof nativeSpeech === "function"/
);
assert.ok(
  modeToggleSource.indexOf('platformContext.platform === "apk"')
    < modeToggleSource.indexOf("if (!window.isSecureContext)"),
  "APK native recording must be selected before the Web secure-context guard."
);
assert.match(
  modeToggleSource,
  /detail\.state === "audio"[\s\S]*transcribeNativeAudio\(detail\)/
);
assert.match(
  modeToggleSource,
  /transcribeAdminIngestNativeVoice\([\s\S]*expectedHistoryScope[\s\S]*controller\.signal/
);
assert.match(
  modeToggleSource,
  /historyScopeRef\.current !== expectedHistoryScope/
);
assert.match(
  modeToggleSource,
  /voiceState\.isRecording && typeof stopNativeSpeech === "function"/
);
assert.match(
  modeToggleSource,
  /composeAdminIngestLiveVoiceInput\([\s\S]*nativeVoiceBaseInputRef\.current/
);
assert.match(
  modeToggleSource,
  /detail\.state === "partial" && transcript[\s\S]*applyNativeVoiceTranscript\(transcript, false\)/
);
assert.match(
  modeToggleSource,
  /nativeVoiceConversationScopeRef[\s\S]*activeConversationIdRef\.current/
);
assert.match(
  modeToggleSource,
  /cancelSpeechRecognition\?\.\(\)/
);

assert.match(
  voiceClientSource,
  /\/api\/admin\/ingest-voice\/transcribe/
);
assert.match(
  voiceClientSource,
  /"x-admin-ingest-history-scope": normalizedHistoryScope/
);
assert.match(
  voiceClientSource,
  /credentials: "same-origin"/
);
assert.match(
  voiceClientSource,
  /ADMIN_INGEST_VOICE_TRANSCRIPTION_TIMEOUT_MS = 45_000/
);
assert.match(
  voiceClientSource,
  /new File\(\[bytes\], fileName, \{ type: mimeType \}\)/
);

assert.match(
  voiceRouteSource,
  /requireAdminIngestChatActor\(\)/
);
assert.match(
  voiceRouteSource,
  /matchesAdminIngestHistoryScope/
);
assert.match(
  voiceRouteSource,
  /MAX_ADMIN_INGEST_VOICE_BYTES = 2 \* 1024 \* 1024/
);
assert.match(
  voiceRouteSource,
  /DEFAULT_QWEN_ASR_MODEL = "qwen3-asr-flash"/
);
assert.match(
  voiceRouteSource,
  /process\.env\.QWEN_ASR_BASE_URL/
);
assert.match(
  voiceRouteSource,
  /process\.env\.QWEN_BASE_URL/
);
assert.match(
  voiceRouteSource,
  /process\.env\.QWEN_API_KEY/
);
assert.match(
  voiceRouteSource,
  /type: "input_audio"[\s\S]*data: `data:\$\{mimeType\};base64,/
);
assert.match(
  voiceRouteSource,
  /language: "zh"[\s\S]*enable_itn: true/
);
assert.match(
  voiceRouteSource,
  /ADMIN_INGEST_VOICE_TIMEOUT_MS = 45_000/
);
assert.match(
  voiceRouteSource,
  /"Cache-Control": "no-store"/
);
assert.doesNotMatch(
  voiceRouteSource,
  /writeFile|saveAdmin|prisma|database|openai\.audio/
);
assert.doesNotMatch(
  `${voiceRouteSource}\n${voiceClientSource}`,
  /deepseek|doubao|rag/i
);

assert.doesNotMatch(
  androidManifest,
  /android\.permission\.RECORD_AUDIO/
);
assert.doesNotMatch(
  androidManifest,
  /android\.speech\.RecognitionService/
);
assert.match(
  adminAndroidBuildScript,
  /Enable-AdminMicrophonePermission/
);
assert.match(
  adminAndroidBuildScript,
  /android\.permission\.RECORD_AUDIO/
);
assert.match(
  adminAndroidBuildScript,
  /android\.speech\.RecognitionService/
);
assert.match(
  adminAndroidBuildScript,
  /OriginalAndroidManifestBytes/
);

assert.match(
  androidActivity,
  /RECORD_AUDIO_PERMISSION_REQUEST_CODE = 6207/
);
assert.match(
  androidActivity,
  /requestPermissions\([\s\S]*Manifest\.permission\.RECORD_AUDIO/
);
assert.match(
  androidActivity,
  /ADMIN_APP_PACKAGE\.equals\(getPackageName\(\)\)/
);
assert.match(
  androidActivity,
  /SpeechRecognizer\.isRecognitionAvailable\(this\)/
);
assert.match(
  androidActivity,
  /SpeechRecognizer\.createSpeechRecognizer\(this\)/
);
assert.match(
  androidActivity,
  /RecognizerIntent\.EXTRA_PARTIAL_RESULTS, true/
);
assert.match(
  androidActivity,
  /onPartialResults\(Bundle partialResults\)[\s\S]*postAdminIngestSpeechEvent\("partial"/
);
assert.match(
  androidActivity,
  /detail\.put\("sessionId", sessionId\)/
);
assert.match(
  androidActivity,
  /new MediaRecorder\(this\)[\s\S]*new MediaRecorder\(\)/
);
assert.match(
  androidActivity,
  /MediaRecorder\.OutputFormat\.MPEG_4/
);
assert.match(
  androidActivity,
  /MediaRecorder\.AudioEncoder\.AAC/
);
assert.match(
  androidActivity,
  /MAX_ADMIN_INGEST_VOICE_RECORDING_MS = 15000L/
);
assert.match(
  androidActivity,
  /Base64\.encodeToString\(bytes, Base64\.NO_WRAP\)/
);
assert.match(
  androidActivity,
  /postAdminIngestVoiceAudioEvent\([\s\S]*audioBase64/
);
assert.match(
  androidActivity,
  /deleteVoiceRecordingFile\(recordingFile\)/
);
assert.match(
  androidActivity,
  /public void stopSpeechRecognition\(\)/
);
assert.match(
  androidActivity,
  /public void cancelSpeechRecognition\(\)/
);

assert.equal(
  composeAdminIngestLiveVoiceInput("帮我回复：", "客户有点顾虑"),
  "帮我回复： 客户有点顾虑"
);
assert.equal(
  composeAdminIngestLiveVoiceInput("帮我回复：", "客户还在考虑"),
  "帮我回复： 客户还在考虑",
  "A newer partial result must replace the previous partial instead of duplicating it."
);
assert.equal(
  isCurrentAdminIngestVoiceEvent({
    activeSessionId: "voice-1",
    eventSessionId: "voice-1",
    startedHistoryScope: "account|agent-a|conversation-a",
    currentHistoryScope: "account|agent-a|conversation-a"
  }),
  true
);
assert.equal(
  isCurrentAdminIngestVoiceEvent({
    activeSessionId: "voice-1",
    eventSessionId: "voice-2",
    startedHistoryScope: "account|agent-a|conversation-a",
    currentHistoryScope: "account|agent-a|conversation-a"
  }),
  false
);
assert.equal(
  isCurrentAdminIngestVoiceEvent({
    activeSessionId: "voice-1",
    eventSessionId: "voice-1",
    startedHistoryScope: "account|agent-a|conversation-a",
    currentHistoryScope: "account|agent-a|conversation-b"
  }),
  false
);

console.log("admin-ingest-voice-input tests passed");
