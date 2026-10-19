# Android izinleri — mevcut çevrimdışı sürüm

Teslim edilen ana APK/AAB **offline flavor** olarak hazırlanır. Google Mobile Ads ve UMP bağımlılıkları, reklam başlangıç sağlayıcıları ve ağ/reklam izinleri bu flavor'dan çıkarılır.

- **Doğrulanan tek izin:** `android.permission.VIBRATE` (oyun geri bildirimi).
- `INTERNET`, `ACCESS_NETWORK_STATE`, `AD_ID`, AdServices reklam izinleri ve reklam SDK hizmet/sağlayıcıları ana offline sürümün parçası değildir.
- Kamera, mikrofon, rehber, hassas konum ve genel depolama erişimi istenmez.

Android derleme ajanının gerçek offlineRelease birleşik manifest kontrolü: **yalnız VIBRATE**, reklam SDK sağlayıcı/hizmeti yok; min23, target36, 2.0.0/versionCode14. Nihai yeniden derleme raporuyla eşleştirin. Buradaki liste uygulama tasarımını anlatır; derleme doğrulamasının yerine geçmez. SDK'lı gelecekteki flavor'ın izin taslağı `../future-monetized/policies/android-permissions.md` içindedir ve mevcut sürüme uygulanmaz.

minSdk 23, compile/targetSdk 36. Native `.so` bulunmadığı son AAB üzerinde doğrulanmalıdır; native kütüphanesi olmayan Java/WebView uygulaması 64 bit/16 KB gereksinimlerini karşılamak açısından farklı bir NDK paketi gerektirmez. Fiziksel 16 KB cihaz testi yapılmış sayılmaz.
