# Build stage
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# Vite build için API URL'ini build zamanında geçebiliriz
# Ancak nginx proxy kullandığımız için "/" (relative) kullanmak daha iyidir
RUN npm run build

# Production stage
FROM nginx:alpine

# Nginx konfigürasyonunu kopyala
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Build edilen dosyaları nginx klasörüne kopyala
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
