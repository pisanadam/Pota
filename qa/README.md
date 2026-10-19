# Test kaynakları

Bu pakette fizik, file, ses, hava efektleri, otomatik performans, puan/reklam ödülü ve davranış tabanlı makro denetimi testleri bulunur. `mode-game-results.json` son üç performans tercihinin kontrollü tarayıcı sonucudur; fiziksel telefonda FPS ölçümü değildir. `macro-game-results.json` kontrollü sentetik PointerEvent/gameplay doğrulamasıdır; Android cihazından çıkarılmış olay izi değildir. Diğer sonuç dosyaları ilgili optimizasyon çalışmasının tarihsel kayıtlarıdır.

Örnek CPU testleri: `node qa/performance-unit.test.cjs`, `node qa/physics.test.cjs`, `node qa/net.test.cjs`, `node qa/fairplay.test.cjs`, `node qa/fairplay-native.test.cjs`, `node qa/weather.test.cjs`, `node qa/rewarded.test.cjs`.

Tarayıcı testleri Playwright ve Chromium gerektirir. Testlerdeki çalışma ortamına ait Playwright/Chromium yollarını kendi kurulumuna göre ayarla. Bazı testler kontrollü zamanlayıcı veya sahne fixture'ı kullanır; açıklamaları her test dosyasının başındadır. Makro denetimi istemci tarafında davranış karşılaştırmasıdır; telefonda kurulu uygulamaları taramaz ve sunucu doğrulaması sağlamaz.
