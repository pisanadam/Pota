> **2.0.3 paket notu (19 Ekim 2026):** Bu üç görsel önceki 2.0.0 yakalamasından korunmuştur. Orijinal görüntü ve kaynak hash'leri aşağıda ve manifestte aynen kalır. 2.0.1'de eklenen puan etiketi ile 2.0.2'de değişen ayarlar bu yakalamada yer almaz. Mağazaya yüklemeden önce güncel 2.0.3 APK'dan yeni ekran görüntüleri alın.

# Telefon boyutunda gerçek oyun ekran görüntüleri

Son Android dahili oyun varlığından **3 gerçek oyun ekranı** yakalandı. Görseller son oyunun gerçek Chromium/WebGL çizimidir; fiziksel telefondan alınmış ekran kaydı olarak sunulmaz. Her biri **1080×1920 (9:16), PNG**; düzenleme, yapay sahne, cihaz çerçevesi veya sonradan yazı eklenmedi.

| Dosya | Görüntü |
|---|---|
| `01-gym.png` | Başlangıç salonu ve normal şut görünümü |
| `02-desert-court.png` | Oyundaki çöl sahası |
| `03-alpine-court.png` | Oyundaki karlı dağ sahası |

Kaynak oyun varlığı SHA-256: `113007b0360abfd830b46a4c33a6cc42c550444c8764d87fc864774bd04ec6bb` (1.576.734 bayt). Yakalama: 360×640 CSS piksel, deviceScaleFactor 3; varsayılan otomatik grafik/çözünürlük, grafik ve GPU sınırlarını geçersiz kılan test ayarı yok.

Sahne hazırlığı için yalnız salon/çöl/dağ ortamları test envanterinde açıldı. Cüzdan ve toplam puan 0; ses ve FPS göstergesi kapalıydı. Ortamlar gerçek mağaza düğmeleriyle seçildi. Kozmetikler normal oyunda oyun puanlarıyla açılır; bu görseller bütün ortamların ilk kurulumda açık olduğu anlamına gelmez. Yerel reklam köprüsü olmayan yakalamada reklam teklifi gizlendi; gerçek olmayan reklam veya ödül gösterilmedi.

Boyutlar, renk modları ve tek tek dosya SHA-256 değerleri `manifest.json` içinde. Daha sonraki bir arayüz değişikliği bu görüntüleri etkilerse, mağazaya yüklemeden önce son sürümden yeniden yakalayın. Ana QA raporu: `../../qa/adaptive-release-results.json` (kaynak çalışma alanında).

Son oyun varlığı **8f2b6c669d89558e5fbc5ee3f91493399fd210f43695279b8230417170dd9035** (1.577.070 bayt) olarak güncellendi. Değişiklik yalnız native cihaz belleği/ekran yenileme ipuçlarının değerlendirilmesidir; native ipucu bulunmayan yakalama tarayıcısının görünümü değişmez. Görsellerin gerçek çekim kaynağı önceki `113007...` hash'idir; bunun yerine son hash yazılarak kökeni değiştirilmemiştir. Ana teslimin offline Android flavor'ı aynı oyun görünümünü kullanır ve reklam SDK'larını dışarıda bırakır.
