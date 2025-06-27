# En güncel ve uyumlu Node.js versiyonunu kullan
FROM node:20-slim

# Çalışma alanını belirle
WORKDIR /usr/src/app

# Video birleştirme fırını olan ffmpeg'i kur
RUN apt-get update && apt-get install -y ffmpeg

# Malzeme listesini kopyala
COPY package*.json ./

# Gerekli tüm malzemeleri indir
RUN npm install --omit=dev

# Projenin geri kalanını kopyala
COPY . .

# Sunucuyu başlat
CMD [ "node", "server.js" ]
