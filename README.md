 # AI-Powered Test Automation Tool

## TR
> Doğal dil komutlarıyla çalışan, yapay zeka destekli otomatik test otomasyon aracı.

---

## Proje Hakkında

Bu proje, yazılım test süreçlerini yapay zeka ile otomatikleştirmek amacıyla geliştirildi. Geleneksel test otomasyon araçlarının aksine, kod yazmaya gerek kalmadan doğal dil kullanılan komutlarla web uygulamalarını test edebilmek temel hedefimizdi.

Proje, bir test mühendisinin karşılaştığı manuel test yükünü azaltma fikriyle doğmuştur. Yapay zeka, test mühendisinin prompt olarak girdiği test caselerini analiz eder, ve agent kullanarak bu senaryoları gerçekleştirir. İşlemi otomatik olarak kaydeder ve test sonuçlarını raporlar.

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

**Frontend**
Kullanıcının test komutlarını girebileceği, geçmiş test sonuçlarını görebileceği ve istatistikleri takip edebileceği bir React arayüzü.

**Backend**
Node.js ve Express.js ile yazılmış REST API. Test komutlarını alır, browser agent'ı çalıştırır, AI servisiyle iletişim kurar ve sonuçları veritabanına yazar.

**Veritabanı**
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
└── frontend/                        # (React)
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

### Faz 4 — Frontend Geliştirme
Her test çalıştırıldığında prompt performansı ölçülecek ve zaman içinde otomatik iyileştirme sağlanacak.

### Faz 5 — Prompt Versiyonlama
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
---
## 🎥 Demo Video: 
https://youtu.be/QOY-nXrFLTk
---
---


## EN

> An AI-powered automated test automation tool that works with natural language commands.

---
## About the Project

This project was developed with the aim of automating software testing processes using artificial intelligence. Unlike traditional test automation tools, our main goal was to be able to test web applications using natural language commands without the need to write code.

The project was born from the idea of ​​reducing the manual testing burden faced by a test engineer. Artificial intelligence analyzes the test cases entered promptly by the test engineer and executes these scenarios using an agent. It automatically records the process and reports the test results.
---

## What Does It Do?

The user types the following command into the system:

```
"Enter the site, accept cookies, log in with username and password.
If login is successful, open the cart, clear any existing items, or add them to favorites if none exist."
```

The system receives this command, checks the browser step by step, takes a screenshot at each step, and the artificial intelligence analyzes the image to determine the next action. The results are saved to the database and reported.

---
## Architecture
The project consists of 3 main layers:

**Frontend**
A React interface where the user can enter test commands, view past test results, and track statistics.

**Backend**
A REST API written in Node.js and Express.js. It receives test commands, runs the browser agent, communicates with the AI ​​service, and writes the results to the database.

**Database**
PostgreSQL and Prisma ORM are used. Test history, step details, screenshots, and prompt versions are stored here.

---

## Project Structure

```
ai-test-automation/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js          # Prisma connection configuration
│   │   ├── controllers/
│   │   │   └── testController.js    # HTTP request/response management
│   │   ├── routes/
│   │   │   └── testRoutes.js        # API endpoint definitions
│   │   ├── services/
│   │   │   ├── aiService.js         # Claude Vision AI integration
│   │   │   └── testService.js       # Test business logic and Playwright control
│   │   └── server.js                # Express application entry point
│   │
│   ├── prisma/
│   │   ├── schema.prisma            # Database schema definitions
│   │   └── migrations/              # Database version history
│   │
│   ├── manual-tests/                # Manually run test scenarios
│   ├── test-results/
│   │   └── screenshots/             # Screenshots taken during testing
│   │
│   └── .env                         # Environment variables (API key, DB URL)
│
└── frontend/                        # (React)
```

---

## Technology Stack
| Layer | Technology | Description |
|--------|-----------|----------|
| Backend | Node.js + Express.js | REST API server |
| Browser Automation | Playwright | Browser control and screen capture |
| Artificial Intelligence | Claude Sonnet (Vision) | Screen analysis and decision making |
| Database | PostgreSQL | Persistent data storage |
| ORM | Prisma | Secure communication with the database |
| Frontend | React (Planned) | User interface |
---

## Development Phases

### Phase 1 — Playwright Basics
Playwright setup, basic browser automation, and screenshot capture completed. Project testing infrastructure established.

### Phase 2 — Database Integration
PostgreSQL and Prisma ORM setup, database schema design, and migration structure created. Test results can now be stored persistently.

### Phase 3A — Backend API
The Express.js server, REST endpoints, Prisma integration, and error management have been completed. It has been verified with API testing tools.

### Phase 3B — Artificial Intelligence Integration
The Claude Vision API connection has been established. The system can now send screenshots to artificial intelligence and make decisions on steps based on the analysis results.

### Phase 3C — Browser Agent + AI Loop
The main loop where Playwright and AI work together is complete. Each step: take a screenshot → send to AI → make a decision → perform the action → save to the database.

### Phase 4 — Frontend Development
Prompt performance will be measured each time a test is run, and automatic improvements will be made over time.

### Phase 5 — Prompt Versioning 
User interface, test history dashboard, and real-time test monitoring screen using React.

### Phase 6 — Docker & Sandbox Environment (Planned)
Isolated test environment using Docker, secure sandbox structure, and support for multiple parallel tests.

---
## How Does It Work?
```
User Command (Natural Language)
         ↓
   Backend Receives API
         ↓
   Playwright Opens Browser
         ↓
   ┌─────────────────────────┐
   │  Capture Screen Shot    │
   │          ↓              │
   │  Send to Claude Vision  │
   │          ↓              │
   │  AI: “What should I do?”│
   │          ↓              │
   │  Perform Action         │
   │          ↓              │
   │  Save Result to Database│
   │  Save                   │
   └──────────┬──────────────┘
              │ (Repeat until task is complete)
              ↓
   Generate Test Report
```
---

## Setup 
```bash
# Clone the repository
git clone https://github.com/ipeknrercn/ai-test-automation.git
cd ai-test-automation/backend
# Install dependencies
npm install
# Set environment variables
cp .env.example .env
# Fill the .env file with your own information
# Create the database schema
npx prisma generate
npx prisma db push
# Start the server
npm start
```

**Requirements:** Node.js 18+, PostgreSQL 14+, Anthropic API Key
---

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|----------|
| GET | `/health` | Server status check |
| POST | `/api/tests/run` | Run new test |
| GET | `/api/tests/history` | Past test results |
| GET | `/api/tests/stats` | Statistics and success rates |

---


To run dockerfile
docker compose up --build
To stop the dockerfile
docker compose down

