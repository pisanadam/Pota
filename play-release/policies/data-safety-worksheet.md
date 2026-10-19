# Veri Güvenliği — mevcut çevrimdışı sürüm

18 Ekim 2026. Bu belge teslim edilen **offline APK/AAB** içindir. Gelecekteki reklamlı sürüm belgeleri `../future-monetized/` altındadır ve bu sürüme uygulanmaz.

## Mevcut davranış

- Hesap, giriş veya uzak oyun sunucusu yoktur.
- İstatistikler, puan, kozmetik ve tercihler cihaz depolamasında kalır.
- Google Mobile Ads, UMP, uzak analiz ve çökme SDK'sı mevcut derlemede bulunmaz.
- `INTERNET` ve reklam kimliği izinleri mevcut derlemede bulunmaz.
- Reklam, ödüllü reklam ve 2x/3x reklam çarpanı etkin değildir.

## Console taslak yanıtları

| Soru | Mevcut offline derleme için yanıt |
|---|---|
| Uygulama kullanıcı verisi topluyor veya paylaşıyor mu? | **Hayır**; yerel cihaz kayıtları Play tanımındaki cihaz dışı toplama değildir |
| Reklam içeriyor mu? | **Hayır** |
| Hesap oluşturuluyor mu? | **Hayır** |
| Hesap silme akışı var mı? | Hesap yok; yerel veriyi silme yöntemi gizlilik politikasında |
| Gizlilik politikası | Gerçek geliştirici/iletişim bilgileriyle doldurulup herkese açık URL'de yayımlanmalı |

Bu yanıtları **nihai AAB izin ve SDK envanteriyle** doğrulayın. Yalnız JavaScript'te reklam düğmesini gizlemek SDK'nın kaldırıldığı anlamına gelmez; bu sürümün Android offline flavor'ı SDK, ağ izni ve başlangıç sağlayıcılarını gerçekten dışarıda bırakmalıdır. Bir sonraki sürüme ağ SDK'sı eklenirse “Hayır” beyanı yeniden değerlendirilir.

Yerel veriler Android yedekleme ayarlarından etkilenebilir. Uygulama geliştiricisinin ayrıca veri toplaması ile işletim sistemi yedeklemesini aynı şey saymayın; nihai yedekleme yapılandırmasını gerçek gizlilik metniyle eşleştirin.

## Açık işler

- **UNRESOLVED:** Gerçek geliştirici adı, destek e-postası, gizlilik URL'si ve hedef yaş grupları.
- **Kontrol:** Final offline AAB'de reklam/analiz SDK'sı, `INTERNET`, `AD_ID` veya başlangıç sağlayıcısı bulunmadığını derleme raporundan doğrula.
- **Kontrol:** Console'a gönderim anındaki uygulama davranışının bu belgeyle aynı olduğunu onayla.

[Resmî Veri Güvenliği tanımları](https://support.google.com/googleplay/android-developer/answer/10787469)
