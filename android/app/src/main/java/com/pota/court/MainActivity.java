package com.pota.court;

import android.app.Activity;
import android.app.ActivityManager;
import android.hardware.display.DisplayManager;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import org.json.JSONObject;
import android.graphics.Color;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** A small offline WebView host. The HTML includes every game asset. */
@SuppressWarnings("deprecation")
public final class MainActivity extends Activity {
    private static final String GAME_URL = "file:///android_asset/index.html";
    private WebView web;
    private FrameLayout root;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private boolean paused;
    private boolean destroyed;
    private volatile boolean trustedPage;
    private volatile String deviceInfo = "{}";
    private volatile String performancePreference = "smooth";
    private AdsController ads;
    private DisplayManager displayManager;
    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        @Override public void onDisplayAdded(int id) { updateDisplay(); }
        @Override public void onDisplayRemoved(int id) { updateDisplay(); }
        @Override public void onDisplayChanged(int id) { updateDisplay(); }
    };

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(37, 43, 41));
        setContentView(root);
        enterImmersive();
        String savedPreference = getPreferences(MODE_PRIVATE).getString("performancePreference", "smooth");
        if ("graphics".equals(savedPreference) || "balanced".equals(savedPreference)) performancePreference = savedPreference;
        displayManager = (DisplayManager) getSystemService(DISPLAY_SERVICE);
        displayManager.registerDisplayListener(displayListener, new Handler(Looper.getMainLooper()));
        updateDisplay();
        createWebView();
        ads = new AdsController(this);
    }

    private void createWebView() {
        root.removeAllViews();
        try {
            web = new WebView(this);
            // pauseTimers is process-wide; clear it after a background renderer crash.
            if (!paused) { web.resumeTimers(); web.onResume(); }
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
            web.setBackgroundColor(Color.rgb(37, 43, 41));
            web.setOverScrollMode(View.OVER_SCROLL_NEVER);
            web.setVerticalScrollBarEnabled(false);
            web.setHorizontalScrollBarEnabled(false);
            WebSettings settings = web.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false); // android_asset remains accessible.
            settings.setAllowContentAccess(false);
            settings.setAllowFileAccessFromFileURLs(false);
            settings.setAllowUniversalAccessFromFileURLs(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setBlockNetworkLoads(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setSupportMultipleWindows(false);
            settings.setMediaPlaybackRequiresUserGesture(true);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
            settings.setTextZoom(100);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            web.addJavascriptInterface(new NativeBridge(), "PotaNative");
            web.setWebViewClient(Build.VERSION.SDK_INT >= 26 ? new ModernClient() : new LocalClient());
            web.setWebChromeClient(new WebChromeClient() {
                @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                    if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                    fullscreenView = view;
                    fullscreenCallback = callback;
                    web.setVisibility(View.GONE);
                    root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                    enterImmersive();
                }
                @Override public void onHideCustomView() { hideFullscreen(); }
            });
            root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            web.loadUrl(GAME_URL);
            web.requestFocus();
        } catch (RuntimeException error) {
            if (web != null) { root.removeView(web); web.destroy(); web = null; }
            showWebViewError("Android System WebView uygulamasını güncelleyip yeniden dene.");
        }
    }

    private class LocalClient extends WebViewClient {
        private boolean rejectNavigation(String url) {
            return !GAME_URL.equals(url) && !url.startsWith(GAME_URL + "#");
        }
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return rejectNavigation(request.getUrl().toString());
        }
        @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return rejectNavigation(url);
        }
        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            trustedPage = !rejectNavigation(url);
        }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            if (GAME_URL.equals(url) || url.startsWith("data:") || url.startsWith("blob:")) return null;
            return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
        }
        @Override public void onPageFinished(WebView view, String url) {
            trustedPage = !rejectNavigation(url);
            if (!trustedPage) return;
            updateDisplay();
            if (paused) pauseGame();
            else view.evaluateJavascript("window.dispatchEvent(new Event('pota:resume'));", null);
            enterImmersive();
        }
    }

    private final class ModernClient extends LocalClient {
        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (fullscreenView != null) hideFullscreen();
            root.removeView(view);
            if (web == view) web = null;
            view.destroy();
            if (!destroyed) showWebViewError("Grafik bağlantısı kesildi. Yeniden açarak devam edebilirsin.");
            return true;
        }
    }

    private void showWebViewError(String message) {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        int spacing = Math.round(28 * getResources().getDisplayMetrics().density);
        panel.setPadding(spacing, spacing, spacing, spacing);
        TextView text = new TextView(this);
        text.setText("POTA\n\n" + message);
        text.setTextColor(Color.rgb(239, 237, 226));
        text.setTextSize(18);
        text.setGravity(Gravity.CENTER);
        panel.addView(text);
        Button retry = new Button(this);
        retry.setText("Yeniden aç");
        retry.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View ignored) { createWebView(); }
        });
        panel.addView(retry);
        root.addView(panel, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    /** The bridge is installed only into the network-blocked local asset document. */
    public final class NativeBridge {
        @JavascriptInterface public String getDeviceInfo() { return trustedPage ? deviceInfo : "{}"; }
        @JavascriptInterface public void setPerformancePreference(String preference) {
            if (!trustedPage || !("smooth".equals(preference) || "balanced".equals(preference) || "graphics".equals(preference))) return;
            runOnUiThread(() -> {
                if (destroyed || !trustedPage || preference.equals(performancePreference)) return;
                performancePreference = preference;
                getPreferences(MODE_PRIVATE).edit().putString("performancePreference", preference).apply();
                updateDisplay();
            });
        }
        @JavascriptInterface public String getAdsState() { return trustedPage && ads != null ? ads.state() : "{}"; }
        @JavascriptInterface public boolean requestRewarded(int multiplier, String requestId) {
            return trustedPage && ads != null && ads.request(multiplier, requestId);
        }
        @JavascriptInterface public boolean openPrivacyPolicy() {
            if (!trustedPage || !BuildConfig.PRIVACY_POLICY_URL.startsWith("https://")) return false;
            runOnUiThread(() -> {
                try { startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(BuildConfig.PRIVACY_POLICY_URL))); }
                catch (RuntimeException ignored) { }
            });
            return true;
        }
        @JavascriptInterface public void showPrivacyOptions() {
            if (trustedPage && ads != null) ads.privacyOptions();
        }
    }

    void dispatchNativeEvent(String type, JSONObject detail) {
        if (web == null || destroyed || !trustedPage) return;
        final String script = "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(type) + ",{detail:" + detail.toString() + "}));";
        runOnUiThread(() -> { if (web != null && !destroyed && trustedPage) web.evaluateJavascript(script, null); });
    }

    void restoreAfterAd() {
        if (destroyed) return;
        enterImmersive(); updateDisplay();
        if (!paused && web != null) web.evaluateJavascript("window.dispatchEvent(new Event('pota:resume'));", null);
    }

    private void updateDisplay() {
        if (destroyed) return;
        Display display = getWindowManager().getDefaultDisplay();
        Display.Mode current = display.getMode(), sixty = null, ninety = null, oneTwenty = null;
        Display.Mode balancedHigh = null, smoothHigh = null, lowest = null;
        for (Display.Mode mode : display.getSupportedModes()) {
            if (mode.getPhysicalWidth() != current.getPhysicalWidth() || mode.getPhysicalHeight() != current.getPhysicalHeight()) continue;
            float rate = mode.getRefreshRate();
            if (lowest == null || rate < lowest.getRefreshRate()) lowest = mode;
            if (rate >= 59f && rate <= 61f && (sixty == null || Math.abs(rate - 60f) < Math.abs(sixty.getRefreshRate() - 60f))) sixty = mode;
            if (rate >= 89f && rate <= 91f && (ninety == null || Math.abs(rate - 90f) < Math.abs(ninety.getRefreshRate() - 90f))) ninety = mode;
            if (rate >= 119f && rate <= 121f && (oneTwenty == null || Math.abs(rate - 120f) < Math.abs(oneTwenty.getRefreshRate() - 120f))) oneTwenty = mode;
            if (rate >= 89f && (balancedHigh == null || rate < balancedHigh.getRefreshRate())) balancedHigh = mode;
            if (rate >= 119f && (smoothHigh == null || rate < smoothHigh.getRefreshRate())) smoothHigh = mode;
        }
        Display.Mode fallback = sixty != null ? sixty : lowest != null ? lowest : current;
        Display.Mode chosen = fallback;
        if ("balanced".equals(performancePreference)) chosen = ninety != null ? ninety : balancedHigh != null ? balancedHigh : fallback;
        else if ("smooth".equals(performancePreference)) chosen = oneTwenty != null ? oneTwenty : smoothHigh != null ? smoothHigh : fallback;
        WindowManager.LayoutParams params = getWindow().getAttributes();
        if (params.preferredDisplayModeId != chosen.getModeId() || Math.abs(params.preferredRefreshRate - chosen.getRefreshRate()) > .05f) {
            params.preferredDisplayModeId = chosen.getModeId();
            params.preferredRefreshRate = chosen.getRefreshRate();
            getWindow().setAttributes(params);
        }
        ActivityManager manager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo(); manager.getMemoryInfo(memory);
        JSONObject info = new JSONObject();
        try {
            float rate = display.getRefreshRate();
            int target = "graphics".equals(performancePreference) ? 60 : "balanced".equals(performancePreference) ? (rate >= 89f ? 90 : 60) : (rate >= 119f ? 120 : 60);
            info.put("refreshRate", rate).put("preferredRefreshRate", chosen.getRefreshRate())
                .put("targetFps", target).put("performancePreference", performancePreference)
                .put("memoryGB", memory.totalMem / (1024d * 1024d * 1024d))
                .put("lowRam", manager.isLowRamDevice()).put("nativeHost", true).put("apiLevel", Build.VERSION.SDK_INT);
        } catch (Exception ignored) { }
        String updatedInfo = info.toString();
        if (!updatedInfo.equals(deviceInfo)) {
            deviceInfo = updatedInfo;
            dispatchNativeEvent("pota:display-change", info);
        }
    }

    private void hideFullscreen() {
        if (fullscreenView == null) return;
        root.removeView(fullscreenView);
        fullscreenView = null;
        if (web != null) web.setVisibility(View.VISIBLE);
        WebChromeClient.CustomViewCallback callback = fullscreenCallback;
        fullscreenCallback = null;
        if (callback != null) callback.onCustomViewHidden();
        enterImmersive();
    }

    private void enterImmersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) enterImmersive();
    }

    private void pauseGame() {
        if (web == null) return;
        web.evaluateJavascript("window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('pota:pause'));", null);
    }

    @Override protected void onPause() {
        paused = true;
        if (ads != null) ads.foreground(false);
        pauseGame();
        if (web != null) { web.onPause(); web.pauseTimers(); }
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        paused = false;
        updateDisplay();
        if (ads != null) ads.foreground(true);
        if (web != null) {
            web.resumeTimers(); web.onResume();
            web.evaluateJavascript("window.dispatchEvent(new Event('pota:resume'));", null);
        }
        enterImmersive();
    }

    @Override public void onBackPressed() {
        if (fullscreenView != null) { hideFullscreen(); return; }
        if (web == null) { finish(); return; }
        web.evaluateJavascript("(function(){var dialogs=document.querySelectorAll('dialog[open]');if(dialogs.length){dialogs[dialogs.length-1].close();return true;}return false;})()",
            new ValueCallback<String>() {
                @Override public void onReceiveValue(String handled) {
                    if (destroyed || isFinishing() || "true".equals(handled)) return;
                    finish();
                }
            });
    }

    @Override protected void onDestroy() {
        if (ads != null) { ads.destroy(); ads = null; }
        destroyed = true;
        trustedPage = false;
        if (displayManager != null) displayManager.unregisterDisplayListener(displayListener);
        if (fullscreenView != null) hideFullscreen();
        if (web != null) {
            web.evaluateJavascript("window.dispatchEvent(new Event('pota:pause'));", null);
            web.stopLoading();
            root.removeView(web);
            web.removeJavascriptInterface("PotaNative");
            web.setWebChromeClient(null);
            web.setWebViewClient(null);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
