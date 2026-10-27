# POTA 2.0.4 projesini GitHub'a yükleme

Bu klasör, 2.0.4 / versionCode 18 kaynak projesinin GitHub için hazırlanmış kopyasıdır. `.gitignore`, bu kılavuz ve kullanılan Three.js r160 sürümünün tam MIT lisansı (`vendor/THREE-LICENSE.txt`) eklendi. Lisans kaynağı: https://raw.githubusercontent.com/mrdoob/three.js/r160/LICENSE

## Yeni depo oluşturma

1. https://github.com/new adresini aç ve hesabını seç.
2. Depo adı olarak `POTA` kullanabilirsin. Kodun herkese açık olmasını istemiyorsan **Private** seç.
3. İlk yükleme için README, lisans ve .gitignore seçeneklerini boş bırak. **Create repository** düğmesine bas.
4. Oluşan depo adresini kopyala. Otomatik yüklemeyi tamamlamam için bu bağlantıyı sohbete gönderebilirsin; şifre veya erişim anahtarı gönderme.

## Bilgisayardan kendin yüklemek istersen

ZIP'i bir klasöre çıkar. GitHub Desktop'ta **File → Add local repository → Choose** ile `android/`, `src/`, `vendor/`, `pack.py` ve bu dosyanın bulunduğu klasörü seç. Henüz Git deposu olmadığını söylerse **create a repository here** bağlantısını kullan; ek lisans seçmen gerekmez. Değişiklikleri commit et. **Publish repository** ile GitHub'a gönder; kodun özel kalması için **Keep this code private** seçeneğini açık tut. Depoyu önceden GitHub'da oluşturduysan GitHub Desktop'ta o depoyu klonla ve ZIP'teki klasör içeriğini klonlanan klasöre kopyalayıp commit/push yap.

Git kullanıyorsan, ZIP'i açtığın klasörde aşağıdaki komutları çalıştır. Örnekteki adresi kendi deponun HTTPS adresiyle değiştir. Bu komutlar yalnız yeni ve boş depo için hazırlanmıştır:

```sh
git init -b main
git add .
git commit -m "POTA 2.0.4 kaynak projesi"
git remote add origin https://github.com/pisanadam/Pota.git
git push -u origin main
```

Git ad/e-posta ayarı isterse kendi GitHub commit kimliğini veya GitHub'ın hesabında gösterdiği noreply adresini kullan. GitHub hesap parolasını `git push` parolası olarak kullanma; Git Credential Manager'ın tarayıcıyla oturum açma akışını veya GitHub Desktop'ı kullan.

## Dosya düzeni

Depo kökünde `android/`, `src/`, `vendor/`, `qa/`, `play-release/`, `pack.py`, `README.md` ve `.gitignore` bulunmalı. Yalnız ZIP dosyasını depoya yüklemek yerine ZIP'in içeriğini kullan. GitHub'ın tarayıcıdan dosya yükleme ekranının dosya sayısı sınırına takılırsan GitHub Desktop kullan.

`.gitignore` özel imza anahtarlarını, parolaları taşıyan yerel dosyaları, SDK indirmelerini ve derleme çıktılarını hariç tutar. ZIP'i doğrudan tarayıcıyla yüklerken `.gitignore` dosyasının dosyaları otomatik filtrelemediğini unutma; yalnız bu temiz klasördeki kaynakları seç.

Özel `POTA-imza-anahtari-2.0.0.zip` yedeğini GitHub'a yükleme. İmza parolalarını kaynaklara ekleme. Açık `upload-certificate.pem` sertifikası pakette bulunabilir. Derleme için gereken özel anahtar ve `POTA_*` ayarları kökteki `README.md` dosyasında açıklanır. Bu proje, özel anahtar yapılandırılmadan release/debug derlemesi yapmaz.

Bu teslim uygulamanın kendi kodu için bir açık kaynak lisansı seçmez; üçüncü taraf lisansları korunur. Android Studio kurulumu, dahili oyun varlığını güncelleme ve Google Play adımları için `README.md` dosyasını oku.
