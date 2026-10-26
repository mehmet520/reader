/* sw.js — cevrimdisi calisma: uygulama dosyalari onbellekten gelir, arka planda yenilenir (Kelime Karti'ndaki gibi).
   Okuma dosyalari burada degil, IndexedDB'de durur. Uygulama degisince ONBELLEK surumunu artir. */
const ONBELLEK = 'reader-v1.0.0'
const DOSYALAR = ['./', 'index.html', 'app.js']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(ONBELLEK).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== ONBELLEK).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const r = e.request
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return
  // once onbellek, arka planda ag (stale-while-revalidate); ?f=<ad> adresi de index.html'den gelir (ignoreSearch)
  e.respondWith(caches.open(ONBELLEK).then(async (c) => {
    const eski = await c.match(r, { ignoreSearch: true })
    const ag = fetch(r).then((y) => { if (y && y.ok) c.put(r, y.clone()); return y }).catch(() => eski)
    return eski || ag
  }))
})
