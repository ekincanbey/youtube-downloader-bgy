import express from 'express';
import cors from 'cors';
import { Innertube, UniversalCache } from 'youtubei.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProxyAgent, fetch, Request } from 'undici';

// Temel kurulumlar
ffmpeg.setFfmpegPath(ffmpegPath);
const app = express();
const PORT = process.env.PORT || 4000;
app.use(cors());

// Geçici dosyalar için klasör oluştur
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// --- PROXY KURULUMU - EN ÖNEMLİ VE TEK AYARLANACAK YER ---
// Webshare'den veya başka bir servisten aldığın proxy adresini buraya yapıştır.
// ÖNEMLİ: Formatın http://kullaniciadi:sifre@adres:port şeklinde olduğundan emin ol.
const PROXY_URL = process.env.PROXY_URL || 'http://lmhmpajk:6a46y6l4iri6@198.23.239.134:6540'; // ÖRNEK: Burayı KENDİ proxy adresinle değiştir.

// --- KESİN KONTROL ---
// Eğer proxy adresi değiştirilmemişse, programı çalıştırma ve net bir hata ver.
if (!PROXY_URL || PROXY_URL.includes('kullaniciadi:sifre') || PROXY_URL.length < 20) {
    console.error(`
    \n\n
    *****************************************************************************************
    * *
    * K R İ T İ K   H A T A :   P R O X Y   A D R E S İ   A Y A R L A N M A M I Ş !         *
    * *
    * Lütfen 'server.js' dosyasını açıp, 'PROXY_URL' değişkenini                          *
    * kendi gerçek proxy adresinizle güncelleyin ve değişikliği GitHub'a gönderin.         *
    * *
    *****************************************************************************************
    \n\n
    `);
    // Programın çökmesini ve Render'ın sürekli yeniden başlatmasını önlemek için düzgün bir şekilde çıkış yap.
    process.exit(1); 
}
// --- KONTROL SONU ---


const youtube = await Innertube.create({
    cache: new UniversalCache(false), // Önbelleği devre dışı bırak
    fetch: (url, init) => {
        // Bu basit ve sağlam fetch yapısı, tüm istekleri proxy üzerinden yönlendirir.
        return fetch(url, {
            ...init,
            dispatcher: new ProxyAgent(PROXY_URL),
        });
    },
});

console.log('youtubei.js, proxy ile başarılı bir şekilde başlatıldı!');

// API Testi
app.get('/', (req, res) => res.send('Backend başarıyla çalışıyor.'));

// Video bilgilerini getiren endpoint
app.get('/api/info', async (req, res) => {
    try {
        const videoURL = req.query.url;
        if (!videoURL) throw new Error('URL parametresi eksik.');

        const info = await youtube.getInfo(videoURL);
        if (!info.streaming_data) throw new Error('Bu video için format bilgisi alınamadı.');

        const allFormats = [...(info.streaming_data.formats || []), ...(info.streaming_data.adaptive_formats || [])];
        
        const availableFormats = allFormats.map(f => ({
            itag: f.itag,
            quality: f.quality_label || `${Math.round(f.bitrate / 1000)}kbps`,
            mimeType: f.mime_type,
            hasVideo: !!f.has_video,
            hasAudio: !!f.has_audio,
        })).filter(f => f.quality);

        res.json({
            title: info.basic_info.title,
            thumbnail: info.basic_info.thumbnail?.[0].url,
            formats: availableFormats,
        });
    } catch (error) {
        console.error('Bilgi alınırken hata:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// İndirme endpoint'i
app.get('/api/download', async (req, res) => {
    const { videoId, itag } = req.query;
    const tempVideoPath = path.join(tempDir, `video_${Date.now()}.mp4`);
    const finalOutputPath = path.join(tempDir, `final_${Date.now()}.mp4`);

    try {
        if (!videoId || !itag) throw new Error('videoId ve itag gerekli.');

        const info = await youtube.getInfo(videoId);
        const title = info.basic_info.title?.replace(/[^\w\s.-]/gi, '') || 'video';
        
        const allFormats = [...(info.streaming_data.formats || []), ...(info.streaming_data.adaptive_formats || [])];
        const format = allFormats.find(f => f.itag == itag);
        
        if (!format) throw new Error('Seçilen format bulunamadı.');

        // Birleştirme gerektiren durum (sadece video içeren bir format seçildi)
        if (format.has_video && !format.has_audio) {
            const audioFormat = allFormats.filter(f => f.has_audio && !f.has_video).sort((a, b) => b.bitrate - a.bitrate)[0];
            if (!audioFormat) throw new Error('Bu video için uygun bir ses formatı bulunamadı.');
            
            console.log('Video ve ses birleştiriliyor...');
            const videoStream = await youtube.download(videoId, { format });
            const audioStream = await youtube.download(videoId, { format: audioFormat });
            
            await new Promise((resolve, reject) => {
                ffmpeg()
                    .input(videoStream)
                    .videoCodec('copy')
                    .input(audioStream)
                    .audioCodec('copy')
                    .save(finalOutputPath)
                    .on('error', reject)
                    .on('end', resolve);
            });

            res.download(finalOutputPath, `${title}.mp4`, () => {
                fs.unlinkSync(finalOutputPath);
            });
        } else { // Doğrudan indirme (sesli video veya sadece ses)
             console.log('Doğrudan indirme yapılıyor...');
             const extension = format.has_video ? 'mp4' : 'mp3';
             res.header('Content-Disposition', `attachment; filename="${title}.${extension}"`);
             const stream = await youtube.download(videoId, { format });
             for await (const chunk of stream) {
                res.write(chunk);
             }
             res.end();
        }

    } catch (error) {
        console.error('İndirme hatası:', error.message);
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
        if (fs.existsSync(finalOutputPath)) fs.unlinkSync(finalOutputPath);
        if (!res.headersSent) {
            res.status(500).json({ error: 'İndirme sırasında bir hata oluştu.' });
        }
    }
});

app.listen(PORT, () => console.log(`Sunucu port ${PORT} üzerinde çalışıyor...`));
