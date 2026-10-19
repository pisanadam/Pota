# İmza anahtarı ve güvenli yedekleme

Android uygulaması yalnız sürüm numarasıyla güncellenmez: paket kimliği ve uygulama imza ilişkisi de korunmalıdır. `com.pota.court` için daha önce doğrudan kurulan APK'ların yerinde güncellenmesi isteniyorsa mevcut imza geçmişini dikkate alın.

## Bu projenin mevcut durumu

- Yerel APK güncellemeleri için korunan anahtar, kaynak çalışma alanında `android/signing/pota-local.jks` konumundadır.
- Bu, yerel geliştirme için hazırlanmış anahtardır; parolasının güvenlik düzeyi üretim anahtar yönetimi için yeterli kabul edilmemelidir. Parola veya özel anahtar bu genel yayın paketine dahil edilmez.
- Açık sertifika (`upload-certificate.pem`) ve SHA-256 parmak izi, özel anahtarın kendisi değildir. Derleme paketindeki açık sertifikayı Console'daki yapılandırmayla karşılaştırın.
- Play App Signing'de **uygulama imza anahtarı** ile **yükleme anahtarı** farklı roller taşır. Yükleme anahtarıyla AAB imzalamak, kullanıcılara dağıtılan APK'ların da o anahtarla imzalanacağı anlamına gelmez.

## İlk Google Play yayını öncesinde karar

1. Mevcut doğrudan APK kullanıcılarının aynı paketle yerinde güncellenmesi gerekiyorsa, mevcut uygulama imza anahtarının Play App Signing'e uygun biçimde aktarılması gerekir. Google'ın Console üzerinden verdiği PEPK aracı ve şifreleme anahtarıyla resmi içe aktarma akışını kullanın. Bu akış Console bilgisi olmadan önceden tamamlanmış sayılamaz.
2. Google'ın yeni bir uygulama imza anahtarı üretmesi seçilirse, dağıtılan Play APK'larının imzası mevcut doğrudan APK'dan farklı olabilir. Böyle bir durumda mevcut kurulumların doğrudan güncellenebileceğini varsaymayın; mevcut kayıtlar açısından kurulum/güncelleme senaryosunu test edin.
3. Gerçek ilk üretim yayını öncesinde, yeni ve güçlü biçimde korunan üretim/yükleme anahtarı planını oluşturmak mümkündür. Ancak mevcut kullanıcıları etkileyen anahtar değişimini rastgele yapmayın. Doğru planı Play App Signing akışıyla kesinleştirin.

## Güvenli yedekleme

- Özel `.jks` dosyasını, alias bilgisini ve gerekli kurtarma bilgilerini **ayrı, erişimi kısıtlanmış ve şifreli** yedeklerde saklayın. Parolayı aynı açık klasörde tutmayın.
- Keystore parolasını kaynak koduna veya kamuya açık belgeye koymayın. Üretim imzalama işlemini ortam değişkeni / güvenli gizli bilgi yönetimiyle yürütün; CI günlüklerinde değerleri yazdırmayın.
- Genel mağaza ZIP'i, herkese açık kaynak arşivi veya destek e-postası ekinde özel anahtar taşımayın.
- Yükleme anahtarı kaybolursa Play App Signing hesap akışındaki sıfırlama koşullarını inceleyin. Uygulama imza anahtarıyla aynı şey olduğunu varsaymayın.
- Anahtarı değiştirdikten sonra sertifika parmak izini derleme raporu, Play Console ve gerekiyorsa diğer hizmetlerin kayıtlarıyla eşleştirin.

[Resmî Play App Signing yönergesi](https://support.google.com/googleplay/android-developer/answer/9842756)
