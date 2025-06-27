// Gerekli kütüphaneleri içeri aktarıyoruz
const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

// FFmpeg'in yolunu ayarlıyoruz
ffmpeg.setFfmpegPath(ffmpegPath);

// Express uygulamasını başlatıyoruz
const app = express();
const PORT = process.env.PORT || 4000; // Render gibi platformlar için PORT'u ortam değişkeninden al

app.use(cors());

// Geçici dosyalar için 'temp' klasörünün var olduğundan emin ol
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// API Test Endpoint'i
app.get('/', (req, res) => {
    res.send('YouTube İndirici Backend Sunucusu başarıyla çalışıyor!');
});

// Video bilgilerini getiren endpoint
app.get('/api/info', async (req, res) => {
    try {
        const videoURL = req.query.url;
        if (!videoURL || !ytdl.validateURL(videoURL)) {
            return res.status(400).json({ error: 'Geçersiz veya eksik YouTube URLsi.' });
        }
        
        const info = await ytdl.getInfo(videoURL);
        
        const formatMap = new Map();

        // 1. Sadece ses formatlarını (MP3 için) işle
        info.formats
            .filter(f => f.hasAudio && !f.hasVideo)
            .forEach(f => {
                const qualityLabel = `MP3 - ~${Math.round(f.audioBitrate)} kbps`;
                if (!formatMap.has(qualityLabel)) {
                    formatMap.set(qualityLabel, {
                        itag: f.itag,
                        quality: qualityLabel,
                        type: 'MP3'
                    });
                }
            });

        // 2. Hazır sesli videoları (düşük kalite) işle
        info.formats
            .filter(f => f.hasVideo && f.hasAudio)
            .forEach(f => {
                const qualityLabel = `MP4 - ${f.qualityLabel}`;
                if (!formatMap.has(qualityLabel)) {
                    formatMap.set(qualityLabel, {
                        itag: f.itag,
                        quality: qualityLabel,
                        type: 'MP4'
                    });
                }
            });
        
        // 3. Birleştirilecek yüksek kaliteli videoları işle
        const hasAudioOnly = info.formats.some(f => f.hasAudio && !f.hasVideo);
        if (hasAudioOnly) {
            info.formats
                .filter(f => f.hasVideo && !f.hasAudio)
                .forEach(f => {
                    const qualityLabel = `MP4 - ${f.qualityLabel} (Sesli Birleştirilmiş)`;
                    if (!formatMap.has(qualityLabel)) {
                         formatMap.set(qualityLabel, {
                            itag: f.itag, // Video itag'ını kullanıyoruz
                            quality: qualityLabel,
                            type: 'MP4-MERGED' // Özel tip
                        });
                    }
                });
        }

        let finalFormats = Array.from(formatMap.values());

        // Sıralama Mantığı
        finalFormats.sort((a, b) => {
            const getRes = (q) => parseInt(q.split(' ')[2] || '0');
            const resA = getRes(a.quality);
            const resB = getRes(b.quality);
            return resB - resA;
        });

        res.json({
            title: info.videoDetails.title,
            thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
            formats: finalFormats
        });

    } catch (error) {
        console.error("Bilgi alınırken hata:", error);
        res.status(500).json({ error: 'Video bilgileri alınırken bir hata oluştu.' });
    }
});


// İndirme Endpoint'i
app.get('/api/download', async (req, res) => {
    const timestamp = Date.now();
    const videoPath = path.join(tempDir, `video-${timestamp}.mp4`);
    const audioPath = path.join(tempDir, `audio-${timestamp}.mp4`);
    let finalPath = '';

    const cleanupFiles = () => {
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        if (finalPath && fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    };

    try {
        const { url, itag, type } = req.query;

        if (!url || !ytdl.validateURL(url)) throw new Error('Geçersiz URL');
        
        const info = await ytdl.getInfo(url);
        const sanitizedTitle = info.videoDetails.title.replace(/[<>:"/\\|?*]+/g, '-');

        if (type === 'MP4-MERGED') {
            const videoFormat = ytdl.chooseFormat(info.formats, { quality: itag });
            const audioFormat = ytdl.chooseFormat(info.formats, { filter: 'audioonly', quality: 'highestaudio' });
            
            await new Promise((resolve, reject) => ytdl(url, { format: videoFormat }).pipe(fs.createWriteStream(videoPath)).on('finish', resolve).on('error', reject));
            await new Promise((resolve, reject) => ytdl(url, { format: audioFormat }).pipe(fs.createWriteStream(audioPath)).on('finish', resolve).on('error', reject));

            finalPath = path.join(tempDir, `final-${timestamp}.mp4`);
            await new Promise((resolve, reject) => {
                ffmpeg().addInput(videoPath).addInput(audioPath).videoCodec('copy').audioCodec('aac').save(finalPath)
                    .on('end', resolve).on('error', reject);
            });

            res.download(finalPath, `${sanitizedTitle}.mp4`, (err) => {
                if (err) console.error("Gönderim hatası:", err);
                cleanupFiles();
            });

        } else if (type === 'MP3') {
            res.header('Content-Disposition', `attachment; filename="${sanitizedTitle}.mp3"`);
            const audioStream = ytdl(url, { quality: itag });
            ffmpeg(audioStream).audioBitrate(128).format('mp3').pipe(res, { end: true });

        } else { // Normal MP4
            res.header('Content-Disposition', `attachment; filename="${sanitizedTitle}.mp4"`);
            ytdl(url, { quality: itag }).pipe(res);
        }

    } catch (error) {
        console.error("İndirme hatası:", error);
        cleanupFiles();
        if (!res.headersSent) {
            res.status(500).json({ error: 'İndirme sırasında bir hata oluştu.' });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde başarıyla başlatıldı.`);
});
