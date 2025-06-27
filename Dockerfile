Adım Adım Render ile Backend Yayınlama Rehberi
Bu rehber, Node.js ile yazdığımız "mutfak" (backend) kodunu, internet üzerinden herkesin erişebileceği şekilde yayınlamanı sağlayacak. Bunun için Render.com adında, başlangıç için ücretsiz olan harika bir servis kullanacağız.

Ön Hazırlık: Neye İhtiyacın Var?
Bir GitHub Hesabı: Tüm kodlarımızı burada tutacağız.

backend Klasörün GitHub'da: Bilgisayarındaki backend klasörünün içindeki tüm dosyaların (server.js, package.json vb.) kendi başına bir GitHub reposunda olması gerekiyor. Repo'nun adını youtube-downloader-backend gibi bir şey yapabilirsin.

Adım 1: Mutfağın Tarif Defterini Oluştur (Dockerfile)
Bu, en önemli adımdır. Render'a, bizim mutfağımızı nasıl kuracağını anlatan bir tarif defteri vereceğiz. Bu defterin adı Dockerfile.

Bilgisayarındaki backend klasörünün içine gir.

Bu klasörün içinde, Dockerfile adında yeni bir dosya oluştur. (Uzantısı olmayacak, sadece Dockerfile).

Aşağıdaki kodun tamamını kopyalayıp bu yeni Dockerfile dosyasının içine yapıştır ve kaydet:

# Sağlam ve güncel bir Node.js versiyonunu temel alıyoruz (20. sürüm)
# Bu, kütüphanelerin istediği versiyonla uyumludur.
FROM node:20-slim

# Mutfak tezgahımızı hazırlıyoruz
WORKDIR /usr/src/app

# --- YENİ EKLENEN KISIM ---
# YouTube'un sunucu IP'lerini engellemesini zorlaştırmak için bir ortam değişkeni ayarlıyoruz.
# Bu, ytdl-core kütüphanesinin gereksiz güncelleme kontrolü yapmasını engeller.
ENV YTDL_NO_UPDATE=1
# --- YENİ KISIM SONU ---

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

Bu değişikliği yaptığın Dockerfile dosyasını, GitHub'daki youtube-downloader-backend repona gönder. Artık mutfağımız daha akıllı bir şekilde kuruluma hazır!

Adım 2: Mutfağı Render'a Kur
Şimdi tarif defterimizi alıp Render'a vereceğiz.

Render.com'a git ve GitHub hesabınla üye ol veya giriş yap.

"Dashboard" (Kontrol Paneli) ekranında, sağ üstteki "New +" butonuna bas ve açılan menüden "Web Service" seçeneğini seç.

GitHub hesabını Render'a bağlamanı isteyecektir. İzin ver ve açılan listeden youtube-downloader-backend reponu seçip "Connect" de.

Şimdi kurulum ayarlarını yapacağın bir ekran gelecek. Burası çok önemli:

Name: Mutfağına bir isim ver (örn: youtube-indiricim). Bu, adresinde kullanılacak.

Environment (Ortam): Bu en kritik ayar. "Docker" seçeneğini seçmelisin. Render'a, bizim verdiğimiz Dockerfile tarif defterini kullanmasını söylüyoruz.

Instance Type (Plan): "Free" (Ücretsiz) seçeneğini seç. Bu proje için fazlasıyla yeterli.

En alttaki "Create Web Service" butonuna bas.

Şimdi arkana yaslan. Render, GitHub'dan kodunu alacak, Dockerfile içindeki tarifleri adım adım uygulayacak, ffmpeg'i kuracak ve sunucunu çalıştıracak. Bu işlem 5-10 dakika sürebilir.

Adım 3: Adresi Al ve Menüyü Güncelle
Kurulum bittiğinde, Render sana yeşil bir "Live" (Yayında) etiketi gösterecek ve sayfanın üst kısmında https://youtube-indiricim.onrender.com gibi bir adres verecek.

Bu adresi kopyala. Bu, artık internette 7/24 çalışan mutfağının adresi.

Şimdi Canvas'ta açık olan index.html (Nihai Frontend Kodu) dosyana git.

Kodun içindeki şu satırı bul:

const API_URL = 'http://localhost:4000'; 

Bu satırı, az önce Render'dan kopyaladığın adresle değiştir:

const API_URL = 'https://youtube-indiricim.onrender.com';

Bu değişikliği yaptığın index.html dosyasını, Netlify'da yayınladığın projene yükle.

İşte bu kadar! Artık Netlify'daki arayüzün, Render'daki güçlü mutfağınla konuşacak ve programın dünyanın her yerinden sorunsuz bir şekilde çalışacak.