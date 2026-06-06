package com.aiknowledge.chat;

import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String USER_APP_ORIGIN = "https://stately-sawine-1efd4d.netlify.app";
    private static final String USER_CHAT_URL = USER_APP_ORIGIN + "/chat-ui";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setWebViewClient(new UserAppWebViewClient(getBridge()));
        }
    }

    @Override
    public void onBackPressed() {
        if (getBridge() != null && getBridge().getWebView() != null && getBridge().getWebView().canGoBack()) {
            getBridge().getWebView().goBack();
            return;
        }

        super.onBackPressed();
    }

    private static boolean isForbiddenUserRoute(Uri uri) {
        if (!USER_APP_ORIGIN.equals(uri.getScheme() + "://" + uri.getHost())) {
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

    private static class UserAppWebViewClient extends BridgeWebViewClient {
        UserAppWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (isForbiddenUserRoute(url)) {
                view.loadUrl(USER_CHAT_URL);
                return true;
            }

            return super.shouldOverrideUrlLoading(view, request);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            Uri uri = Uri.parse(url);
            if (isForbiddenUserRoute(uri)) {
                view.stopLoading();
                view.loadUrl(USER_CHAT_URL);
                return;
            }

            super.onPageStarted(view, url, favicon);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            view.evaluateJavascript(
                "(function(){"
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
                    + "})();",
                null
            );
        }
    }
}
