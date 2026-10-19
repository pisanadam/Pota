# Android WebView calls only explicitly annotated bridge members.
-keepclassmembers class com.pota.court.MainActivity$NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
