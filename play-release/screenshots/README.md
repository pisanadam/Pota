# Telefon boyutunda gerçek oyun ekran görüntüleri — 2.0.4

2.0.4 Android dahili oyun varlığından **4 oyun ekranı** yakalandı. Görseller paketlenmiş oyunun Chromium (SwiftShader WebGL) çizimidir; fiziksel telefondan alınmış ekran kaydı olarak sunulmaz. Her biri **1080×1920 (9:16), PNG**; düzenleme, cihaz çerçevesi veya sonradan yazı eklenmedi.

| Dosya | Görüntü |
|---|---|
| `01-gym.png` | Başlangıç salonu ve normal şut görünümü |
| `02-first-goal.png` | Gerçek kaydırmayla atılan ilk basket, puan ve “Hedef tamamlandı” bildirimi |
| `03-goals.png` | Menüdeki hedef listesi |
| `04-desert-court.png` | Çöl sahası, sürükleme sırasında nişan oku |

Yakalama `qa/capture-screenshots.js` ile yeniden üretilebilir: `python3 pack.py && node qa/capture-screenshots.js`. 360×640 CSS piksel, deviceScaleFactor 3; varsayılan otomatik grafik/çözünürlük. 01–03 sıfır kayıtla (ses kapalı) başlar; atışlar, basket, puan ve hedef bildirimi gerçek kaydırmalardan gelir. 04 için yalnız çöl sahası yükleme öncesinde yerel envantere eklendi; kozmetikler normal oyunda puanla açılır. Reklam köprüsü olmadığı için reklam teklifi gizlidir.

Kaynak varlık hash'i, boyutlar ve tek tek dosya SHA-256 değerleri `manifest.json` içindedir. Arayüz değişirse mağazaya yüklemeden önce yeniden yakalayın.
