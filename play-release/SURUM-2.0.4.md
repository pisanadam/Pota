# Güncel teslim: 2.0.4 / 18

Bu paketin uygulaması **2.0.4 (versionCode 18)**, paket kimliği `com.pota.court`, minSdk 23 ve target/compileSdk 36'dır. Ana varyant `offlineRelease` olup yalnız VIBRATE izni içerir; internet izni, reklam SDK'sı ve reklam ödülü yoktur.

## Değişiklikler

- **Panya arkası sınırı:** Gezinme modunda oyuncu artık panyanın arkasına geçemez (|z| ≤ 12,25 m). Önceden potanın çevresinden dolaşarak panyanın arkasına gidilebiliyor, oradan atılan ve basket olamayan şutlar seriyi sıfırlıyordu.
- **İkinci pota:** Sahanın öbür yarısındaki pota artık kullanılıyor. Gezinme modunda yön değişmez; şut moduna dönüldüğünde oyuncu bulunduğu yarı sahadaki potaya döner. Atış gücü, yön, falso, 2/3 sayı değeri ve basket efektleri o potaya göre hesaplanır.
- **Seri bonusu sınırı:** Seri bonusu basket başına en fazla **+10** olur (+1, +2 … +10). Önceden sınırsız büyüyordu; örneğin 50'lik bir ikilik serisi yaklaşık 1.325 puan veriyordu, şimdi 545. **Üçlüklerde** seri bonusu her adımda +2 artar: +2, +4, +6 … en fazla **+20**. Aynı seride ikilik atılırsa o basket +1'lik adımı kullanır.
- **Hedefler:** Menüde 16 tek seferlik hedef (toplam basket, seri, üçlük, tertemiz basket, panyadan basket, karşı pota). Her hedef bir kez puan ödülü verir; otomatik tekrar denetiminin puan vermediği atışlar hedefleri ilerletmez. Eski kayıtlar için mevcut basket sayısı ve en iyi seri hedeflere bir kez aktarılır. İstatistik sıfırlama hedefleri silmez.
- **QA:** `qa/` klasörü eklendi: ödül, hedef ve fizik birim testleri, paketlenmiş oyunu Chromium'da süren duman testi.
- **Mağaza:** Ekran görüntüleri 2.0.4 arayüzünden yeniden alındı; sürüm notları ve açıklama güncellendi.

Yayından önce gerçek geliştirici adı, destek e-postası, gizlilik politikası URL'si, hedef kitle/IARC, Play hesabı ve gereken cihaz/kapalı test adımlarını tamamla. Fiziksel telefon ve Google Play iç testi bu ortamda yapılmadı.
