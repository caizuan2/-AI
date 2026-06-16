package com.example.ai_knowledge_flutter_app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.FileProvider
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.util.Locale

class MainActivity : FlutterActivity() {
    private val speechChannelName = "ai_knowledge_flutter_app/speech"
    private val updateChannelName = "ai_knowledge_flutter_app/update"
    private val speechRequestCode = 42018
    private var pendingSpeechResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            speechChannelName
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "listen" -> startSpeechRecognition(result)
                else -> result.notImplemented()
            }
        }

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            updateChannelName
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "installApk" -> {
                    val path = call.argument<String>("path").orEmpty()
                    installApk(path, result)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun installApk(path: String, result: MethodChannel.Result) {
        try {
            if (path.isBlank()) {
                result.error("missing_path", "APK path is empty.", null)
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !packageManager.canRequestPackageInstalls()
            ) {
                val settingsIntent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:$packageName")
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(settingsIntent)
                result.success(false)
                return
            }

            val apk = File(path)
            if (!apk.exists()) {
                result.error("missing_apk", "APK file does not exist.", path)
                return
            }

            val apkUri = FileProvider.getUriForFile(
                this,
                "$packageName.fileprovider",
                apk
            )
            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(installIntent)
            result.success(true)
        } catch (error: ActivityNotFoundException) {
            result.error("installer_not_found", error.message, null)
        } catch (error: Exception) {
            result.error("install_failed", error.message, null)
        }
    }

    private fun startSpeechRecognition(result: MethodChannel.Result) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            result.error(
                "not_available",
                "Current device does not provide speech recognition service.",
                null
            )
            return
        }

        if (pendingSpeechResult != null) {
            result.error("busy", "Speech recognition is already running.", null)
            return
        }

        pendingSpeechResult = result
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_PROMPT, "请开始说话")
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }

        try {
            startActivityForResult(intent, speechRequestCode)
        } catch (error: ActivityNotFoundException) {
            pendingSpeechResult = null
            result.error(
                "not_available",
                "Speech recognition activity was not found.",
                error.message
            )
        } catch (error: Exception) {
            pendingSpeechResult = null
            result.error("start_failed", error.message, null)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == speechRequestCode) {
            val result = pendingSpeechResult
            pendingSpeechResult = null
            if (result == null) {
                return
            }

            if (resultCode == Activity.RESULT_OK) {
                val matches =
                    data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                result.success(matches?.firstOrNull().orEmpty())
            } else {
                result.success("")
            }
            return
        }

        super.onActivityResult(requestCode, resultCode, data)
    }
}
