# Sağlam ve güncel bir Node.js versiyonunu temel alıyoruz (20. sürüm)
# Bu, kütüphanelerin istediği versiyonla uyumludur.
FROM node:20-slim

# Mutfak tezgahımızı hazırlıyoruz
WORKDIR /usr/src/app

# YouTube'un sunucu IP'lerini engellemesini zorlaştırmak için bir ortam değişkeni ayarlıyoruz.
ENV YTDL_NO_UPDATE=1

# En önemli fırınımızı (ffmpeg) kuruyoruz
# Bu komut, video birleştirmek için gereken aracı sunucuya kurar
RUN apt-get update && apt-get install -y ffmpeg

# Malzeme listemizi (package.json) kopyalıyoruz
COPY package*.json ./

# Gerekli tüm malzemeleri (express, ytdl-core vb.) internetten indiriyoruz
RUN npm install --omit=dev

# Projenin geri kalan tüm dosyalarını (server.js vb.) kopyalıyoruz
COPY . .

# Ve son olarak, mutfağın ocağını yakıyoruz!
CMD [ "node", "server.js" ]