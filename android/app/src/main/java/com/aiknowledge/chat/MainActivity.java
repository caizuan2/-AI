package com.aiknowledge.chat;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String APP_ORIGIN = "https://stately-sawine-1efd4d.netlify.app";
    private static final String USER_CHAT_URL = APP_ORIGIN + "/chat-ui";
    private static final String ADMIN_INGEST_URL = APP_ORIGIN + "/ingest";
    private static final String ADMIN_APP_PACKAGE = "com.aiknowledge.admin";
    private static final int FILE_CHOOSER_REQUEST_CODE = 6205;
    private ValueCallback<Uri[]> fileChooserCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();

            configureSessionPersistence(webView);
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

    private boolean isAdminShell() {
        return ADMIN_APP_PACKAGE.equals(getPackageName());
    }

    private void configureSessionPersistence(WebView webView) {
        WebSettings settings = webView.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

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
        return APP_ORIGIN.equals(uri.getScheme() + "://" + uri.getHost());
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
            || path.equals("/download")
            || path.startsWith("/download/")
            || path.equals("/user-download.html");
    }

    private class AppWebChromeClient extends BridgeWebChromeClient {
        AppWebChromeClient(Bridge bridge) {
            super(bridge);
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

    private static class AppRouteWebViewClient extends BridgeWebViewClient {
        private final boolean adminShell;

        AppRouteWebViewClient(Bridge bridge, boolean adminShell) {
            super(bridge);
            this.adminShell = adminShell;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (adminShell && isForbiddenAdminRoute(url)) {
                view.loadUrl(ADMIN_INGEST_URL);
                return true;
            }

            if (!adminShell && isForbiddenUserRoute(url)) {
                view.loadUrl(USER_CHAT_URL);
                return true;
            }

            return super.shouldOverrideUrlLoading(view, request);
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
                    + "var origin='https://stately-sawine-1efd4d.netlify.app';"
                    + "var chat=origin+'/chat-ui';"
                    + "function blocked(path){return path==='/ingest'||path.indexOf('/ingest/')===0||path==='/admin'||path.indexOf('/admin/')===0||path==='/api/admin'||path.indexOf('/api/admin/')===0;}"
                    + "function guard(){if(location.origin===origin&&blocked(location.pathname)){location.replace(chat);}}"
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
