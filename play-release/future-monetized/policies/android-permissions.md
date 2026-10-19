> **GELECEKTEKİ REKLAMLI SÜRÜM TASLAĞI — mevcut offline APK/AAB için kullanmayın.**

# Android izin envanteri

Android derleme ajanının **Google Mobile Ads 24.9.0 + UMP 4.0.0** birleşik manifestinde bildirdiği izinler, 18 Ekim 2026:

| İzin | Genel kaynak / açıklama |
|---|---|
| `android.permission.VIBRATE` | Oyun geri bildirimi |
| `android.permission.INTERNET` | Reklam, izin ve çevrimiçi gizlilik bağlantıları |
| `android.permission.ACCESS_NETWORK_STATE` | Bağlantı uygunluğunu değerlendirme |
| `com.google.android.gms.permission.AD_ID` | Google reklam SDK'sının reklam kimliği erişimi; gerçek kullanım ve kullanıcı ayarları ayrıca geçerli |
| `android.permission.ACCESS_ADSERVICES_AD_ID` | SDK tarafından eklenen Android reklam hizmeti erişimi |
| `android.permission.ACCESS_ADSERVICES_ATTRIBUTION` | SDK tarafından eklenen reklam ilişkilendirme hizmeti erişimi |
| `android.permission.ACCESS_ADSERVICES_TOPICS` | SDK tarafından eklenen reklam konuları hizmeti erişimi |
| `android.permission.WAKE_LOCK` | SDK bağımlılıklarından gelen güç yönetimi izni |
| `android.permission.FOREGROUND_SERVICE` | SDK bağımlılıklarından gelen ön plan hizmeti izni |
| `com.pota.court.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX'in dışa açık olmayan dinamik alıcıları koruyan uygulama içi güvenlik izni; kullanıcı verisi kategorisi değildir |

Hassas konum, kamera, mikrofon, rehber veya genel depolama erişimi bu listeye dahil değildir. Reklam amaçlı yaklaşık konum IP'den tahmin edilebilir; konum izni olmaması bu veri işlemenin olmadığını göstermez.

Bir iznin manifestte bulunması o API'nin her oturumda kullanıldığını kanıtlamaz. İzin listesi, SDK veri açıklaması veya gerçek ağ/çalışma davranışı incelemesinin yerine geçmez. Nihai AAB manifestini derleme raporuyla karşılaştırın; SDK değişirse bu listeyi ve Veri Güvenliği beyanını güncelleyin.

Derleme bilgisi: compileSdk/targetSdk **36**, minSdk **23**. Birleştirme aşamasında paketlenecek yerel `.so` kütüphanesi bildirilmemiştir (`mergeNativeLibs: NO-SOURCE`); son AAB'nin de native dosya içermediği ayrıca doğrulanmalıdır. Bu, fiziksel 16 KB cihazda test yapıldığı anlamına gelmez.
