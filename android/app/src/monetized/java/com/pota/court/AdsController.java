package com.pota.court;

import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;
import org.json.JSONObject;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/** Native-only eligibility and reward accounting. Time passing never earns a reward. */
final class AdsController {
    private final MainActivity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ConnectivityManager connectivity;
    private final ConsentInformation consent;
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile String state = "{}";
    private volatile boolean ready;
    private boolean destroyed, loading, sdkReady, initializationStarted, consentReady, foreground = true;
    private RewardedAd loadedAd;
    private Request pending;
    private JSONObject lastReward;
    private int loadGeneration;
    private static final class Request {
        final String id; final int multiplier, required;
        int completed;
        boolean currentEarned;
        Request(String id, int multiplier) { this.id=id; this.multiplier=multiplier; required=multiplier==3 ? 2 : 1; }
    }
    private final ConnectivityManager.NetworkCallback networkCallback = new ConnectivityManager.NetworkCallback() {
        @Override public void onAvailable(Network network) { networkChanged(); }
        @Override public void onLost(Network network) { networkChanged(); }
        @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) { networkChanged(); }
    };
    AdsController(MainActivity activity) {
        this.activity = activity;
        connectivity = (ConnectivityManager) activity.getSystemService(MainActivity.CONNECTIVITY_SERVICE);
        consent = UserMessagingPlatform.getConsentInformation(activity);
        try {
            if (Build.VERSION.SDK_INT >= 24) connectivity.registerDefaultNetworkCallback(networkCallback);
            else connectivity.registerNetworkCallback(new NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), networkCallback);
        } catch (RuntimeException ignored) { }
        publish();
        if (BuildConfig.ADS_ENABLED && online()) gatherConsent();
    }
    boolean online() {
        try {
            NetworkCapabilities capabilities = connectivity.getNetworkCapabilities(connectivity.getActiveNetwork());
            return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        } catch (RuntimeException ignored) { return false; }
    }
    String state() {
        if (!busy.get()) return state;
        return withoutProof();
    }
    private String withoutProof() {
        try { JSONObject result = new JSONObject(state); result.remove("lastReward"); result.put("busy", true); return result.toString(); }
        catch (Exception ignored) { return "{}"; }
    }
    private void networkChanged() {
        main.post(() -> {
            if (destroyed) return;
            if (!online()) {
                loadedAd = null; loading = false; loadGeneration++;
                // A displayed ad may finish legitimately; a missing next ad cannot.
                if (pending != null && !showing) finish(false, "offline");
            } else if (BuildConfig.ADS_ENABLED && !consentReady) gatherConsent();
            else load(false);
            publish();
        });
    }
    private boolean gathering;
    private void gatherConsent() {
        if (gathering || destroyed || !online() || !BuildConfig.ADS_ENABLED) { publish(); return; }
        gathering = true;
        ConsentRequestParameters parameters = new ConsentRequestParameters.Builder().build();
        consent.requestConsentInfoUpdate(activity, parameters, () -> {
            if (destroyed) return;
            UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, formError -> {
                gathering = false;
                consentReady = formError == null && consent.canRequestAds();
                if (consentReady) initialize();
                else { loadedAd = null; publish(); }
            });
        }, error -> { gathering = false; consentReady = false; publish(); });
    }
    private void initialize() {
        if (destroyed || !consentReady) { publish(); return; }
        if (sdkReady) { load(false); return; }
        if (initializationStarted) { publish(); return; }
        initializationStarted = true;
        // GMA initialization can perform expensive work. Keep it off the render/UI thread.
        new Thread(() -> MobileAds.initialize(activity, initializationStatus -> main.post(() -> {
            if (destroyed) return;
            sdkReady = true; load(false); publish();
        })), "pota-ad-init").start();
    }
    void privacyOptions() {
        main.post(() -> {
            if (destroyed || busy.get() || !online() || !BuildConfig.ADS_ENABLED) return;
            loadedAd = null; loading = false; loadGeneration++;
            UserMessagingPlatform.showPrivacyOptionsForm(activity, error -> {
                consentReady = error == null && consent.canRequestAds();
                if (consentReady) { if (!sdkReady) initialize(); else load(false); }
                publish();
            });
            publish();
        });
    }
    /** Called on WebView's bridge thread. Reserve synchronously to reject double clicks. */
    boolean request(int multiplier, String id) {
        if ((multiplier != 2 && multiplier != 3) || id == null || !id.matches("[A-Za-z0-9._:-]{8,120}")
            || !ready || !online() || !busy.compareAndSet(false, true)) return false;
        main.post(() -> {
            if (destroyed || !foreground || !consentReady || !BuildConfig.ADS_ENABLED || !online() || loadedAd == null) {
                pending = new Request(id, multiplier); finish(false, "unavailable"); return;
            }
            lastReward = null;
            pending = new Request(id, multiplier);
            final Request request = pending;
            main.postDelayed(() -> { if (pending == request) finish(false, "timeout"); }, 180000);
            show();
        });
        return true;
    }
    private void load(boolean forSequence) {
        if (destroyed || loading || loadedAd != null || !sdkReady || !consentReady || !online()
            || !BuildConfig.ADS_ENABLED || (!forSequence && busy.get())) { publish(); return; }
        loading = true;
        final int generation = ++loadGeneration;
        main.postDelayed(() -> {
            if (!destroyed && loading && loadGeneration == generation) {
                loading = false; loadGeneration++;
                if (pending != null) finish(false, "load_timeout"); else publish();
            }
        }, 30000);
        RewardedAd.load(activity, BuildConfig.REWARDED_AD_UNIT, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override public void onAdLoaded(RewardedAd ad) {
                if (destroyed || loadGeneration != generation) return;
                loading = false; loadedAd = ad;
                // Dismissal may precede MainActivity.onResume. Keep the second ad
                // loaded until the host is foreground instead of failing or losing it.
                if (pending != null && !showing && foreground) show(); else publish();
            }
            @Override public void onAdFailedToLoad(LoadAdError error) {
                if (destroyed || loadGeneration != generation) return;
                loading = false; loadedAd = null;
                if (pending != null) finish(false, "load_failed"); else publish();
                // Bounded retries, no per-frame polling and no offline loop.
                main.postDelayed(() -> { if (!destroyed && online() && foreground && !busy.get()) load(false); }, 60000);
            }
        });
        publish();
    }
    private boolean showing;
    private void show() {
        final Request request = pending;
        if (request == null) return;
        if (!foreground) { publish(); return; }
        if (destroyed || !online() || !consentReady || loadedAd == null) { finish(false, "unavailable"); return; }
        final RewardedAd ad = loadedAd; loadedAd = null;
        request.currentEarned = false; showing = true;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() {
                showing = false;
                if (pending != request) { publish(); return; }
                if (!request.currentEarned) { finish(false, "closed_early"); return; }
                request.completed++;
                if (request.completed == request.required) finish(true, "completed");
                else if (!online()) finish(false, "offline");
                else { load(true); publish(); }
                activity.restoreAfterAd();
            }
            @Override public void onAdFailedToShowFullScreenContent(AdError error) {
                showing = false;
                if (pending == request) finish(false, "show_failed");
                activity.restoreAfterAd();
            }
        });
        publish();
        try {
            ad.show(activity, reward -> {
                if (pending == request && showing) request.currentEarned = true;
            });
        } catch (RuntimeException error) {
            showing = false;
            if (pending == request) finish(false, "show_failed");
            activity.restoreAfterAd();
        }
    }
    private void finish(boolean earned, String reason) {
        final Request request = pending;
        if (request == null) { busy.set(false); publish(); return; }
        pending = null; busy.set(false);
        JSONObject result = new JSONObject();
        try {
            result.put("requestId", request.id).put("multiplier", request.multiplier)
                .put("completedAds", request.completed).put("requiredAds", request.required)
                .put("earned", earned).put("reason", reason).put("online", online());
            if (earned && request.completed == request.required) {
                result.put("token", UUID.randomUUID().toString());
                lastReward = new JSONObject(result.toString());
            }
        } catch (Exception ignored) { }
        publish(); // Proof must exist before the JavaScript result callback.
        activity.dispatchNativeEvent("pota:ad-result", result);
        if (!showing) load(false);
    }
    void foreground(boolean value) {
        foreground = value;
        if (!value && pending != null && !showing) finish(false, "backgrounded");
        if (value) {
            if (pending != null && !showing) {
                if (loadedAd != null) show(); else load(true);
            } else if (BuildConfig.ADS_ENABLED && !consentReady && online()) gatherConsent();
            else load(false);
        }
        publish();
    }
    private void publish() {
        ready = !destroyed && BuildConfig.ADS_ENABLED && consentReady && sdkReady && online()
            && foreground && !busy.get() && loadedAd != null;
        JSONObject result = new JSONObject();
        try {
            result.put("configured", BuildConfig.ADS_ENABLED).put("ready", ready).put("online", online())
                .put("busy", busy.get()).put("testMode", BuildConfig.ADS_TEST_MODE)
                .put("privacyPolicyAvailable", !BuildConfig.PRIVACY_POLICY_URL.isEmpty())
                .put("canRequestAds", consentReady).put("consentReady", consentReady)
                .put("privacyRequired", consent.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED);
            if (lastReward != null) result.put("lastReward", lastReward);
        } catch (Exception ignored) { }
        state = result.toString();
        activity.dispatchNativeEvent("pota:ad-state", result);
    }
    void destroy() {
        destroyed = true;
        if (pending != null) finish(false, "destroyed"); ready = false; loadedAd = null;
        main.removeCallbacksAndMessages(null);
        try { connectivity.unregisterNetworkCallback(networkCallback); } catch (RuntimeException ignored) { }
    }
}
