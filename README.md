# POTA — Google Play projesi 2.0.3

Güncel Android Studio/Gradle kaynak projesi: **POTA 2.0.3**, `versionCode 17`, paket `com.pota.court`. Android 6.0+ (`minSdk 23`), `compileSdk/targetSdk 36`. Ana dağıtım `offlineRelease` ve reklamsızdır.

## Android Studio ile açma

1. Bu ZIP'i normal bir klasöre çıkar. Android Studio'da **Open → android/** klasörünü aç. JDK 21, Android SDK Platform 36 ve Build Tools 36.0.0 kur.
2. Kendi SDK yolun için Android Studio'nun `android/local.properties` üretmesine izin ver veya yerel `sdk.dir=...` alanını oluştur. Bu dosya makineye özel olduğu için pakette yoktur. Gradle 8.14.3 sarmalayıcısı ve Android Gradle Plugin 8.13.2 sabitlenmiştir.
3. Daha önce ayrı teslim edilen **POTA-imza-anahtari-2.0.0.zip** özel yedeğinden `pota-upload.jks` dosyasını **android/signing/pota-local.jks** konumuna kopyala. O özel yedeğin `IMZA-BILGILERI.txt` belgesindeki alias ve güçlü parolaları kendi **~/.gradle/gradle.properties** dosyana `POTA_KEY_ALIAS`, `POTA_STORE_PASSWORD`, `POTA_KEY_PASSWORD` özellikleri olarak ekle veya aynı adlı ortam değişkenlerini kullan. Değerleri proje kaynaklarına veya genel ZIP'e yazma. Bu ZIP'te JKS veya gerçek özel parola yoktur.
4. Build Variants'tan **offlineRelease** seç; release AAB için `:app:bundleOfflineRelease`, kurulum APK'sı için `:app:assembleOfflineRelease` görevlerini çalıştır.

`android/app/build.gradle` kaynakla aynı tutulmuştur; içindeki tarihsel geliştirme varsayımlarını kullanmak yerine yukarıdaki özel POTA_* özelliklerini sağlamalısın. Debug varyantı da mevcut yapılandırmada aynı korunmuş imza anahtarını bekler. Yeni bir anahtar üretip mevcut uygulamanın yerinde güncelleneceğini varsayma.

## Oyun kaynağını değiştirdikten sonra

ZIP'in kökünde `python3 pack.py` çalıştır. Bu komut yalnız **android/app/src/main/assets/index.html** dahili varlığını günceller; bağımsız HTML dağıtımı üretmez. Ardından `android/` klasöründe Gradle derlemesini çalıştır:

```sh
python3 pack.py
cd android
./gradlew :app:assembleOfflineRelease :app:bundleOfflineRelease
```

Windows'ta `gradlew.bat` kullan. Çıktılar `android/app/build/outputs/apk/offline/release/` ve `android/app/build/outputs/bundle/offlineRelease/` altındadır.

Linux'ta araçları sabit SHA-256 ile indiren `android/tools/fetch.sh` isteğe bağlıdır; bu betik Android SDK/Gradle/bundletool araçlarını indirir, tam JDK'yı sen kurmalısın. Kendi SDK'n yerine bu minimal araç dizinini kullanırsan `local.properties` içindeki `sdk.dir` alanını çıkardığın projenin **android/tools** dizinine ayarla. `android/build.sh` derleme ve ek imza/içerik doğrulaması yapar; `android/verify.py` içindeki yardımcı araç yolları bu indirilen Linux araçlarını bekler. Normal Android Studio/Gradle derlemesi fetch betiğini gerektirmez.

## İçerik ve imza

- `src/`, `vendor/`, `pack.py`: güncel oyun kaynağı, gömülü sesler ve lisans/provenans dosyaları.
- `android/`: Gradle wrapper JAR dahil Android Studio projesi; ana/offline/gelecek monetized kaynak setleri.
- `qa/`: seçili fizik, ses, performans, ödül ve davranış denetimi testleri.
- `play-release/`: güncel yayın notları ve mağaza/politika şablonları. Ekran görüntüleri önceki 2.0.0 yakalaması olduğu için güncel arayüzden yeniden alınmalı; özgün hash'ler korunur.
- `SOURCE-MANIFEST.json`: oyun ve Android derleme kaynaklarının çalışma alanıyla birebir SHA-256 eşleşmesi; belge paketlemeleri hariç.

Açık sertifika **android/signing/upload-certificate.pem** içindedir. SHA-256:

`63bb7a92b5f55cd58f93d54bc3008a14a8f1adc92a2011bab97df1bd5f014a81`

Özel anahtar, özel parola dosyaları, `local.properties`, derleme önbellekleri, indirilen SDK/JDK/Gradle araçları pakete alınmadı. İmzalı APK/AAB ve yayın materyalleri ayrı **POTA-Google-Play-Yayin-Dosyalari-2.0.3.zip** arşivindedir. Google Play'e APK yerine AAB yükle. App Signing/PEPK aktarım kararları için `play-release/signing-and-backup-tr.md` dosyasını oku. Geliştirici kimliği, destek e-postası, herkese açık gizlilik URL'si ve Console beyanları henüz yayıncı tarafından tamamlanmalıdır.

Bu teslim makro denetimi güncellenen 2.0.3 kaynağının paketlenmesidir. Makro denetimi istemci tarafında davranış ölçer; cihazda kurulu uygulamaları taramaz. Kullanıcının özel videosu ve inceleme görüntüleri genel paketlere alınmadı. Fiziksel telefon, Google Play iç test ve gerçek reklam yayını bu ortamda denenmedi.
