# POTA — Google Play yayın hazırlığı

**2.0.4 APK/AAB çevrimdışı sürümdür.** Google Mobile Ads veya UMP SDK'sı, reklam gösterimi ve reklam puan çarpanları içermez. Temel oyun, istatistikler ve kozmetikler cihazda çalışır; giriş gerekmez. Hazırlanma: **18 Ekim 2026**.

Bu klasör yayın materyallerini içerir. Play Console'a gönderim yapılmadı; mağaza hesabı açılmadı.

## Mevcut sürümün dosyaları

- `store-listing/tr-TR.txt`: ad, kısa ve tam açıklama; reklam vaadi içermez.
- `store-listing/release-notes-tr.txt`: 2.0.4 sürüm notları.
- `store-listing/console-fields.md`: mevcut çevrimdışı sürüm için Console alanları.
- `graphics/`: 512×512 mağaza simgesi ve 1024×500 tanıtım görseli.
- `screenshots/`: 2.0.4 oyun görünümünden dört gerçek 1080×1920 ekran; çekim kaynağı ve hash manifestte.
- `policies/privacy-policy-tr.md`: mevcut çevrimdışı sürümün doldurulacak gizlilik metni.
- `policies/data-safety-worksheet.md`: mevcut SDK'sız/yerel sürüm için Veri Güvenliği taslağı.
- `policies/android-permissions.md`: çevrimdışı izin envanteri.
- `policies/content-and-access-worksheet.md`: reklam yok, IARC ve erişim beyanları.
- `production-setup-tr.md`: geliştirici kimliği, destek ve gizlilik yayın alanları.
- `publishing-checklist-tr.md`: AAB, imza, test ve Play yayın adımları.
- `signing-and-backup-tr.md`: imza ilişkisi ve özel anahtar yedekleme.
- `research/`: 18 Ekim 2026'da kontrol edilen resmî kaynaklar.
- `future-monetized/`: **bu teslimde etkin olmayan** gelecekteki reklamlı sürümün ayrı taslakları. Bugünkü mağaza kaydında kullanmayın.

## Geliştiricide tamamlanacak işler

1. **UNRESOLVED:** Gerçek geliştirici adı, destek e-postası ve doğrulanmış Google Play hesabı.
2. **UNRESOLVED:** Gizlilik taslağındaki kimlik/iletişim/hedef yaş alanları; herkese açık kalıcı politika URL'si ve uygulama/Console bağlantısı.
3. **UNRESOLVED:** Gerçek hedef yaş grupları ve IARC anketi.
4. **UNRESOLVED:** Cihaz testleri, gerekliyse 12 testçi/14 gün kapalı test ve üretim erişimi başvurusu.

Mevcut çevrimdışı sürüm için AdMob hesabı, reklam kimliği veya app-ads.txt gerekmez. Bunlar gelecekte reklam eklenirse değerlendirilir.

## Teknik bilgiler ve sınırlar

Ana Android sürümü: **2.0.4 / versionCode 18**, paket `com.pota.court`, minSdk **23** (Android 6), compile/targetSdk **36**. Nihai versionCode, imza, izinler ve AAB içeriği derleme raporuyla eşleştirilmelidir. 18 Ekim 2026'da yeni telefon/tablet gönderimleri API 36 veya üzerini hedeflemelidir.

APK kurulum/test içindir; Play'e imzalı **AAB** yüklenir. Bütün cihazlarda açılma veya sabit 60/120 FPS garanti edilemez. Donanım, Android/WebView sürümü, ekran, ısı ve güç yönetimi sonucu etkiler. Fiziksel cihaz testi yapıldıysa yalnız gerçekten doğrulanan senaryoları bildirin.

Genel ZIP'e özel `.jks`, parola veya hesap kimlik bilgisi koymayın. Bu klasördeki PEM açık sertifikadır. Özel anahtar güvenli ve ayrı yedeklenmelidir.
