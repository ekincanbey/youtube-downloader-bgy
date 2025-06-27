// Gerekli kütüphaneleri içeri aktarıyoruz
const express = require('express');
const cors = require('cors');
const play = require('play-dl'); // Güçlü motorumuz
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

// FFmpeg'in yolunu ayarlıyoruz
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// --- NİHAİ ÇÖZÜM: COOKIE DOSYASI İLE GİRİŞ YAPMA ---
// Bu kod, projenin ana dizininde bir 'cookies.txt' dosyası arar.
// Eğer dosya varsa, play-dl bu cookie'leri kullanarak YouTube'a giriş yapar.
const cookiePath = path.join(__dirname, 'cookies.txt');
if (fs.existsSync(cookiePath)) {
    console.log("'cookies.txt' dosyası bulundu. YouTube'a giriş yapılıyor...");
    play.setToken({
        youtube: {
            cookie: fs.readFileSync(cookiePath, 'utf-8')
        }
    }).then(() => {
        console.log("Cookie ile YouTube'a başarıyla giriş yapıldı.");
    }).catch(e => {
        console.error("Cookie ile giriş yapılamadı:", e.message);
    });
} else {
    // Eğer cookie dosyası yoksa, bir uyarı ver.
    console.warn("UYARI: 'cookies.txt' dosyası bulunamadı. YouTube engellemeleriyle karşılaşılabilir.");
}
// --- NİHAİ ÇÖZÜM SONU ---


app.get('/', (req, res) => {
    res.send('YouTube İndirici Backend Sunucusu başarıyla çalışıyor!');
});

app.get('/api/info', async (req, res) => {
    try {
        const videoURL = req.query.url;
        if (!videoURL || !play.yt_validate(videoURL)) {
            return res.status(400).json({ error: 'Geçersiz veya eksik YouTube URLsi.' });
        }

        const info = await play.video_info(videoURL);
        const formatMap = new Map();

        info.formats.forEach(f => {
            const hasVideo = f.mimeType.includes('video');
            const hasAudio = f.mimeType.includes('audio');
            
            if (hasVideo && hasAudio) {
                const qualityLabel = `MP4 - ${f.qualityLabel}`;
                if (!formatMap.has(qualityLabel)) {
                    formatMap.set(qualityLabel, { itag: f.itag, quality: qualityLabel, type: 'MP4' });
                }
            } else if (hasAudio && !hasVideo) {
                const qualityLabel = `MP3 - ~${Math.round(f.bitrate / 1000)} kbps`;
                 if (!formatMap.has(qualityLabel)) {
                    formatMap.set(qualityLabel, { itag: f.itag, quality: qualityLabel, type: 'MP3' });
                }
            } else if (hasVideo && !hasAudio) {
                const qualityLabel = `MP4 - ${f.qualityLabel} (Sesli Birleştirilmiş)`;
                if (!formatMap.has(qualityLabel)) {
                    formatMap.set(qualityLabel, { itag: f.itag, quality: qualityLabel, type: 'MP4-MERGED' });
                }
            }
        });

        let finalFormats = Array.from(formatMap.values());
        finalFormats.sort((a, b) => {
            const getRes = (q) => parseInt(q.match(/\d+p|\d+\s*kbps/)?.[0] || '0');
            return getRes(b.quality) - getRes(a.quality);
        });

        res.json({
            title: info.video_details.title,
            thumbnail: info.video_details.thumbnails[0].url,
            formats: finalFormats
        });

    } catch (error) {
        console.error("Bilgi alınırken hata:", error.message);
        res.status(500).json({ error: 'Video bilgileri alınamadı. YouTube bu isteği engellemiş olabilir.' });
    }
});

app.get('/api/download', async (req, res) => {
    const timestamp = Date.now();
    const videoPath = path.join(tempDir, `video-${timestamp}.mp4`);
    const audioPath = path.join(tempDir, `audio-${timestamp}.m4a`);
    let finalPath = '';

    const cleanup = () => {
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        if (finalPath && fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    };

    try {
        const { url, itag, type } = req.query;
        if (!url || !play.yt_validate(url)) throw new Error('Geçersiz URL');
        
        const sanitizedTitle = (await play.video_info(url)).video_details.title.replace(/[<>:"/\\|?*]+/g, '-');
        const streamOptions = { quality: parseInt(itag) };

        if (type === 'MP4-MERGED') {
            const videoStream = await play.stream(url, { quality: parseInt(itag) });
            const audioStream = await play.stream(url, { quality: 'highestaudio' });

            await new Promise((resolve, reject) => videoStream.stream.pipe(fs.createWriteStream(videoPath)).on('finish', resolve).on('error', reject));
            await new Promise((resolve, reject) => audioStream.stream.pipe(fs.createWriteStream(audioPath)).on('finish', resolve).on('error', reject));
            
            finalPath = path.join(tempDir, `final-${timestamp}.mp4`);
            await new Promise((resolve, reject) => {
                ffmpeg().addInput(videoPath).addInput(audioPath).videoCodec('copy').audioCodec('aac').save(finalPath)
                .on('end', resolve).on('error', reject);
            });
            
            res.download(finalPath, `${sanitizedTitle}.mp4`, (err) => {
                if (err) console.error("Gönderim hatası:", err);
                cleanup();
            });

        } else if (type === 'MP3') {
            res.header('Content-Disposition', `attachment; filename="${sanitizedTitle}.mp3"`);
            const stream = await play.stream(url, streamOptions);
            ffmpeg(stream.stream).audioBitrate(128).format('mp3').pipe(res);

        } else { // Normal MP4
            res.header('Content-Disposition', `attachment; filename="${sanitizedTitle}.mp4"`);
            const stream = await play.stream(url, streamOptions);
            stream.stream.pipe(res);
        }

    } catch (error) {
        console.error("İndirme hatası:", error.message);
        cleanup();
        if (!res.headersSent) {
            res.status(500).json({ error: 'İndirme sırasında bir hata oluştu.' });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde başarıyla başlatıldı.`);
});
