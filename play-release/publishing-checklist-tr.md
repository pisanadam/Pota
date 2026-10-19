# Google Play yayın kontrol listesi — çevrimdışı 2.0.0

Resmî kaynaklar 18 Ekim 2026'da kontrol edildi; gönderim tarihinde Console ve kaynakları yeniden kontrol edin. Yayın yapılmadı. Ana teslim reklam SDK'sı içermeyen **offline APK/AAB**'dir.

## Geliştirici ve mağaza

- [ ] Doğrulanmış Play Console hesabını ve gerçek kişi/kuruluş bilgilerini tamamla. Resmî kayıt ücreti tek seferlik 25 ABD dolarıdır; ülke/ödeme koşulları değişebilir.
- [ ] Gerçek geliştirici adı, erişilebilir destek e-postası ve gerekiyorsa kuruluş/D-U-N-S/iletişim doğrulamalarını tamamla.
- [ ] `com.pota.court` paket kimliğinin kalıcı seçim ve mevcut uygulama sahipliğiyle uyumlu olduğunu doğrula.
- [ ] Türkçe ad/kısa/tam açıklamayı `store-listing/tr-TR.txt` dosyasından gir. Sınırlar 30/80/4000 karakterdir.
- [ ] 512×512 simge, 1024×500 RGB tanıtım görseli ve üç gerçek 1080×1920 ekranı yükle. Ekranların çekim sürümü `screenshots/manifest.json` içindedir.
- [ ] Tür Oyun, kategori Spor. Ücretlendirmeyi gerçek tercihe göre seç. **Reklam içeriyor: Hayır.**
- [ ] IARC anketini gerçek içerikle doldur. Gerçek hedef yaş gruplarını ayrıca seç; çocuklara yönelikse ilgili kuralları uygula.
- [ ] Uygulama erişimi için hesap/parola gerekmediğini bildir. Ülke ve hesap bazında istenen trader/diğer beyanları gerçek duruma göre tamamla.

## Gizlilik ve veriler

- [ ] `policies/privacy-policy-tr.md` içindeki UNRESOLVED alanlarını gerçek geliştirici, destek ve hedef yaş bilgisiyle doldur.
- [ ] Gizlilik politikasını girişsiz, herkese açık, coğrafi engeli olmayan kalıcı URL'de yayımla. PDF veya düzenlenebilir ortak belge bağlantısı kullanma; uygulama içi bağlantı ve Console aynı URL olmalı.
- [ ] Offline sürümde veri cihaz dışına gönderilmediğini nihai AAB ile doğrula. Bu sürüm için Veri Güvenliği taslağı **veri toplama/paylaşma: Hayır** der.
- [ ] Google Mobile Ads/UMP, reklam başlangıç sağlayıcıları, INTERNET/AD_ID izinlerinin gerçekten bulunmadığını final raporda kontrol et.
- [ ] Mevcut sürüm için AdMob hesabı veya app-ads.txt gerekmez. Gelecekte reklam eklenirse `future-monetized/` belgeleri yeniden değerlendirilir; bu yayının beyanlarıyla karıştırılmaz.

## AAB, imza ve uyumluluk

- [ ] Play'e imzalı **AAB** yükle. APK doğrudan kurulum/test içindir.
- [ ] 31 Ağustos 2026'dan beri yeni telefon/tablet uygulaması ve güncellemesi için **Android 16/API 36 veya üzeri** hedeflenir. Bu proje compile/target 36, minimum 23 kullanır. Sürüm adı ve artan versionCode değerini nihai manifestten doğrula.
- [ ] AAB manifest, imza, SDK envanteri ve gömülü oyun varlığını doğrula; `bundletool validate` ve Play yükleme denetimlerini geç.
- [ ] 64 bit ve 16 KB desteğini kontrol et. Native `.so` yoksa Java/WebView uygulaması için ayrı NDK derlemesi gerekmez; varsa 64 bit karşılıklar, ELF ve ZIP hizalaması denetlenir. Resmî 16 KB sayfası 1 Şubat 2027'de uyumsuz güncellemelerin engelleneceğini belirtir.
- [ ] Play App Signing seçimini `signing-and-backup-tr.md` ile yap. Google'ın yeni uygulama imzası mevcut doğrudan APK'dan farklı olursa yerinde güncellemeyi otomatik varsayma.
- [ ] Özel .jks, parola ve hesap erişimini genel ZIP'e koyma. Açık PEM sertifikası paylaşılabilir; özel anahtar güvenli ve ayrı yedeklenir.

## Test ve yayın

- [ ] İç test kanalına AAB yükle; Play'in ürettiği kurulumu gerçek cihazlarda dene. İlk açılış, eski kayıtla güncelleme, şut, ses/file, puan pazarı, otomatik görüntü, akıcılık/grafik tercihi ve arka plana geçişi doğrula.
- [ ] Eski/düşük GPU'lu cihaz ile 60/120 Hz ekranlı cihazı dene. Hedef FPS'yi gerçekleşen FPS garantisi olarak sunma. Android/WebView, ısı ve pil tasarrufunu kaydet.
- [ ] Play ön lansman raporunda çökme/ANR, erişilebilirlik, cihaz ve politika uyarılarını incele.
- [ ] 13 Kasım 2023'ten sonra açılmış kişisel hesaplarda en az **12 testçi kesintisiz 14 gün** kapalı teste katılmalı; sonra üretim erişimi için başvurulmalı. Onay otomatik değildir.
- [ ] Tüm gerçek geliştirici alanları ve testler tamamlanınca incelemeye gönder; gerekiyorsa yönetilen/kademeli yayın kullan. Bu materyaller hazırlanmış olması mağazaya gönderildiği anlamına gelmez.
- [ ] Yayından sonra Android Vitals ve kullanıcı geri bildirimlerini takip et. Veri uygulaması değişirse beyanları güncelle.

## Resmî kaynaklar

- [Hedef API](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Kapalı test](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Mağaza görselleri](https://support.google.com/googleplay/android-developer/answer/9866151)
- [Android App Bundle](https://developer.android.com/guide/app-bundle)
- [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
- [64 bit](https://developer.android.com/google/play/requirements/64-bit)
- [16 KB](https://developer.android.com/guide/practices/page-sizes)
- [Veri Güvenliği](https://support.google.com/googleplay/android-developer/answer/10787469)
- [İçerik formları](https://support.google.com/googleplay/android-developer/answer/9859455)
- [IARC](https://support.google.com/googleplay/android-developer/answer/9859655)
- [Gizlilik politikası](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Kayıt ve ücret](https://support.google.com/googleplay/android-developer/answer/6112435)

Araştırma zamanları: `research/official-sources.json`. Reklamla ilgili araştırma kaynakları yalnız gelecekteki reklamlı sürüm için tutulur; mevcut AAB'nin SDK kullandığı anlamına gelmez.
