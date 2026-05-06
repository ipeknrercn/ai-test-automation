# 1. Aşama: Uygulamanın temelini atıyoruz
FROM node:18-alpine

# 2. Aşama: Uygulama klasörünü oluşturuyoruz
WORKDIR /app

# 3. Aşama: Bağımlılıkları kopyalayıp yüklüyoruz
COPY package*.json ./
RUN npm install

# 4. Aşama: Tüm proje dosyalarını kopyalıyoruz
COPY . .

# 5. Aşama: TypeScript'i JavaScript'e derliyoruz
RUN npm run build

# 6. Aşama: Uygulamanın hangi portta çalışacağını belirtiyoruz
EXPOSE 3000

# 7. Aşama: Uygulamayı başlatıyoruz
CMD ["npm", "start"]