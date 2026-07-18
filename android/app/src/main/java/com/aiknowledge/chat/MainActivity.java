package com.aiknowledge.chat;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import java.io.File;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String APP_ORIGIN = "http://47.238.0.23";
    private static final String LEGACY_APP_ORIGIN = "https://stately-sawine-1efd4d.netlify.app";
    private static final String USER_CHAT_URL = APP_ORIGIN + "/app/chat";
    private static final String ADMIN_INGEST_URL = LEGACY_APP_ORIGIN + "/ingest";
    private static final String ADMIN_APP_PACKAGE = "com.aiknowledge.admin";
    private static final String UPDATE_STATE_PREFS = "app_update_state";
    private static final String WEBVIEW_STATE_VERSION_PREFIX = "webview_state_cleared_";
    private static final int FILE_CHOOSER_REQUEST_CODE = 6205;
    private ValueCallback<Uri[]> fileChooserCallback;
    private long updateDownloadId = -1L;
    private BroadcastReceiver updateDownloadReceiver;
    private File updateDownloadFile;
    private final Handler updateProgressHandler = new Handler(Looper.getMainLooper());
    private Runnable updateProgressRunnable;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();

            clearStaleWebViewState(webView);
            configureSessionPersistence(webView);
            webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
            webView.setWebViewClient(new AppRouteWebViewClient(getBridge(), isAdminShell()));
            webView.setWebChromeClient(new AppWebChromeClient(getBridge()));
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            ValueCallback<Uri[]> callback = fileChooserCallback;
            fileChooserCallback = null;

            if (callback == null) {
                return;
            }

            callback.onReceiveValue(readFileChooserResult(resultCode, data));
            return;
        }

        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (getBridge() != null && getBridge().getWebView() != null && getBridge().getWebView().canGoBack()) {
            getBridge().getWebView().goBack();
            return;
        }

        super.onBackPressed();
    }

    @Override
    public void onDestroy() {
        stopUpdateProgressPolling();
        unregisterUpdateDownloadReceiver();
        super.onDestroy();
    }

    private boolean isAdminShell() {
        return ADMIN_APP_PACKAGE.equals(getPackageName());
    }

    private void clearStaleWebViewState(WebView webView) {
        SharedPreferences preferences = getSharedPreferences(UPDATE_STATE_PREFS, MODE_PRIVATE);
        String stateKey = WEBVIEW_STATE_VERSION_PREFIX + BuildConfig.VERSION_NAME;

        if (preferences.getBoolean(stateKey, false)) {
            return;
        }

        webView.clearCache(true);
        webView.clearHistory();

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.removeAllCookies(null);
        cookieManager.flush();

        preferences.edit().putBoolean(stateKey, true).apply();
    }

    private void configureSessionPersistence(WebView webView) {
        WebSettings settings = webView.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);
    }

    private static String[] getChatFileChooserMimeTypes() {
        return new String[] {
            "image/*",
            "application/pdf",
            "text/plain",
            "text/markdown",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        };
    }

    private static Uri[] readFileChooserResult(int resultCode, Intent data) {
        if (resultCode != Activity.RESULT_OK || data == null) {
            return null;
        }

        ClipData clipData = data.getClipData();
        if (clipData != null && clipData.getItemCount() > 0) {
            Uri[] results = new Uri[clipData.getItemCount()];
            for (int index = 0; index < clipData.getItemCount(); index++) {
                results[index] = clipData.getItemAt(index).getUri();
            }
            return results;
        }

        Uri dataUri = data.getData();
        if (dataUri != null) {
            return new Uri[] { dataUri };
        }

        return WebChromeClient.FileChooserParams.parseResult(resultCode, data);
    }

    private static boolean isSameAppOrigin(Uri uri) {
        String origin = uri.getScheme() + "://" + uri.getHost();
        return APP_ORIGIN.equals(origin) || LEGACY_APP_ORIGIN.equals(origin);
    }

    private static boolean isHttpUri(Uri uri) {
        if (uri == null || uri.getScheme() == null) {
            return false;
        }

        return "http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme());
    }

    private static boolean isAllowedShellRoute(Uri uri, boolean adminShell) {
        if (!isSameAppOrigin(uri)) {
            return false;
        }

        String path = uri.getPath();
        if (path == null) {
            return false;
        }

        if (path.equals("/login")) {
            return true;
        }

        if (adminShell) {
            return path.equals("/ingest") || path.startsWith("/ingest/");
        }

        return path.equals("/app/chat")
            || path.startsWith("/app/chat/")
            || path.equals("/chat-ui")
            || path.startsWith("/chat-ui/")
            || path.equals("/register")
            || path.equals("/unlock");
    }

    private static boolean shouldOpenInExternalBrowser(Uri uri, boolean adminShell) {
        return isHttpUri(uri) && !isAllowedShellRoute(uri, adminShell);
    }

    private boolean openExternalBrowser(Uri uri) {
        if (!isHttpUri(uri)) {
            return false;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addCategory(Intent.CATEGORY_BROWSABLE);

        try {
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException error) {
            return false;
        }
    }

    private static String getSafeUpdateFileName(String fileName, Uri uri) {
        String candidate = fileName == null ? "" : fileName.trim();

        if (candidate.length() == 0 && uri != null && uri.getLastPathSegment() != null) {
            candidate = uri.getLastPathSegment();
        }

        candidate = candidate.replaceAll("[\\\\/:*?\"<>|]", "");

        if (!candidate.toLowerCase().endsWith(".apk")) {
            candidate = "小董AI.apk";
        }

        return candidate;
    }

    private File getUpdateDownloadFile(String fileName) {
        File directory = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) {
            directory = getCacheDir();
        }

        if (!directory.exists()) {
            directory.mkdirs();
        }

        return new File(directory, fileName);
    }

    private void postUpdateProgress(String phase, int progress, String message, String error) {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        WebView webView = getBridge().getWebView();
        String script = "window.dispatchEvent(new CustomEvent('ai-knowledge-update-progress',{detail:{"
            + "phase:" + JSONObject.quote(phase)
            + ",progress:" + progress
            + ",message:" + JSONObject.quote(message)
            + ",error:" + (error == null ? "undefined" : JSONObject.quote(error))
            + "}}));";

        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void unregisterUpdateDownloadReceiver() {
        if (updateDownloadReceiver == null) {
            return;
        }

        try {
            unregisterReceiver(updateDownloadReceiver);
        } catch (IllegalArgumentException error) {
            // Receiver was already cleared by the system.
        }

        updateDownloadReceiver = null;
    }

    private static int getCursorInt(Cursor cursor, String columnName, int fallback) {
        int columnIndex = cursor.getColumnIndex(columnName);
        return columnIndex >= 0 ? cursor.getInt(columnIndex) : fallback;
    }

    private static long getCursorLong(Cursor cursor, String columnName, long fallback) {
        int columnIndex = cursor.getColumnIndex(columnName);
        return columnIndex >= 0 ? cursor.getLong(columnIndex) : fallback;
    }

    private void stopUpdateProgressPolling() {
        if (updateProgressRunnable == null) {
            return;
        }

        updateProgressHandler.removeCallbacks(updateProgressRunnable);
        updateProgressRunnable = null;
    }

    private void startUpdateProgressPolling() {
        stopUpdateProgressPolling();

        updateProgressRunnable = new Runnable() {
            @Override
            public void run() {
                if (!pollUpdateDownloadProgress() && updateProgressRunnable != null) {
                    updateProgressHandler.postDelayed(this, 600);
                }
            }
        };
        updateProgressHandler.postDelayed(updateProgressRunnable, 600);
    }

    private boolean pollUpdateDownloadProgress() {
        if (updateDownloadId < 0L) {
            return true;
        }

        DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            postUpdateProgress("error", 0, "更新包下载失败。", "系统下载服务不可用。");
            stopUpdateProgressPolling();
            return true;
        }

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(updateDownloadId);
        try (Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                return false;
            }

            int status = getCursorInt(cursor, DownloadManager.COLUMN_STATUS, DownloadManager.STATUS_PENDING);
            if (status == DownloadManager.STATUS_FAILED) {
                int reason = getCursorInt(cursor, DownloadManager.COLUMN_REASON, 0);
                postUpdateProgress("error", 0, "更新包下载失败。", "系统下载失败，错误码：" + reason);
                stopUpdateProgressPolling();
                return true;
            }

            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                postUpdateProgress("installing", 96, "APK 已下载完成，正在打开安装界面...", null);
                stopUpdateProgressPolling();
                unregisterUpdateDownloadReceiver();
                installDownloadedApk(updateDownloadFile);
                return true;
            }

            long loaded = getCursorLong(cursor, DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR, 0L);
            long total = getCursorLong(cursor, DownloadManager.COLUMN_TOTAL_SIZE_BYTES, 0L);
            int progress = 25;

            if (total > 0L) {
                progress = Math.min(95, 15 + (int) ((loaded * 80L) / total));
            }

            postUpdateProgress("downloading", progress, "正在当前应用内下载 APK，请稍候...", null);
        }

        return false;
    }

    private void registerUpdateDownloadReceiver() {
        unregisterUpdateDownloadReceiver();

        updateDownloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);

                if (completedId != updateDownloadId) {
                    return;
                }

                handleUpdateDownloadComplete();
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(updateDownloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(updateDownloadReceiver, filter);
        }
    }

    private void handleUpdateDownloadComplete() {
        stopUpdateProgressPolling();
        unregisterUpdateDownloadReceiver();

        DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            postUpdateProgress("error", 0, "更新包下载失败。", "系统下载服务不可用。");
            return;
        }

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(updateDownloadId);
        try (Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                postUpdateProgress("error", 0, "更新包下载失败。", "没有找到下载结果。");
                return;
            }

            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
            int status = statusIndex >= 0 ? cursor.getInt(statusIndex) : DownloadManager.STATUS_FAILED;

            if (status == DownloadManager.STATUS_SUCCESSFUL && updateDownloadFile != null) {
                postUpdateProgress("installing", 96, "APK 已下载完成，正在打开安装界面...", null);
                installDownloadedApk(updateDownloadFile);
                return;
            }

            int reason = reasonIndex >= 0 ? cursor.getInt(reasonIndex) : 0;
            postUpdateProgress("error", 0, "更新包下载失败。", "系统下载失败，错误码：" + reason);
        }
    }

    private void downloadUpdatePackage(String url, String fileName) {
        stopUpdateProgressPolling();

        Uri uri = Uri.parse(url);
        if (!isHttpUri(uri)) {
            postUpdateProgress("error", 0, "更新包下载失败。", "下载地址格式不正确。");
            return;
        }

        DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            postUpdateProgress("error", 0, "更新包下载失败。", "系统下载服务不可用。");
            return;
        }

        updateDownloadFile = getUpdateDownloadFile(getSafeUpdateFileName(fileName, uri));
        if (updateDownloadFile.exists()) {
            updateDownloadFile.delete();
        }

        DownloadManager.Request request = new DownloadManager.Request(uri);
        request.setTitle("小董AI");
        request.setDescription("正在下载更新包");
        request.setMimeType("application/vnd.android.package-archive");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationUri(Uri.fromFile(updateDownloadFile));

        try {
            updateDownloadId = manager.enqueue(request);
            registerUpdateDownloadReceiver();
            startUpdateProgressPolling();
            postUpdateProgress("downloading", 15, "正在当前应用内下载 APK，请稍候...", null);
            Toast.makeText(this, "正在下载更新包", Toast.LENGTH_SHORT).show();
        } catch (IllegalArgumentException error) {
            postUpdateProgress("error", 0, "更新包下载失败。", error.getMessage());
        }
    }

    private void installDownloadedApk(File apkFile) {
        if (apkFile == null || !apkFile.exists()) {
            postUpdateProgress("error", 0, "更新包下载失败。", "APK 文件不存在。");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            postUpdateProgress("error", 0, "需要允许安装未知来源应用。", "请在系统设置中允许小董AI安装更新包，然后重新点击更新。");
            Intent settingsIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getPackageName())
            );
            startActivity(settingsIntent);
            return;
        }

        Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apkFile);
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            startActivity(installIntent);
            postUpdateProgress("ready", 100, "安装界面已打开，请按提示完成更新。", null);
        } catch (ActivityNotFoundException error) {
            postUpdateProgress("error", 0, "无法打开安装界面。", "请在系统下载通知中手动打开安装包。");
        }
    }

    private class AndroidBridge {
        @JavascriptInterface
        public void openUrl(String url) {
            runOnUiThread(() -> openExternalBrowser(Uri.parse(url)));
        }

        @JavascriptInterface
        public void downloadUpdate(String url, String fileName) {
            runOnUiThread(() -> downloadUpdatePackage(url, fileName));
        }
    }

    private static boolean isForbiddenUserRoute(Uri uri) {
        if (!isSameAppOrigin(uri)) {
            return false;
        }

        String path = uri.getPath();
        if (path == null) {
            return false;
        }

        return path.equals("/ingest")
            || path.startsWith("/ingest/")
            || path.equals("/admin")
            || path.startsWith("/admin/")
            || path.equals("/api/admin")
            || path.startsWith("/api/admin/");
    }

    private static boolean isForbiddenAdminRoute(Uri uri) {
        if (!isSameAppOrigin(uri)) {
            return false;
        }

        String appMode = uri.getQueryParameter("app");
        if ("user".equals(appMode)) {
            return true;
        }

        String path = uri.getPath();
        if (path == null) {
            return false;
        }

        return path.equals("/chat-ui")
            || path.startsWith("/chat-ui/")
            || path.equals("/app/chat")
            || path.startsWith("/app/chat/")
            || path.equals("/download")
            || path.startsWith("/download/")
            || path.equals("/user-download.html");
    }

    private class AppWebChromeClient extends BridgeWebChromeClient {
        AppWebChromeClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public boolean onCreateWindow(
            WebView view,
            boolean isDialog,
            boolean isUserGesture,
            Message resultMsg
        ) {
            WebView popupWebView = new WebView(view.getContext());
            popupWebView.getSettings().setJavaScriptEnabled(true);
            popupWebView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                    Uri url = request.getUrl();

                    if (openExternalBrowser(url)) {
                        popupView.destroy();
                        return true;
                    }

                    return true;
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView popupView, String url) {
                    if (openExternalBrowser(Uri.parse(url))) {
                        popupView.destroy();
                    }

                    return true;
                }
            });

            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(popupWebView);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public void onCloseWindow(WebView window) {
            window.destroy();
        }

        @Override
        public boolean onShowFileChooser(
            WebView webView,
            final ValueCallback<Uri[]> filePathCallback,
            final WebChromeClient.FileChooserParams fileChooserParams
        ) {
            if (fileChooserParams.isCaptureEnabled()) {
                return super.onShowFileChooser(webView, filePathCallback, fileChooserParams);
            }

            if (fileChooserCallback != null) {
                fileChooserCallback.onReceiveValue(null);
            }

            fileChooserCallback = filePathCallback;

            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, getChatFileChooserMimeTypes());
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

            try {
                startActivityForResult(Intent.createChooser(intent, "选择文件"), FILE_CHOOSER_REQUEST_CODE);
            } catch (ActivityNotFoundException error) {
                fileChooserCallback = null;
                filePathCallback.onReceiveValue(null);
                return false;
            }

            return true;
        }
    }

    private class AppRouteWebViewClient extends BridgeWebViewClient {
        private final boolean adminShell;

        AppRouteWebViewClient(Bridge bridge, boolean adminShell) {
            super(bridge);
            this.adminShell = adminShell;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) {
                return super.shouldOverrideUrlLoading(view, request);
            }

            Uri url = request.getUrl();
            if (adminShell && isForbiddenAdminRoute(url)) {
                view.loadUrl(ADMIN_INGEST_URL);
                return true;
            }

            if (!adminShell && isForbiddenUserRoute(url)) {
                view.loadUrl(USER_CHAT_URL);
                return true;
            }

            if (shouldOpenInExternalBrowser(url, adminShell)) {
                openExternalBrowser(url);
                return true;
            }

            return super.shouldOverrideUrlLoading(view, request);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            if (adminShell && isForbiddenAdminRoute(uri)) {
                view.loadUrl(ADMIN_INGEST_URL);
                return true;
            }

            if (!adminShell && isForbiddenUserRoute(uri)) {
                view.loadUrl(USER_CHAT_URL);
                return true;
            }

            if (shouldOpenInExternalBrowser(uri, adminShell)) {
                openExternalBrowser(uri);
                return true;
            }

            return super.shouldOverrideUrlLoading(view, url);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            Uri uri = Uri.parse(url);
            if (adminShell && isForbiddenAdminRoute(uri)) {
                view.stopLoading();
                view.loadUrl(ADMIN_INGEST_URL);
                return;
            }

            if (!adminShell && isForbiddenUserRoute(uri)) {
                view.stopLoading();
                view.loadUrl(USER_CHAT_URL);
                return;
            }

            if (shouldOpenInExternalBrowser(uri, adminShell)) {
                view.stopLoading();
                openExternalBrowser(uri);
                return;
            }

            super.onPageStarted(view, url, favicon);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            String routeGuardScript = adminShell
                ? "(function(){"
                    + "var origin='https://stately-sawine-1efd4d.netlify.app';"
                    + "var ingest=origin+'/ingest';"
                    + "function blocked(){var params=new URLSearchParams(location.search);var path=location.pathname;return params.get('app')==='user'||path==='/chat-ui'||path.indexOf('/chat-ui/')===0||path==='/download'||path.indexOf('/download/')===0||path==='/user-download.html';}"
                    + "function guard(){if(location.origin===origin&&blocked()){location.replace(ingest);}}"
                    + "if(!window.__aiAdminAppRouteGuardInstalled){"
                    + "window.__aiAdminAppRouteGuardInstalled=true;"
                    + "var push=history.pushState;"
                    + "var replace=history.replaceState;"
                    + "history.pushState=function(){var result=push.apply(this,arguments);setTimeout(guard,0);return result;};"
                    + "history.replaceState=function(){var result=replace.apply(this,arguments);setTimeout(guard,0);return result;};"
                    + "window.addEventListener('popstate',function(){setTimeout(guard,0);});"
                    + "}"
                    + "guard();"
                    + "})();"
                : "(function(){"
                    + "var origin='http://47.238.0.23';"
                    + "var legacy='https://stately-sawine-1efd4d.netlify.app';"
                    + "var chat=origin+'/app/chat';"
                    + "function sameOrigin(){return location.origin===origin||location.origin===legacy;}"
                    + "function blocked(path){return path==='/ingest'||path.indexOf('/ingest/')===0||path==='/admin'||path.indexOf('/admin/')===0||path==='/api/admin'||path.indexOf('/api/admin/')===0;}"
                    + "function guard(){if(sameOrigin()&&blocked(location.pathname)){location.replace(chat);}}"
                    + "if(!window.__aiUserAppRouteGuardInstalled){"
                    + "window.__aiUserAppRouteGuardInstalled=true;"
                    + "var push=history.pushState;"
                    + "var replace=history.replaceState;"
                    + "history.pushState=function(){var result=push.apply(this,arguments);setTimeout(guard,0);return result;};"
                    + "history.replaceState=function(){var result=replace.apply(this,arguments);setTimeout(guard,0);return result;};"
                    + "window.addEventListener('popstate',function(){setTimeout(guard,0);});"
                    + "}"
                    + "guard();"
                    + "})();";

            view.evaluateJavascript(
                routeGuardScript,
                null
            );
        }
    }
}
