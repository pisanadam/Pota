> **Güncel proje: POTA 2.0.3 / versionCode 17.** Aşağıdaki belge önceki 2.0.0 kurulum kılavuzudur; sürüm/tercih bilgileri için `../README.md` ve `../play-release/SURUM-2.0.3.md` esas alınmalıdır. Özel imza yedeğinin güçlü parolalarını POTA_* ortam/Gradle özellikleriyle sağlayın.

# POTA Android 2.0.0

`com.pota.court`, sürüm kodu **14**, Android 6.0+ (min SDK 23), compile/target SDK **36**. Oyun bütün varlıklarıyla APK/AAB içine gömülür ve çevrimdışı çalışır. Google Play'e yükleme dosyası AAB'dir. Güncel Android System WebView gerekir. WebGL varsa 3B sahne açılır; yoksa 2B uyumluluk görünümü kullanılır. Cihaz başına performans donanıma bağlıdır.

## Derleme

Tam JDK 21 (yalnız JRE yeterli değildir), Python 3 ve Linux gerekir. Android Studio ile proje açılabilir. Sabit sürümler: Gradle 8.14.3, Android Gradle Plugin 8.13.2, Build Tools 36.0.0, İsteğe bağlı gelecek reklam varyantında Google Mobile Ads **24.9.0**, UMP **4.0.0** kullanılır. Ana `offlineRelease` dosyası bu SDK’ları içermez. Mobile Ads 25.x API 24 gerektirdiğinden gelecek reklam dalı Android 6 desteği için 24.9 kullanır.

```bash
bash tools/fetch.sh
python3 ../pack.py
bash build.sh
```

`pack.py` yalnız uygulamanın dahili `app/src/main/assets/index.html` varlığını üretir; ayrı HTML dağıtımı yapılmaz. `local.properties` içindeki `sdk.dir` yerel Android SDK'nıza göre değiştirilebilir. Tam SDK kurulu sistemde doğrudan:

```bash
./gradlew :app:assembleOfflineRelease :app:bundleOfflineRelease
```

`build.sh` SDK ve reklam içermeyen APK ile AAB üretir. İleride isteğe bağlı `POTA_BUILD_AD_TEST=1 bash build.sh` komutu ayrı `com.pota.court.debug` paketli, Google test reklamlarını kullanan APK da üretir. Release APK/AAB aynı korunan sertifikayla imzalanır. ZIP bütünlüğü, v1/v2/v3 APK imzaları, AAB JAR imzası, hedef API, sertifika, kaynakla birebir oyun varlığı, bundletool doğrulaması ve yerel kütüphaneler kontrol edilir. Rapor `build/build-report.json` içindedir. `.so` kütüphanesi yoktur; 16 KB ELF sayfa hizalaması gerektiren yerel kod bulunmaz. Fiziksel telefon ve gerçek reklam yayını test edilmemiştir.

## Gerçek reklamlar için gerekli yapılandırma

**Kullanıcının reklamları şimdilik erteleme tercihiyle teslim edilen `offlineRelease` tamamen reklamsızdır.** AdMob/UMP SDK’ları, reklam sağlayıcıları, WorkManager ve internet/ağ izinleri ana APK/AAB’ye girmez. Sahte reklam veya ödül bulunmaz. Gelecek `monetized` varyantının kaynakları ayrı tutulur. Bu varyantın debug APK’sı yalnız Google’ın resmi test kimliklerini kullanır; mağazaya yüklenmez. Gerçek kimlikler eksikse `monetizedRelease` derlemesi kapalıdır.

Gelecekte gerçek reklam eklemek için gerçek AdMob uygulama ve ödüllü reklam birimi kimliklerini ortam değişkenleri veya özel `~/.gradle/gradle.properties` üzerinden verin, ardından `./gradlew :app:assembleMonetizedRelease :app:bundleMonetizedRelease` çalıştırın. Ana `offlineRelease` bu kimlikler verilse de reklamsız kalır:

```properties
POTA_ADMOB_APP_ID=ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
POTA_ADMOB_REWARDED_ID=ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY
POTA_PRIVACY_POLICY_URL=https://SIZIN-ALAN-ADINIZ/gizlilik
```

Örnek yer tutucular gerçek yapılandırma değildir. Her iki kimlik de gerçek biçimde ve Google test yayıncısından farklı olmadıkça `monetizedRelease` açılamaz. UMP mesajlarını AdMob Gizlilik ve mesajlaşma bölümünde oluşturun. Yalnız `monetized` varyantında her başlangıçta gerekli rıza bilgisi güncellenir; UMP reklam isteğine izin vermeden reklam yüklenmez. Ayarlardaki gizlilik tercihleri UMP'nin resmi formunu açar. Sabit HTTPS gizlilik URL'si yapılandırılmışsa ayrı gizlilik politikası düğmesi sistem tarayıcısını açar. Yaş hedeflemesi, gizlilik politikası ve Play Veri Güvenliği beyanları gerçek yayıncı/uygulama ayarlarıyla tamamlanmalıdır.

Gelecek `monetized` varyantında reklam uygunluğu yalnız Android'in doğruladığı çevrimiçi ağ, rıza, SDK hazırlığı ve yüklenmiş reklamla açılır. 2× için 1, 3× için art arda 2 ödüllü reklam gerekir. Ödül yalnız tüm reklamlarda SDK `onUserEarnedReward` geri çağrısı alınıp reklam kapandığında oluşur. Erken kapatma, yükleme/gösterim hatası, eksik ikinci reklam, geçersiz istek ve zaman aşımı ödül kazandırmaz. Zaman aşımı yalnız isteği iptal eder; süre geçirmek ödül vermez. Beş dakikalık oyun çarpanı JS tarafından doğrulanan tek kullanımlık yerel ödül makbuzuyla başlar. Uygulama içi puan sistemi istemci tarafındadır; çevrimiçi sunucu doğrulaması yoktur.

## Güvenlik ve yaşam döngüsü

WebView ağ istekleri ve harici gezinme engellidir; yerel oyun dosyası dışında içerik yüklenmez. Ana `offlineRelease` yalnız kısa basket titreşimi için VIBRATE izni ister; INTERNET, ACCESS_NETWORK_STATE veya reklam kimliği izni içermez. Yalnız gelecek `monetized` varyantı Google reklam/rıza SDK’ları ile onların internet ve reklam izinlerini içerir. WebView'a genel dosya/icerik erişimi verilmez. `PotaNative` yalnız yerel güvenilir sayfaya şu sınırlı API'leri sunar: `getDeviceInfo`, `getAdsState`, `requestRewarded`, `showPrivacyOptions`, `openPrivacyPolicy`. Reklam sonucu yerel durumdaki eşleşen makbuzla doğrulanır. Release WebView hata ayıklaması kapalıdır.

Arka planda WebView ve oyun zamanlayıcıları durur. Gelecek reklam varyantında reklam sırasında Android yaşam döngüsü korunur; dönüşte oyun sürer. Ekran modu varsa 120 Hz tercih edilir; yalnız 144 Hz gibi daha yüksek mod varsa oyun 120 FPS'ye sınırlar, 60 Hz cihazda 60 FPS hedeflenir. Cihaz kısıtları ve işletim sistemi pil politikaları nedeniyle bu değerler garanti değildir.

## İmzalama

Korunan sertifikanın SHA-256 değeri:

`63bb7a92b5f55cd58f93d54bc3008a14a8f1adc92a2011bab97df1bd5f014a81`

`signing/upload-certificate.pem` açık sertifikadır. Özel JKS genel kaynak/mağaza paketine konmaz; ayrı özel imza paketinde yedeklenmelidir. Anahtar alias/parolası özel pakette bulunur. Yerel Gradle varsayımları mevcut geliştirme anahtarını korur; üretim için özel `POTA_STORE_PASSWORD`, `POTA_KEY_PASSWORD`, `POTA_KEY_ALIAS` değerleri kullanılabilir. Parola değişikliği sertifikayı değiştirmez; yeni anahtar üretmek güncelleme kimliğini değiştirir.

Google Play App Signing'e mevcut uygulama imzalama anahtarını aktarmak için Console'un sağladığı PEPK aracı ve şifreleme anahtarı gerekir. Alternatif olarak Play'in ürettiği uygulama imzalama anahtarı ile bu anahtar yükleme anahtarı olarak kullanılabilir; bu durumda Play imzalı kurulumların sertifikası doğrudan APK'dan farklı olur. Console hesabı ve bu seçimler yayıncı tarafından tamamlanır; burada otomatik yayın yapılmaz.
