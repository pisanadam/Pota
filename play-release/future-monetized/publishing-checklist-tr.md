> **GELECEKTEKİ REKLAMLI SÜRÜM TASLAĞI — mevcut offline APK/AAB için kullanmayın.**

# Google Play yayın kontrol listesi

Resmî kaynaklar **18 Ekim 2026** tarihinde kontrol edildi. Gönderim tarihinde Play Console'daki gereklilikleri yeniden kontrol edin. “Hazırlandı” ile “mağazaya gönderildi / onaylandı” farklı durumlardır; bu çalışma hiçbir yayını gerçekleştirmez.

## 1. Geliştirici hesabı ve kalıcı kimlik

- [ ] Google Play Console geliştirici hesabını aç, sözleşmeyi kabul et ve doğrulamaları tamamla. Resmî kayıt ücreti tek seferlik **25 ABD dolarıdır**; ödeme ve vergi koşulları ülkeye göre değişebilir.
- [ ] Kişi / kuruluş türünü gerçek durumuna göre seç; talep edilen kimlik, telefon, e-posta, adres ve kuruluş doğrulamalarını tamamla. Kuruluş hesabında istenebilecek D-U-N-S bilgisini hesabın akışına göre sağla.
- [ ] Geliştirici görünen adı, destek e-postası ve varsa kamuya gösterilecek iletişim/adres alanlarını tamamla.
- [ ] `com.pota.court` paket kimliğini ilk yayımdan önce doğrula. Farklı mağazalar veya mevcut uygulama sahipliğiyle çakışmamalı; Play'de yayımdan sonra paket adı değiştirilemez.
- [ ] Sürüm adı ve sürekli artan versionCode değerini nihai derlemeyle eşleştir.

## 2. Android App Bundle, imza ve cihaz uyumluluğu

- [ ] Yeni uygulama yayını için **imzalı `.aab`** yükle; `.apk` doğrudan kurulum/test içindir. Google Play, yeni uygulamalarda Android App Bundle ister.
- [ ] Telefon/tablet gönderiminin hedef API'si **Android 16 / API 36 veya üzeri** olsun. 31 Ağustos 2026'dan beri yeni uygulama ve güncellemeler için bu şart geçerli. Hedef API 35 ile hazırlanmış eski derleme tek başına yeni gönderime uygun değildir. Yalnız Console hesabında onaylanmış uzatma varsa o tarih geçerlidir; varsayma.
- [ ] Minimum Android sürümü hedef kullanıcı kitlesi ve tüm SDK'larla uyumlu olsun. “Her cihaz” vaadi verme; Android sürümü, WebView ve GPU sınırları devam eder.
- [ ] Final AAB manifestini, izinleri, SDK envanterini, imzasını ve gömülü oyun varlığını doğrula. `INTERNET` reklam için gerekir; hassas konum gibi kullanılmayan izinleri ekleme. Reklam kimliği izni gerçek SDK/yapılandırmayla aynı olsun.
- [ ] **64 bit:** yalnız Java/Kotlin ve native kod içermeyen bağımlılıklar 64 bit cihazları destekler. Herhangi bir `.so` varsa uygun 64 bit karşılıklarını denetle. Google'ın ve eklenen tüm SDK'ların gerçek paket içeriklerini incele.
- [ ] **16 KB sayfa boyutu:** API 35+ hedefleyen uygulamalar 64 bit cihazlarda 16 KB belleği desteklemeli. Native kod varsa ELF ve ZIP hizalamalarını, araç/SDK uyumluluğunu doğrula; native kod yoksa yine 16 KB ortamda regresyon testi önerilir. 16 Ekim 2026 güncellemeli resmî sayfa, uyumsuz uygulama güncellemelerinin **1 Şubat 2027** tarihinden itibaren engelleneceğini belirtiyor. Bu tarihi uyumluluğu ertelemek için gerekçe sayma.
- [ ] Play App Signing'i kur. Mevcut APK kullanıcılarına aynı paket üzerinden güncelleme hedefleniyorsa uygulama imza anahtarı ilişkisini koru; yeni anahtar seçimini rastgele yapma.
- [ ] Yükleme anahtarını ve varsa uygulama imza anahtarını ayrı güvenli yedeklerde tut. **Genel ZIP'e `.jks`, parolalar, servis hesabı JSON'u veya hesap oturum bilgileri koyma.** Sertifika SHA-256 parmak izi özel anahtar değildir ve raporda bulunabilir.
- [ ] `bundletool validate`, imza ve APK üretim/kurulum testlerini tamamla; Play'in kendi yükleme denetimlerini de geç.

## 3. Reklam ve gizlilik üretim yapılandırması

- [ ] AdMob uygulamasını gerçek paketle oluştur. Gerçek **App ID** ve **ödüllü reklam birimi kimliklerini** üretim yapılandırmasına gir. Test kimlikleriyle canlıya çıkma; canlı reklamlarla kendi test tıklamalarını yapma.
- [ ] Yeni AdMob uygulamaları için **app-ads.txt ile uygulama sahipliği doğrulamasını** tamamla. Mağaza kaydındaki geliştirici web sitesi alanına kendi gerçek alan adını koy; o alan adının kökünde `/app-ads.txt` yayımla. AdMob hesabından verilen tam satırı ve kendi yayıncı kimliğini kullan. `pub-...` kimliğini App ID veya reklam birimi kimliğiyle karıştırma. AdMob tarayıcısının erişimini ve doğrulama durumunu kontrol et.
- [ ] Gerçek cihazları test cihazı olarak tanımla. Tek reklam/iki reklam tamamlama, erken kapatma, bağlantı kopması, reklam yok, hata, uygulamadan çıkma ve süre bitişini kontrol et.
- [ ] Teklifler açık olsun: 2x için 1 reklam, 3x için 2 reklam; ikisinde de ödül süresi 5 dakika. Ödül yalnız SDK'nın kazanım geri bildirimiyle verilsin. Çift geri bildirim, uygulama yeniden açma veya sahte web isteği ödülü çoğaltmamalı.
- [ ] Reklam/izin yönetimi mesajlarını gerekli bölgeler için AdMob hesabında kur. İzin gerektiren bölgelerde uygun izin akışı tamamlanmadan reklam isteme; gerekli gizlilik seçeneklerini uygulamada erişilebilir tut.
- [ ] Gerçek hedef yaş gruplarını seç. Çocukları hedefliyorsa Play Families, çocuklara yönelik işlem etiketleri ve izin verilen reklam SDK'larını ayrıca uygula.
- [ ] `policies/privacy-policy-tr.md` içindeki bütün **UNRESOLVED** alanlarını doldur; gerçek geliştirici adı ve destek e-postasını ekle. Politika hem uygulama içinden hem mağazadan açılmalı.
- [ ] Politikayı herkese açık, etkin, coğrafi engeli ve giriş gereksinimi olmayan kalıcı URL'de yayımla. **PDF veya düzenlenebilir ortak belge URL'si kullanma.** Bu paket politika metnini verir; hosting kendiliğinden kurulmuş değildir.
- [ ] Veri Güvenliği formunu nihai SDK sürümleriyle doldur. Reklam SDK'sının cihaz kimliği, IP/konum tahmini, etkileşim ve tanı verilerini hesaba kat. Temel oyunun çevrimdışı olması “veri toplanmıyor” anlamına gelmez.
- [ ] İleride mediation, başka reklam ağı veya analiz eklenirse politika ve beyanları yeniden değerlendir.

## 4. Mağaza kaydı ve içerik formları

- [ ] `store-listing/tr-TR.txt` metnini gir. Ad ≤30, kısa açıklama ≤80, tam açıklama ≤4000 karakter olmalı; dosya başlıklarını alan metnine dahil etme.
- [ ] 512×512, ≤1024 KB, 32 bit PNG simgesini yükle. Mağaza simgesine harici rütbe/fiyat rozeti veya Google Play logosu ekleme.
- [ ] 1024×500, alfa kanalı olmayan PNG/JPEG tanıtım görselini yükle.
- [ ] Telefon için en az **2 gerçek ekran görüntüsü** yükle. PNG/JPEG, kısa kenar en az 320 px, uzun kenar en fazla 3840 px ve uzun/kısa oranı en fazla 2 olmalı. Oyun önerileri açısından en az **3 adet 1080×1920 (9:16)** veya 1920×1080 (16:9) gerçek görüntü tercih edilir.
- [ ] Görsellerde final uygulama arayüzü bulunsun. Eski çizim modu, kaldırılan normal grafik menüsü veya sahte reklam ödülü gösterme. Testte açılan kozmetikler varsa görünüm gerçekten oyunda mevcut olmalı; tümünün başlangıçta açık olduğu izlenimi verme.
- [ ] Reklamlar: **Evet**. Kategori: Oyun / Spor. Ücret ve ülkeleri gerçek tercihe göre seç.
- [ ] IARC anketini gerçek içerikle doldur; reklam uygunluğunu da derecelendirme/hedef kitleyle eşleştir.
- [ ] Hedef kitle ve içerik, uygulama erişimi, gizlilik ve diğer istenen uygulama içeriği formlarını tamamla. Uygulama girişi yok; parola uydurma.
- [ ] Gerekli AB/AEA trader beyanı ve Console'un hesap/ülke bazında istediği ek formları gerçek durumuna göre tamamla.

## 5. Test ve üretime geçiş

- [ ] Önce iç test kanalına AAB yükle. Google'ın cihazlar için ürettiği APK'ları gerçek cihazlarda kur; ilk açılış, eski kaydı koruyarak güncelleme, şut, file, ses, mağaza, otomatik görüntü, FPS tercihi, arka plana geçiş ve reklam/izin akışını kontrol et.
- [ ] En az bir eski/düşük GPU'lu ve bir 60/120 Hz ekranlı cihazda doğrula. Hedef FPS ile gerçekleşen FPS'yi ayır; ısı, pil tasarrufu ve WebView sürümünü kaydet.
- [ ] Play ön lansman raporunda çökme, ANR, erişilebilirlik, ekran boyutu ve politika uyarılarını incele; ilgili sorunları düzelt.
- [ ] **13 Kasım 2023'ten sonra açılmış kişisel hesaplarda:** en az **12 testçi**, kesintisiz en az **14 gün** kapalı teste katılmış olmalı. Sonrasında üretim erişimi için başvur; otomatik onay varsayma. Gerçek test sonuçlarını ve geri bildirimlerini bildir.
- [ ] Reklam sunumu için AdMob uygulama incelemesi, mağaza bağlantısı veya hesapta istenen ek doğrulamaları tamamla; uygulama reklam ağı onayını mağaza onayıyla aynı sayma.
- [ ] Tüm kullanıcı alanları ve üretim kimlikleri tamamlandıktan sonra incelemeye gönder. Yönetilen yayımlama veya kademeli dağıtımı ihtiyacına göre seç.
- [ ] Yayından sonra Android Vitals, çökme/ANR, reklam hata/ödül tamamlama ve kullanıcı geri bildirimlerini takip et. Yeni veri işleme eklenirse beyanları güncelle.

## Resmî kaynaklar

- [Hedef API gereksinimleri](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Yeni kişisel hesaplar için kapalı test](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Mağaza önizleme ve görsel kuralları](https://support.google.com/googleplay/android-developer/answer/9866151)
- [Android App Bundle](https://developer.android.com/guide/app-bundle)
- [Uygulama imzalama / Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
- [64 bit gereksinimleri](https://developer.android.com/google/play/requirements/64-bit)
- [16 KB sayfa boyutu](https://developer.android.com/guide/practices/page-sizes)
- [Veri Güvenliği formu](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Google Mobile Ads veri açıklaması](https://developers.google.com/admob/android/privacy/play-data-disclosure)
- [AdMob izin yönetimi](https://developers.google.com/admob/android/privacy)
- [AdMob uygulama doğrulaması](https://support.google.com/admob/answer/14538460)
- [app-ads.txt kurulumu](https://support.google.com/admob/answer/9363762)
- [Ödüllü reklam politikası](https://support.google.com/admob/answer/7313578)
- [Uygulama içeriği formları](https://support.google.com/googleplay/android-developer/answer/9859455)
- [İçerik derecelendirmesi](https://support.google.com/googleplay/android-developer/answer/9859655)
- [Kullanıcı verileri / gizlilik politikası](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Geliştirici kaydı ve ücret](https://support.google.com/googleplay/android-developer/answer/6112435)

Kaynakların erişim zamanı ve HTTP durumu: `research/official-sources.json`. Yönergeler ileride değişebilir; yayımlama gününde resmî sayfa ve Console esas alınır.
