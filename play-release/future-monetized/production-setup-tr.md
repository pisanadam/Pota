> **GELECEKTEKİ REKLAMLI SÜRÜM TASLAĞI — mevcut offline APK/AAB için kullanmayın.**

# Üretim için doldurulacak bilgiler

Bu sayfadaki alanlar geliştiricinin kendi hesaplarından alınır; bu çalışma hesap oluşturmaz, kimlik doğrulamaz veya mağazaya/reklam ağına gönderim yapmaz.

| Bilgi | Beklenen biçim / kullanım | Durum |
|---|---|---|
| Geliştirici / veri sorumlusu adı | Gerçek kişi veya kuruluş; mağaza ve gizlilik metniyle tutarlı | **UNRESOLVED** |
| Destek / gizlilik e-postası | Gerçek, düzenli kontrol edilen adres | **UNRESOLVED** |
| Gizlilik politikası URL'si | Giriş gerektirmeyen kalıcı HTTPS sayfası; bu paketteki Markdown taslağı doldurup yayımlanır | **UNRESOLVED** |
| Geliştirici web sitesi | AdMob app-ads.txt taraması için mağaza alanında gerçek site | **UNRESOLVED** |
| AdMob yayıncı kimliği | `pub-` ile başlayan kimlik; app-ads.txt hesabındaki satırdan alınır | **UNRESOLVED** |
| AdMob uygulama kimliği | `ca-app-pub-...~...`; paket `com.pota.court` ile eşleşmeli | **UNRESOLVED** |
| Ödüllü reklam birimi kimliği | `ca-app-pub-.../...`; ödüllü format, doğru uygulama | **UNRESOLVED** |
| UMP / gizlilik mesajı | AdMob hesabında ilgili bölgeler ve gerçek üretim uygulaması için yayımlanan mesaj | **UNRESOLVED** |
| Hedef yaş grupları | Gerçek hedef kitle; gerekirse Families yapılandırması | **UNRESOLVED** |
| Play geliştirici hesabı | Doğrulanmış hesap ve üretim erişimi | **UNRESOLVED** |
| Yükleme imzası / Play App Signing | Mevcut imza ilişkisini koruyan güvenli yapılandırma | Ana derleme raporu ve geliştirici hesabında doğrulanacak |

App ID, yayıncı kimliği ve reklam birimi kimliği birbirinin yerine geçmez. Uygulama içindeki aynı ödüllü reklam birimi, farklı açıkça belirtilmiş 2x/3x teklifleri için kullanılabilir; nihai Android yapılandırması esas alınır. 3x teklifi iki ayrı onaylı reklam izleme gerektirir.

Bu alanlar doldurulmadan derlenmiş release paketinde reklamlar devre dışı kalır. Bu davranış, reklam izlenmeden puan çarpanı verilmesini önler; gerçek reklam gelirinin hazır olduğu anlamına gelmez.

Özel imza anahtarı ve parolaları bu dosyaya, açık ZIP'e, kaynak depoya veya mağaza açıklamasına yazmayın. Gerçek kimlikler yerleştirildikten sonra üretim derlemesini tekrar üretin ve final AAB üzerinde test/manifest/SDK doğrulamasını tekrarlayın.
