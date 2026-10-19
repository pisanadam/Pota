> **GELECEKTEKİ REKLAMLI SÜRÜM TASLAĞI — mevcut offline APK/AAB için kullanmayın.**

# Veri Güvenliği çalışma sayfası

18 Ekim 2026. **Bu belge otomatik doldurulmuş veya gönderilmiş bir Play Console beyanı değildir.** Üretim AAB'sinin SDK sürümleri, manifesti, izin akışı ve gerçek veri kullanımıyla son kez karşılaştırılmalıdır. Özellikle SDK'nın değiştirilmesi, mediation eklenmesi veya test/üretim geçişi cevapları etkileyebilir.

Google'ın Mobile Ads SDK veri açıklaması otomatik veri toplamayı ve paylaşmayı açıklar. Kaynak sayfa araştırma tarihinde en güncel 25.5.0 sürümünü anlatmaktadır; bu projede eski Android desteği için 24.9.0 kullanılır. Dolayısıyla sayfa tek başına eski sürümün birebir envanteri sayılmamalı; nihai 24.9.0 bağımlılıkları ve davranışı ayrıca karşılaştırılmalıdır. “Oyun çevrimdışı çalışıyor” veya “kendi sunucumuz yok” diyerek tüm veriler için “Toplanmıyor” işaretlemeyin.

## Derleme yapılandırması

Planlanan/sabitlenen bağımlılıklar: **Google Mobile Ads 24.9.0** ve **UMP 4.0.0**. Gerçek AdMob App ID ve ödüllü reklam birimi kimliği verilmedikçe release reklam talebi devre dışıdır; test reklamları ayrı `.debug` paketinde kullanılır. SDK'nın pakette bulunması, hiç veri işlemediğini tek başına kanıtlamaz. Başlatma ve izin sorgusu dahil final üretim akışı kontrol edilmelidir.

## Muhtemel veri türleri — AdMob'lu üretim sürümü

| Play veri türü | Kaynak / kullanım | Toplanma ve paylaşım için değerlendirme |
|---|---|---|
| Yaklaşık konum | Reklam SDK'sı IP adresinden genel konum tahmin edebilir; hassas konum izni yok | Üretim SDK'sının bu kullanımını hesaba kat; reklam/pazarlama, analiz, dolandırıcılığı önleme/güvenlik amaçları |
| Cihaz veya diğer kimlikler | Android reklam kimliği, uygulama kümesi kimliği, yapılandırmaya göre başka cihaz/hesap kimlikleri | Reklam SDK'sı varsayılan olarak toplar/paylaşır; reklam kimliğinin kaldırılması diğer kimlikleri otomatik kaldırmaz |
| Uygulama etkileşimleri | Uygulama açılışı, dokunuşlar, reklam/video izlemeleri | Reklam, analiz, güvenlik amaçları; SDK veri açıklamasıyla eşleştir |
| Kilitlenme günlükleri / tanılama | SDK/uygulama performansı, hata, gecikme ve enerji kullanımı gibi tanı bilgileri | Google'ın SDK açıklamasındaki “Diagnostic information” alanını Console alt türleriyle eşleştir; gerçek SDK'yı doğrula |
| Diğer uygulama performans verileri | SDK'nın performans ölçümleri | Çökme günlüklerinden ayrı istenirse ilgili alt türü ayrıca değerlendir |
| Yerel atış istatistikleri, puan, kozmetik ve tercihler | Cihaz depolaması; uzak oyun sunucusuna gönderim yok | Yalnız cihazda kalan veri “toplama” sayılmaz. Ancak SDK'nın ayrı uygulama etkileşimleri beyanını ortadan kaldırmaz |

Birleşik Android manifestindeki reklam hizmeti ve ağ izinleri için `android-permissions.md` dosyasına bakın. Özellikle AD_ID, AdServices AD_ID/Attribution/Topics izinlerini nihai SDK kullanımıyla birlikte değerlendirin; izin varlığı tek başına hangi verinin aktarıldığını kanıtlamaz.

## Formda doğrulanacak yanıtlar

- Reklam SDK'sı bulunan üretim sürümünde genel “Veri toplanıyor veya paylaşılıyor mu?” yanıtı **Evet** olmalıdır. Veri türlerini yukarıdaki eşlemeye ve SDK sürümüne göre seçin.
- Google kendi SDK açıklamasında bu verilerin toplandığını **ve paylaşıldığını** belirtir. Paylaşım istisnasını otomatik varsaymayın; gerçek hizmet ilişkisi ve Play tanımlarına göre değerlendirin.
- Google Mobile Ads SDK verileri aktarım sırasında TLS kullanır. “Aktarım sırasında şifreleme” yanıtını diğer bütün ağ yolları da aynı şekilde korunuyorsa **Evet** yapın.
- “İsteğe bağlı / gerekli”: Ödüllü reklam seçiminin isteğe bağlı olması, SDK'nın ilk açılışta hiçbir veri göndermediğini tek başına kanıtlamaz. SDK başlatma, UMP izin sorgusu ve reklam talebinin ne zaman gerçekleştiğini inceleyin. Her veri türünde gerçek akışa göre karar verin.
- “Geçici olarak işleniyor”: IP'nin yalnız geçici işlendiğini varsaymayın. SDK sağlayıcısının gerçek saklama koşullarına göre karar verin.
- Veri silme isteği ve destek iletişimi gerçek erişilebilir süreçle uyuşmalıdır. Yerel veri temizleme, Google'ın sakladığı reklam verilerinin silindiği anlamına gelmez.
- Hesap oluşturma yoksa hesap oluşturma sorusuna **Hayır**. Hesap silme formunu uygulama hesabı varmış gibi doldurmayın.
- E-posta, ad, telefon, rehber, fotoğraflar, dosyalar, sağlık, finans bilgileri veya hassas konum yalnızca başka bir SDK/özellik gerçekten bunları işlemiyorsa **yok** olarak değerlendirilebilir.
- Gizlilik URL'si, mağaza geliştirici adı, uygulama içi politika bağlantısı ve bu beyan birbiriyle aynı olmalıdır.
- Reklam talebinin olmaması ya da onayın reddedilmesi, tüm SDK veri işlemenin tamamen durduğu anlamına gelmez. “Hiç veri toplanmıyor” vaadi kullanmayın.

## Açık işler

- **Kontrol:** Sabitlenen Google Mobile Ads 24.9.0 ve UMP 4.0.0 sürümlerini nihai AAB/bağımlılık raporundan doğrula.
- **UNRESOLVED:** Üretim uygulama ve reklam birimi kimliklerini doğrula; test kimlikleriyle üretime çıkma.
- **UNRESOLVED:** Hedef yaş gruplarını ve çocuklara yönelik reklam yapılandırmasını kesinleştir.
- **UNRESOLVED:** Gizlilik politikasını gerçek kimlik/iletişim bilgisiyle yayımla.
- **UNRESOLVED:** Veri toplama/paylaşma açıklamasını üretim yapılandırması ve gerekirse hukuk danışmanıyla onayla.

## Resmî kaynaklar

- [Play Veri Güvenliği formu ve tanımları](https://support.google.com/googleplay/android-developer/answer/10787469?hl=tr)
- [Google Mobile Ads SDK veri açıklaması](https://developers.google.com/admob/android/privacy/play-data-disclosure)
- [Google AdMob izin yönetimi](https://developers.google.com/admob/android/privacy)

Araştırma kopyaları: `../research/`. Bunlar 18 Ekim 2026 tarihinde alınmış kaynak kesitleridir; Console'da gönderim anındaki güncel metin esas alınır.
