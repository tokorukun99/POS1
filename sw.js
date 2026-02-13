// =============================================
// SERVICE WORKER — POS Kasir Toko Rukun
// Versi: 1.0.0
// =============================================
// Ganti CACHE_VERSION setiap kali ada update
// agar cache lama otomatis terhapus.

const CACHE_VERSION  = 'pos-kasir-v1';
const CACHE_STATIC   = `${CACHE_VERSION}-static`;
const CACHE_FONTS    = `${CACHE_VERSION}-fonts`;

// File-file yang di-cache saat install (App Shell)
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    // Ikon — pastikan folder icons/ ada dengan ukuran berikut
    './icons/icon-192.png',
    './icons/icon-512.png',
];

// CDN libraries yang di-cache saat pertama kali diakses
const CDN_ORIGINS = [
    'https://cdnjs.cloudflare.com',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
];

// =============================================
// INSTALL — cache semua static assets
// =============================================
self.addEventListener('install', event => {
    console.log('[SW] Install:', CACHE_VERSION);
    event.waitUntil(
        caches.open(CACHE_STATIC).then(cache => {
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[SW] Gagal cache beberapa file:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// =============================================
// ACTIVATE — hapus cache versi lama
// =============================================
self.addEventListener('activate', event => {
    console.log('[SW] Activate:', CACHE_VERSION);
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key.startsWith('pos-kasir-') && !key.startsWith(CACHE_VERSION))
                    .map(key => {
                        console.log('[SW] Hapus cache lama:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// =============================================
// FETCH — strategi cache per jenis request
// =============================================
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET dan chrome-extension
    if (event.request.method !== 'GET') return;
    if (url.protocol === 'chrome-extension:') return;

    // ---- Google Fonts: Cache First ----
    if (url.origin === 'https://fonts.googleapis.com' ||
        url.origin === 'https://fonts.gstatic.com') {
        event.respondWith(cacheFirst(event.request, CACHE_FONTS));
        return;
    }

    // ---- CDN Libraries: Stale While Revalidate ----
    if (CDN_ORIGINS.some(o => url.origin === o)) {
        event.respondWith(staleWhileRevalidate(event.request, CACHE_STATIC));
        return;
    }

    // ---- App Shell (index.html & assets): Network First ----
    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(event.request, CACHE_STATIC));
        return;
    }
});

// =============================================
// STRATEGI CACHE
// =============================================

/** Cache First: kembalikan dari cache, fallback ke network */
async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Offline - Resource tidak tersedia', { status: 503 });
    }
}

/** Network First: coba network dulu, fallback ke cache */
async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Jika index.html tidak tersedia, kembalikan halaman offline sederhana
        if (request.mode === 'navigate') {
            const indexCache = await caches.match('./index.html');
            if (indexCache) return indexCache;
        }
        return new Response(offlinePage(), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }
}

/** Stale While Revalidate: kembalikan cache langsung, update di background */
async function staleWhileRevalidate(request, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(request);

    const fetchPromise = fetch(request).then(response => {
        if (response && response.status === 200) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => cached);

    return cached || fetchPromise;
}

// =============================================
// HALAMAN OFFLINE FALLBACK
// =============================================
function offlinePage() {
    return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Offline — POS Kasir</title>
    <style>
        body {
            font-family: sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg,#667eea,#764ba2);
            color: white;
            text-align: center;
            padding: 20px;
        }
        .box { background:rgba(255,255,255,0.15); padding:40px; border-radius:20px; max-width:400px; }
        h1 { font-size: 48px; margin:0 0 16px; }
        h2 { margin:0 0 12px; font-size:22px; }
        p  { opacity:0.85; line-height:1.6; }
        button {
            margin-top:24px;
            padding:14px 32px;
            background:#FF6B35;
            border:none;
            border-radius:10px;
            color:white;
            font-size:16px;
            font-weight:700;
            cursor:pointer;
        }
    </style>
</head>
<body>
    <div class="box">
        <h1>📡</h1>
        <h2>Tidak Ada Koneksi</h2>
        <p>Perangkat sedang offline.<br>
        Sambungkan ke internet lalu coba lagi.</p>
        <button onclick="location.reload()">🔄 Coba Lagi</button>
    </div>
</body>
</html>`;
}

// =============================================
// BACKGROUND SYNC (opsional — untuk masa depan)
// =============================================
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_VERSION });
    }
});
