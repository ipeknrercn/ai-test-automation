# AI-Powered Test Automation Tool

> Doğal dil komutlarıyla çalışan, yapay zeka destekli otomatik test otomasyon aracı.

---

## Proje Hakkında

Bu proje, yazılım test süreçlerini yapay zeka ile otomatikleştirmek amacıyla geliştirilmektedir. Geleneksel test otomasyon araçlarının aksine, kod yazmaya gerek kalmadan doğal dil kullanılan komutlarla web uygulamalarını test edebilmek temel hedefimizdir.

Proje, bir test mühendisinin karşılaştığı manuel test yükünü azaltma fikriyle doğmuştur. Yapay zeka, ekranda ne gördüğünü analiz eder, bir sonraki adımı kendi belirler ve her işlemi otomatik olarak kaydeder.

---

## Ne Yapıyor?

Kullanıcı sisteme şöyle bir komut yazar:

```
"Siteye gir, çerezleri kabul et, kullanıcı adı ve şifre ile giriş yap.
Giriş başarılıysa sepeti aç, ürün varsa temizle, yoksa favorilerden ekle."
```

Sistem bu komutu alır, adım adım tarayıcıyı kontrol eder, her adımda ekran görüntüsü çeker ve yapay zeka görüntüyü analiz ederek bir sonraki eylemi belirler. Sonuçlar veritabanına kaydedilir ve raporlanır.

---

## Mimari

Proje üç ana katmandan oluşmaktadır:

**Frontend (Geliştirme aşamasında)**
Kullanıcının test komutlarını girebileceği, geçmiş test sonuçlarını görebileceği ve istatistikleri takip edebileceği bir React arayüzü planlanmaktadır.

**Backend (Aktif geliştirme)**
Node.js ve Express.js ile yazılmış REST API. Test komutlarını alır, browser agent'ı çalıştırır, AI servisiyle iletişim kurar ve sonuçları veritabanına yazar.

**Veritabanı (Tamamlandı)**
PostgreSQL ve Prisma ORM kullanılmaktadır. Test geçmişi, adım detayları, ekran görüntüleri ve prompt versiyonları burada saklanır.

---

## Proje Yapısı

```
ai-test-automation/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js          # Prisma bağlantı yapılandırması
│   │   ├── controllers/
│   │   │   └── testController.js    # HTTP istek/yanıt yönetimi
│   │   ├── routes/
│   │   │   └── testRoutes.js        # API endpoint tanımlamaları
│   │   ├── services/
│   │   │   ├── aiService.js         # Claude Vision AI entegrasyonu
│   │   │   └── testService.js       # Test iş mantığı ve Playwright kontrolü
│   │   └── server.js                # Express uygulama başlangıç noktası
│   │
│   ├── prisma/
│   │   ├── schema.prisma            # Veritabanı şema tanımları
│   │   └── migrations/              # Veritabanı versiyon geçmişi
│   │
│   ├── manual-tests/                # El ile çalıştırılan test senaryoları
│   ├── test-results/
│   │   └── screenshots/             # Test sırasında alınan ekran görüntüleri
│   │
│   └── .env                         # Ortam değişkenleri (API key, DB URL)
│
└── frontend/                        # (Geliştirme aşamasında - React)
```

---

## Teknoloji Stack'i

| Katman | Teknoloji | Açıklama |
|--------|-----------|----------|
| Backend | Node.js + Express.js | REST API sunucusu |
| Browser Automation | Playwright | Tarayıcı kontrolü ve ekran görüntüsü |
| Yapay Zeka | Claude Sonnet (Vision) | Ekran analizi ve karar verme |
| Veritabanı | PostgreSQL | Kalıcı veri saklama |
| ORM | Prisma | Veritabanı ile güvenli iletişim |
| Frontend | React (Planlanıyor) | Kullanıcı arayüzü |

---

## Geliştirme Fazları

### Faz 1 — Playwright Temelleri
Playwright kurulumu, temel tarayıcı otomasyonu ve ekran görüntüsü alma işlemleri tamamlandı. Projenin test altyapısı kuruldu.

### Faz 2 — Veritabanı Entegrasyonu
PostgreSQL ve Prisma ORM kurulumu, veritabanı şeması tasarımı ve migration yapısı oluşturuldu. Test sonuçları artık kalıcı olarak saklanabiliyor.

### Faz 3A — Backend API
Express.js sunucusu, REST endpoint'leri, Prisma entegrasyonu ve hata yönetimi tamamlandı. API test araçlarıyla doğrulandı.

### Faz 3B — Yapay Zeka Entegrasyonu
Claude Vision API bağlantısı kuruldu. Sistem artık ekran görüntüsünü yapay zekaya gönderebiliyor ve analiz sonucuna göre adım kararı alabiliyor.

### Faz 3C — Browser Agent + AI Döngüsü
Playwright ve yapay zekanın birlikte çalıştığı ana döngü tamamlandı. Her adımda: ekran görüntüsü çek → AI'ya gönder → karar al → eylemi gerçekleştir → veritabanına kaydet.

### Faz 4 — Prompt Versiyonlama (Devam Ediyor)
Her test çalıştırıldığında prompt performansı ölçülecek ve zaman içinde otomatik iyileştirme sağlanacak.

### Faz 5 — Frontend Geliştirme (Planlanıyor)
React ile kullanıcı arayüzü, test geçmişi dashboard'u ve gerçek zamanlı test izleme ekranı.

### Faz 6 — Docker & Sandbox Ortamı (Planlanıyor)
Docker ile izole test ortamı, güvenli sandbox yapısı ve çoklu paralel test desteği.

---

## Nasıl Çalışır?

```
Kullanıcı Komutu (Doğal Dil)
         ↓
   Backend API Alır
         ↓
   Playwright Tarayıcıyı Açar
         ↓
   ┌─────────────────────────┐
   │  Ekran Görüntüsü Al     │
   │          ↓              │
   │  Claude Vision'a Gönder │
   │          ↓              │
   │  AI: "Ne yapmalıyım?"   │
   │          ↓              │
   │  Eylemi Gerçekleştir    │
   │          ↓              │
   │  Sonucu Veritabanına    │
   │  Kaydet                 │
   └──────────┬──────────────┘
              │ (Görev tamamlanana kadar tekrar)
              ↓
   Test Raporu Üret
```

---

## Veritabanı Yapısı

Sistem dört ana tablo üzerinde çalışmaktadır:

- **Test** — Test senaryolarının tanımları ve prompt metinleri
- **TestRun** — Her test çalıştırmasının sonuçları (başarılı/başarısız, süre)
- **TestStep** — Her adımın detayı (hangi eleman, hangi eylem, güven skoru)
- **PromptVersion** — Prompt geçmişi ve başarı oranlarına göre versiyonlama

---

## Kurulum (Geliştirici)

```bash
# Repoyu klonla
git clone https://github.com/ipeknrercn/ai-test-automation.git
cd ai-test-automation/backend

# Bağımlılıkları yükle
npm install

# Ortam değişkenlerini ayarla
cp .env.example .env
# .env dosyasını kendi bilgilerinle doldur

# Veritabanı şemasını oluştur
npx prisma generate
npx prisma db push

# Sunucuyu başlat
npm start
```

**Gereksinimler:** Node.js 18+, PostgreSQL 14+, Anthropic API Key

---

## API Endpoint'leri

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/health` | Sunucu durum kontrolü |
| POST | `/api/tests/run` | Yeni test çalıştır |
| GET | `/api/tests/history` | Geçmiş test sonuçları |
| GET | `/api/tests/stats` | İstatistikler ve başarı oranları |


---

## Geliştirici Notu

Bu proje, bir QA stajyerinin bitirme projesi olarak başlamış ve aktif olarak geliştirilmektedir. Her commit yeni bir fazı veya geliştirmeyi temsil etmektedir.

---
