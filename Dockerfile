# Sağlam bir Node.js versiyonunu temel alıyoruz
FROM node:18-slim

# Mutfak tezgahımızı hazırlıyoruz
WORKDIR /usr/src/app

# En önemli fırınımızı (ffmpeg) kuruyoruz
# Bu komut, video birleştirmek için gereken aracı sunucuya kurar
RUN apt-get update && apt-get install -y ffmpeg

# Malzeme listemizi (package.json) kopyalıyoruz
COPY package*.json ./

# Gerekli tüm malzemeleri (express, ytdl-core vb.) internetten indiriyoruz
RUN npm install --production

# Projenin geri kalan tüm dosyalarını (server.js vb.) kopyalıyoruz
COPY . .

# Ve son olarak, mutfağın ocağını yakıyoruz!
CMD [ "node", "server.js" ]
