FROM node:18-slim

# Playwright için gerekli sistem bağımlılıkları
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bağımlılıkları önce kopyala (cache optimizasyonu)
COPY package*.json ./
RUN npm install

# Playwright Chromium browser'ı indir
RUN npx playwright install chromium

# Prisma schema'yı kopyala ve client'ı generate et
COPY prisma ./prisma
RUN npx prisma generate

# Kaynak kodunu kopyala
COPY src ./src

# Ekran görüntüleri için klasör oluştur
RUN mkdir -p test-results/screenshots

EXPOSE 3001

# Prisma migration'ı uygula, ardından sunucuyu başlat
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
