package com.pota.court;
/** SDK-free release. No network, ad initialization, consent dialogs or fake rewards. */
final class AdsController {
    AdsController(MainActivity activity) { }
    String state() { return "{\"configured\":false,\"ready\":false,\"online\":false,\"busy\":false,\"testMode\":false,\"privacyRequired\":false,\"consentReady\":false,\"canRequestAds\":false,\"privacyPolicyAvailable\":" + (!BuildConfig.PRIVACY_POLICY_URL.isEmpty()) + "}"; }
    boolean request(int multiplier, String id) { return false; }
    void privacyOptions() { }
    void foreground(boolean value) { }
    void destroy() { }
}
