/* POTA — local, points-only cosmetics shop. No network or payment service. */
(function () {
  'use strict';

  const categories = [
    { type: 'ball', owned: 'ownedBalls', equipped: 'equippedBall', defaultId: 'classic', tabId: 'shop-tab-balls', summary: 'farklı top' },
    { type: 'particle', owned: 'ownedParticles', equipped: 'equippedParticle', defaultId: 'none', tabId: 'shop-tab-particles', summary: 'animasyonlu iz', excludeDefaultCount: true },
    { type: 'net', owned: 'ownedNets', equipped: 'equippedNet', defaultId: 'nylon', tabId: 'shop-tab-nets', summary: 'file ve zincir' },
    { type: 'rim', owned: 'ownedRims', equipped: 'equippedRim', defaultId: 'standard', tabId: 'shop-tab-rims', summary: 'çember' },
    { type: 'backboard', owned: 'ownedBackboards', equipped: 'equippedBackboard', defaultId: 'glass', tabId: 'shop-tab-backboards', summary: 'panya' },
    { type: 'environment', owned: 'ownedEnvironments', equipped: 'equippedEnvironment', defaultId: 'gym', tabId: 'shop-tab-environments', summary: 'ortam' }
  ];
  const categoryByType = Object.fromEntries(categories.map(category => [category.type, category]));

  const catalog = [
    { id: 'classic', type: 'ball', name: 'Klasik', description: 'Sahanın vazgeçilmezi.', price: 0, pattern: 'orange', colors: ['#d56e2c', '#ed9b53'] },
    { id: 'street', type: 'ball', name: 'Sokak', description: 'Mat siyah, turuncu çizgiler.', price: 12, pattern: 'blackstreet', colors: ['#252b2c', '#e58b45'] },
    { id: 'retro', type: 'ball', name: 'Nostalji', description: 'Krem ve turuncu eski okul.', price: 18, pattern: 'retro', colors: ['#c56d37', '#efe1bc'] },
    { id: 'camo', type: 'ball', name: 'Kamuflaj', description: 'Orman yeşili organik desen.', price: 26, pattern: 'camo', colors: ['#526448', '#aaad79'] },
    { id: 'zebra', type: 'ball', name: 'Zebra', description: 'Keskin siyah beyaz çizgiler.', price: 32, pattern: 'zebra', colors: ['#f1eee2', '#202629'] },
    { id: 'ice', type: 'ball', name: 'Buz', description: 'Soğuk mavi, kristal desen.', price: 40, pattern: 'icyblue', colors: ['#67c8ee', '#dbfbff'] },
    { id: 'pixel', type: 'ball', name: 'Piksel', description: 'Renkli bloklarla oyun ruhu.', price: 55, pattern: 'pixel', colors: ['#4bb7c1', '#f092a7'] },
    { id: 'comic', type: 'ball', name: 'Çizgi Roman', description: 'Canlı sarı, benekli paneller.', price: 70, pattern: 'comic', colors: ['#f1cb45', '#dc4b43'] },
    { id: 'gold', type: 'ball', name: 'Altın', description: 'Parlak metal, sıcak bir ışık.', price: 90, pattern: 'goldmetal', colors: ['#c79b39', '#fff0a5'] },
    { id: 'ocean', type: 'ball', name: 'Okyanus', description: 'Mavi dalgalar, beyaz köpük.', price: 120, pattern: 'ocean', colors: ['#2c87b5', '#97e1e2'] },
    { id: 'forest', type: 'ball', name: 'Orman', description: 'Yapraklarla örtülü yüzey.', price: 150, pattern: 'forest', colors: ['#226248', '#83ab61'] },
    { id: 'galaxy', type: 'ball', name: 'Galaksi', description: 'Mor bulutsular ve yıldızlar.', price: 180, pattern: 'purplegalaxy', colors: ['#604494', '#c9a4ff'] },
    { id: 'marble', type: 'ball', name: 'Mermer', description: 'Beyaz taş, ince mor damar.', price: 220, pattern: 'marble', colors: ['#e7e6dc', '#a28bbd'] },
    { id: 'carbon', type: 'ball', name: 'Karbon', description: 'Dokuma karbon, koyu metal.', price: 275, pattern: 'carbon', colors: ['#353c41', '#71777d'] },
    { id: 'lava', type: 'ball', name: 'Lav', description: 'Koyu yüzey, kızıl çatlaklar.', price: 350, pattern: 'redlava', colors: ['#311714', '#f76127'] },
    { id: 'rainbow', type: 'ball', name: 'Gökkuşağı', description: 'Sarmalanan renkli şeritler.', price: 430, pattern: 'rainbow', colors: ['#e55879', '#7e9bfa'] },
    { id: 'graffiti', type: 'ball', name: 'Grafiti', description: 'Sprey izleri, sokak harfleri.', price: 520, pattern: 'graffiti', colors: ['#ba529c', '#c5e369'] },
    { id: 'sunset', type: 'ball', name: 'Gün Batımı', description: 'Pembe ve altın spiral.', price: 620, pattern: 'sunset', colors: ['#f49749', '#c3578f'] },
    { id: 'neon', type: 'ball', name: 'Neon', description: 'Karanlıkta parlayan ızgara.', price: 720, pattern: 'neon', colors: ['#20e8dc', '#252445'] },
    { id: 'circuit', type: 'ball', name: 'Devre', description: 'Zümrüt yüzey, altın yollar.', price: 820, pattern: 'circuit', colors: ['#246d57', '#dcc279'] },
    { id: 'royal', type: 'ball', name: 'Kraliyet', description: 'Kadife moru, altın süsleme.', price: 950, pattern: 'royal', colors: ['#572d80', '#dbb356'] },
    { id: 'chrome', type: 'ball', name: 'Krom', description: 'Ayna gibi gümüş metal.', price: 1100, pattern: 'chrome', colors: ['#d9e6ed', '#778b9b'] },
    { id: 'crystal', type: 'ball', name: 'Kristal', description: 'Prizma gibi ışık kıran yüzey.', price: 1250, pattern: 'crystal', colors: ['#b9e0f2', '#b490d9'] },
    { id: 'phoenix', type: 'ball', name: 'Anka', description: 'Ateş rengi, zarif tüyler.', price: 1500, pattern: 'phoenix', colors: ['#ea5729', '#f8d476'] },
    { id: 'obsidian', type: 'ball', name: 'Obsidyen', description: 'Volkan camı, mor parıltılı çatlaklar.', price: 2200, pattern: 'obsidian', colors: ['#171726', '#b38cfa'] },
    { id: 'jade', type: 'ball', name: 'Yeşim', description: 'Yeşim taşı, açık renkli ince damarlar.', price: 2800, pattern: 'jade', colors: ['#27694f', '#d9ead0'] },
    { id: 'solar', type: 'ball', name: 'Güneş', description: 'Sıcak altın, güneş koronu ve ışınlar.', price: 3400, pattern: 'solar', colors: ['#ef9431', '#fff2a0'] },
    { id: 'hologram', type: 'ball', name: 'Hologram', description: 'Yanardöner ızgara ve prizma renkleri.', price: 4200, pattern: 'hologram', colors: ['#67e7df', '#ec91e3'] },
    { id: 'dragon', type: 'ball', name: 'Ejderha', description: 'Kızıl pullar, altın renkli kenarlar.', price: 5200, pattern: 'dragon', colors: ['#a62f3b', '#eac56d'] },
    { id: 'aurora', type: 'ball', name: 'Kutup Işıkları', description: 'Koyu gökte yeşil ve mor ışık perdeleri.', price: 6400, pattern: 'aurora', colors: ['#55dcad', '#b590ef'] },
    { id: 'sapphire', type: 'ball', name: 'Safir', description: 'Derin mavi, keskin taş yüzeyleri.', price: 7800, pattern: 'sapphire', colors: ['#254eaa', '#96d9ff'] },
    { id: 'eclipse', type: 'ball', name: 'Tutulma', description: 'Koyu güneşi saran parlak bir halka.', price: 9500, pattern: 'eclipse', colors: ['#171b2b', '#ffd08b'] },
    { id: 'nebula', type: 'ball', name: 'Bulutsu', description: 'Pembe ve mor bulutlarda sayısız yıldız.', price: 11500, pattern: 'nebula', colors: ['#aa62ba', '#e4a7d0'] },
    { id: 'diamond', type: 'ball', name: 'Elmas', description: 'Buz mavisi, çok yüzlü elmas prizması.', price: 14000, pattern: 'diamond', colors: ['#c1ecf4', '#f7fcff'] },
    { id: 'astral', type: 'ball', name: 'Yıldız Haritası', description: 'Lacivert gökte altın takımyıldızları.', price: 18000, pattern: 'astral', colors: ['#233654', '#edce8d'] },
    { id: 'singularity', type: 'ball', name: 'Tekillik', description: 'Kara deliğin çevresinde ışık halkaları.', price: 24000, pattern: 'singularity', colors: ['#10121e', '#ed9363'] },
    { id: 'none', type: 'particle', name: 'Yalın', description: 'Topun kendi izini bırak.', price: 0, pattern: 'none', colors: ['#a0b39d'] },
    { id: 'sparks', type: 'particle', name: 'Kıvılcım', description: 'Havada dans eden kıvılcımlar.', price: 15, pattern: 'sparks', colors: ['#f6b34e', '#ffd992'] },
    { id: 'snow', type: 'particle', name: 'Kar Taneleri', description: 'Süzülen altı kollu taneler.', price: 24, pattern: 'snow', colors: ['#d6f4ff', '#ffffff'] },
    { id: 'hearts', type: 'particle', name: 'Kalpler', description: 'Şutuna eşlik eden minik kalpler.', price: 35, pattern: 'hearts', colors: ['#ff83a5', '#f9b6cb'] },
    { id: 'ice', type: 'particle', name: 'Buz İzi', description: 'Işıldayan mavi kristaller.', price: 45, pattern: 'ice', colors: ['#79dbf3', '#d2f7ff'] },
    { id: 'bubbles', type: 'particle', name: 'Baloncuklar', description: 'Hafifçe yükselen saydam küreler.', price: 60, pattern: 'bubbles', colors: ['#b4ecf5', '#ffffff'] },
    { id: 'confetti', type: 'particle', name: 'Konfeti', description: 'Dönen renkli kâğıt parçaları.', price: 80, pattern: 'confetti', colors: ['#f991aa', '#73d6d0'] },
    { id: 'stars', type: 'particle', name: 'Yıldız', description: 'Her atışta küçük yıldızlar.', price: 110, pattern: 'stars', colors: ['#ffde8c', '#fff7d3'] },
    { id: 'petals', type: 'particle', name: 'Yapraklar', description: 'Rüzgârda dönen çiçek yaprakları.', price: 145, pattern: 'petals', colors: ['#eba2c5', '#f9d8e7'] },
    { id: 'embers', type: 'particle', name: 'Kor', description: 'Yükselen turuncu ateş taneleri.', price: 185, pattern: 'embers', colors: ['#ff7638', '#ffc966'] },
    { id: 'galaxy', type: 'particle', name: 'Kozmos', description: 'Mor ve pembe bir yıldız izi.', price: 240, pattern: 'galaxy', colors: ['#b898ff', '#f3b6ef'] },
    { id: 'lightning', type: 'particle', name: 'Şimşek', description: 'Keskin mavi elektrik kıvılcımları.', price: 320, pattern: 'lightning', colors: ['#8fecff', '#d9ffff'] },
    { id: 'spiral', type: 'particle', name: 'Sarmal', description: 'Topun çevresinde dönen ışıklar.', price: 420, pattern: 'spiral', colors: ['#80deba', '#f0cf7e'] },
    { id: 'meteor', type: 'particle', name: 'Meteor', description: 'Uzun izli kayan yıldızlar.', price: 560, pattern: 'meteor', colors: ['#f4c895', '#ffefe0'] },
    { id: 'runes', type: 'particle', name: 'Rünler', description: 'Havada süzülen parlak işaretler.', price: 740, pattern: 'runes', colors: ['#c0a0ed', '#e5cdff'] },
    { id: 'rainbow', type: 'particle', name: 'Renk Şeridi', description: 'Birbirini izleyen yedi renk.', price: 980, pattern: 'rainbow', colors: ['#f279b1', '#7cccef'] },
    { id: 'smoke', type: 'particle', name: 'Duman', description: 'Yavaşça dağılan yumuşak bulut.', price: 1300, pattern: 'smoke', colors: ['#c5cedb', '#e1ddea'] },
    { id: 'comet', type: 'particle', name: 'Kuyruklu Yıldız', description: 'Buz mavisi, uzun ışık kuyrukları.', price: 1800, pattern: 'comet', colors: ['#8ceaff', '#f3fdff'] },
    { id: 'fireflies', type: 'particle', name: 'Ateş Böcekleri', description: 'Usulca uçuşan, yanıp sönen ışıklar.', price: 2300, pattern: 'fireflies', colors: ['#d9ef76', '#fff8bc'] },
    { id: 'plasma', type: 'particle', name: 'Plazma', description: 'Mor ve pembe enerji halkaları.', price: 3000, pattern: 'plasma', colors: ['#b58bff', '#f2a8df'] },
    { id: 'frostnova', type: 'particle', name: 'Buz Patlaması', description: 'Dışa açılan keskin buz ışınları.', price: 3800, pattern: 'frostnova', colors: ['#9ee9ff', '#f2fcff'] },
    { id: 'cherryblossom', type: 'particle', name: 'Kiraz Çiçekleri', description: 'Dönerek süzülen pembe çiçekler.', price: 4800, pattern: 'cherryblossom', colors: ['#f7a7c1', '#ffe4e9'] },
    { id: 'iontrail', type: 'particle', name: 'İyon İzi', description: 'Birlikte akan ince elektrik çizgileri.', price: 6000, pattern: 'iontrail', colors: ['#6fe3f4', '#9e9bff'] },
    { id: 'starfall', type: 'particle', name: 'Yıldız Yağmuru', description: 'Dökülen beş köşeli altın yıldızlar.', price: 7600, pattern: 'starfall', colors: ['#f7d36b', '#fff2bc'] },
    { id: 'auroraveil', type: 'particle', name: 'Kutup Perdesi', description: 'Dalgalanan yeşil ve mor ışık örtüsü.', price: 9500, pattern: 'auroraveil', colors: ['#78e8ba', '#bb99f2'] },
    { id: 'solarflare', type: 'particle', name: 'Güneş Alevi', description: 'Parlayarak açılan sıcak güneş ışınları.', price: 12000, pattern: 'solarflare', colors: ['#ffbc54', '#fff1b5'] },
    { id: 'voidpulse', type: 'particle', name: 'Boşluk Dalgası', description: 'Genişleyip kaybolan mor uzay halkaları.', price: 16000, pattern: 'voidpulse', colors: ['#9a82df', '#ceb8ff'] },
    { id: 'nylon', type: 'net', name: 'Beyaz File', description: 'Kalın dokulu klasik naylon.', price: 0, pattern: 'nylon', colors: ['#e7e2cc', '#fff7e3'] },
    { id: 'black-net', type: 'net', name: 'Siyah File', description: 'Koyu örgü, sade sokak stili.', price: 90, pattern: 'black-net', colors: ['#242a2c', '#6f7b7a'] },
    { id: 'chain', type: 'net', name: 'Çelik Zincir', description: 'Metal halkalar ve zincir şakırtısı.', price: 200, pattern: 'chain', colors: ['#b2c0c7', '#eef4f5'] },
    { id: 'gold-chain', type: 'net', name: 'Altın Zincir', description: 'Parlak altın halkalı zincir.', price: 450, pattern: 'gold-chain', colors: ['#d3a63e', '#ffe4a0'] },
    { id: 'standard', type: 'rim', name: 'Klasik Çember', description: 'Sıcak turuncu boyalı çelik.', price: 0, pattern: 'standard', colors: ['#df703e', '#f8a46b'] },
    { id: 'black-rim', type: 'rim', name: 'Gece Çemberi', description: 'Mat siyah, yalın görünüm.', price: 80, pattern: 'black-rim', colors: ['#242a31', '#68747a'] },
    { id: 'chrome-rim', type: 'rim', name: 'Krom Çember', description: 'Işığı yakalayan gümüş metal.', price: 150, pattern: 'chrome-rim', colors: ['#a8becb', '#f2fcff'] },
    { id: 'gold-rim', type: 'rim', name: 'Altın Çember', description: 'Parlak, sıcak altın kaplama.', price: 300, pattern: 'gold-rim', colors: ['#d6a843', '#ffeaa4'] },
    { id: 'neon-rim', type: 'rim', name: 'Neon Çember', description: 'Turkuaz ışıkla parlayan halka.', price: 500, pattern: 'neon-rim', colors: ['#2fead6', '#b7fff4'] },
    { id: 'glass', type: 'backboard', name: 'Cam Panya', description: 'Saydam cam ve beyaz hedef.', price: 0, pattern: 'glass', colors: ['#c9e4e3', '#ffffff'] },
    { id: 'street-board', type: 'backboard', name: 'Sokak Panyası', description: 'Eskitilmiş ahşap, koyu hedef.', price: 120, pattern: 'street-board', colors: ['#ded4b8', '#34434a'] },
    { id: 'carbon-board', type: 'backboard', name: 'Karbon Panya', description: 'Koyu karbon dokuma ve gümüş hedef.', price: 240, pattern: 'carbon-board', colors: ['#202b31', '#c9d8dc'] },
    { id: 'neon-board', type: 'backboard', name: 'Neon Panya', description: 'Işıklı kenarlar, mor ve turkuaz.', price: 420, pattern: 'neon-board', colors: ['#a78af5', '#60f2df'] },
    { id: 'gym', type: 'environment', name: 'Klasik Salon', description: 'Gün ışığı ve akçaağaç parke.', price: 0, pattern: 'gym', colors: ['#e2c491', '#a7bcb4'] },
    { id: 'sunset-gym', type: 'environment', name: 'Gün Batımı', description: 'Salona yayılan altın akşam ışığı.', price: 180, pattern: 'sunset-gym', colors: ['#f4b375', '#ac7691'] },
    { id: 'night-gym', type: 'environment', name: 'Gece Salonu', description: 'Koyu salon, serin gece ışıkları.', price: 350, pattern: 'night-gym', colors: ['#19283d', '#76b9dc'] },
    { id: 'street-court', type: 'environment', name: 'Sokak Sahası', description: 'Yağmur, ıslak asfalt ve tel örgü.', price: 600, pattern: 'street-court', colors: ['#466a7d', '#cf914f'] },
    { id: 'midnight-court', type: 'environment', name: 'Gece Yarısı', description: 'Gece yağmuru ve ışıklı sokaklar.', price: 1800, pattern: 'midnight-court', colors: ['#152039', '#98bdd8'] },
    { id: 'coastal-court', type: 'environment', name: 'Sahil Sahası', description: 'Deniz esintisi, çise ve palmiyeler.', price: 3200, pattern: 'coastal-court', colors: ['#72ced7', '#e7c48d'] },
    { id: 'desert-court', type: 'environment', name: 'Çöl Sahası', description: 'Savrulan kumlar ve kum fırtınası.', price: 5000, pattern: 'desert-court', colors: ['#cf8d58', '#edc28b'] },
    { id: 'alpine-court', type: 'environment', name: 'Dağ Sahası', description: 'Kar yağışı ve karlı dağlar.', price: 7500, pattern: 'alpine-court', colors: ['#91bdc9', '#eef7f3'] },
    { id: 'neon-arena', type: 'environment', name: 'Neon Arena', description: 'Karanlık salonda renkli ışık çizgileri.', price: 11000, pattern: 'neon-arena', colors: ['#4cf0d6', '#b388ed'] },
    { id: 'royal-arena', type: 'environment', name: 'Kraliyet Arenası', description: 'Mor salon, altın süsler ve sıcak ışık.', price: 16000, pattern: 'royal-arena', colors: ['#653d7e', '#e6c16f'] }
  ];
  catalog.sort((a, b) => (a.type === b.type ? a.price - b.price : categories.indexOf(categoryByType[a.type]) - categories.indexOf(categoryByType[b.type])));
  window.PotaShopCatalog = catalog;

  function priceTier(price) {
    return price <= 90 ? 'Başlangıç' : price <= 350 ? 'Özel' : price <= 1500 ? 'Koleksiyon' : price <= 7500 ? 'Seçkin' : 'Prestij';
  }

  window.createPotaShop = function createPotaShop(options) {
    const dialog = document.getElementById('shop-dialog');
    const items = document.getElementById('shop-items');
    const balance = document.getElementById('shop-balance');
    const status = document.getElementById('shop-status');
    const scroller = document.getElementById('shop-catalog');
    const summary = document.getElementById('shop-catalog-summary');
    const previewObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle('is-preview-visible', entry.isIntersecting));
    }, { root: scroller, rootMargin: '40px' }) : null;
    const tabs = Array.from(dialog.querySelectorAll('[data-shop-tab]'));
    let activeType = 'ball';
    let pending = false;
    let returnFocus = null;

    function economy() {
      const saved = options.getEconomy() || {};
      const current = { balance: Math.max(0, Number(saved.balance) || 0) };
      categories.forEach(category => {
        current[category.owned] = Array.from(new Set([category.defaultId].concat(saved[category.owned] || [])));
        current[category.equipped] = saved[category.equipped] || category.defaultId;
      });
      return current;
    }

    function notify(message, error) {
      status.textContent = message;
      status.classList.toggle('is-error', Boolean(error));
    }

    function number(value) {
      return Math.floor(value).toLocaleString('tr-TR');
    }

    function swatch(item) {
      if (item.type === 'ball') {
        return '<div class="cosmetic-preview"><span class="ball-swatch ball-' + item.pattern + '" aria-hidden="true"><span></span></span></div>';
      }
      if (item.type === 'net') {
        return '<div class="cosmetic-preview"><span class="net-swatch net-' + item.pattern + '" aria-hidden="true">' + '<i></i>'.repeat(12) + '</span></div>';
      }
      if (item.type === 'rim') {
        return '<div class="cosmetic-preview"><span class="rim-swatch rim-' + item.pattern + '" aria-hidden="true"></span></div>';
      }
      if (item.type === 'backboard') {
        return '<div class="cosmetic-preview"><span class="board-swatch board-' + item.pattern + '" aria-hidden="true"><i></i></span></div>';
      }
      if (item.type === 'environment') {
        return '<div class="cosmetic-preview"><span class="environment-swatch environment-' + item.pattern + '" aria-hidden="true"><i></i></span></div>';
      }
      if (item.id === 'none') {
        return '<div class="cosmetic-preview"><span class="particle-swatch particle-none" aria-hidden="true"><span></span></span></div>';
      }
      return '<div class="cosmetic-preview"><span class="particle-swatch particle-' + item.pattern + '" aria-hidden="true"><span class="particle-core"></span>' +
        '<i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div>';
    }

    function refresh() {
      const saved = economy();
      balance.textContent = number(saved.balance);
      const menuBalance = document.getElementById('wallet-balance');
      if (menuBalance) menuBalance.textContent = number(saved.balance);
      if (previewObserver) previewObserver.disconnect();
      const visibleItems = catalog.filter(item => item.type === activeType);
      const category = categoryByType[activeType];
      const paidItems = visibleItems.filter(item => item.price > 0);
      const categoryCount = visibleItems.length - (category.excludeDefaultCount ? 1 : 0);
      const priceRange = paidItems.length ? number(paidItems[0].price) + '–' + number(paidItems[paidItems.length - 1].price) + ' puan' : 'Ücretsiz';
      summary.textContent = categoryCount + ' ' + category.summary + ' · ' + priceRange;
      let previousTier = '';
      items.innerHTML = visibleItems.map(item => {
        const tier = priceTier(item.price);
        let heading = '';
        if (tier !== previousTier) {
          previousTier = tier;
          const group = visibleItems.filter(entry => priceTier(entry.price) === tier);
          const paid = group.filter(entry => entry.price > 0);
          const range = paid.length ? number(paid[0].price) + '–' + number(paid[paid.length - 1].price) + ' PUAN' : 'ÜCRETSİZ';
          const tierClass = tier === 'Prestij' ? ' shop-tier-prestige' : tier === 'Seçkin' ? ' shop-tier-elite' : '';
          heading = '<div class="shop-tier' + tierClass + '"><strong>' + tier + '</strong><span>' + range + '</span></div>';
        }
        const owned = saved[category.owned].includes(item.id);
        const equipped = saved[category.equipped] === item.id;
        const affordable = saved.balance >= item.price;
        const text = equipped ? 'Seçili' : owned ? 'Kullan' : 'Satın al ve kullan';
        const label = equipped ? item.name + ' seçili' : owned ? item.name + ' kullan' : item.name + ', ' + item.price + ' puan, satın al ve kullan';
        return heading + '<article class="cosmetic-card' + (equipped ? ' is-equipped' : '') + '">' +
          swatch(item) + '<div class="cosmetic-info"><h2>' + item.name + '</h2><p>' + item.description + '</p></div>' +
          '<div class="cosmetic-price">' + (owned ? (equipped ? '<span class="owned-label">KULLANILIYOR</span>' : '<span class="owned-label">SENİN</span>') : '<strong>' + number(item.price) + '</strong><span>puan</span>') + '</div>' +
          '<button class="cosmetic-action' + (!owned && !affordable ? ' needs-points' : '') + '" data-cosmetic="' + item.type + ':' + item.id + '" aria-label="' + label + '"' + (equipped || pending ? ' disabled' : '') + '>' + text + (equipped ? '<svg aria-hidden="true"><use href="#i-check"/></svg>' : '') + '</button></article>';
      }).join('');
      items.querySelectorAll('.cosmetic-card').forEach(card => {
        if (previewObserver) previewObserver.observe(card);
        else card.classList.add('is-preview-visible');
      });
      tabs.forEach(tab => {
        const tabCategory = categoryByType[tab.dataset.shopTab];
        const count = catalog.filter(item => item.type === tabCategory.type && (!tabCategory.excludeDefaultCount || item.id !== tabCategory.defaultId)).length;
        const countElement = tab.querySelector('.shop-tab-count');
        if (countElement) countElement.textContent = number(count);
        const active = tab.dataset.shopTab === activeType;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      items.setAttribute('aria-labelledby', category.tabId);
    }

    function changeTab(type, focus) {
      if (!categoryByType[type]) return;
      activeType = type;
      notify('', false);
      refresh();
      scroller.scrollTop = 0;
      if (focus) tabs.find(tab => tab.dataset.shopTab === type).focus();
    }

    async function choose(item) {
      if (pending) return;
      const saved = economy();
      const owned = saved[categoryByType[item.type].owned].includes(item.id);
      if (!owned && saved.balance < item.price) {
        notify(item.name + ' için ' + number(item.price - saved.balance) + ' puan daha kazan.', true);
        return;
      }
      pending = true;
      refresh();
      try {
        if (!owned) {
          const purchased = await options.onPurchase(item);
          if (purchased !== true) {
            notify(typeof purchased === 'string' ? purchased : 'Yeterli puanın yok. Birkaç basket daha at.', true);
            return;
          }
        }
        const equipped = await options.onEquip(item);
        if (equipped !== true) {
          notify(typeof equipped === 'string' ? equipped : 'Bu seçim uygulanamadı. Yeniden dene.', true);
          return;
        }
        notify(item.name + (owned ? ' seçildi. Sahada seni bekliyor.' : ' alındı ve seçildi. Sahada seni bekliyor.'), false);
      } catch (error) {
        notify('İşlem tamamlanamadı. Yeniden dene.', true);
      } finally {
        pending = false;
        refresh();
        const action = items.querySelector('[data-cosmetic="' + item.type + ':' + item.id + '"]');
        if (dialog.open && action && !action.disabled) action.focus({ preventScroll: true });
      }
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => changeTab(tab.dataset.shopTab, false));
      tab.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          changeTab(tabs[(index + direction + tabs.length) % tabs.length].dataset.shopTab, true);
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          changeTab(tabs[event.key === 'Home' ? 0 : tabs.length - 1].dataset.shopTab, true);
        }
      });
    });

    items.addEventListener('click', event => {
      const button = event.target.closest('[data-cosmetic]');
      if (!button || button.disabled) return;
      const item = catalog.find(entry => entry.type + ':' + entry.id === button.dataset.cosmetic);
      if (item) choose(item);
    });

    function close() {
      if (dialog.open) dialog.close();
    }
    document.getElementById('close-shop').addEventListener('click', close);
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    });
    dialog.addEventListener('close', () => {
      if (returnFocus && returnFocus.isConnected && returnFocus.offsetParent !== null) returnFocus.focus();
      else document.getElementById('court').focus({ preventScroll: true });
      returnFocus = null;
    });

    return {
      open: function () {
        notify('', false);
        refresh();
        returnFocus = document.activeElement;
        scroller.scrollTop = 0;
        if (!dialog.open) dialog.showModal();
        document.getElementById('close-shop').focus({ preventScroll: true });
      },
      refresh: refresh,
      close: close
    };
  };
}());
