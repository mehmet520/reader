/* sw.js — cevrimdisi calisma: uygulama dosyalari onbellekten gelir, arka planda yenilenir (Kelime Karti'ndaki gibi).
   Okuma dosyalari burada degil, IndexedDB'de durur. Uygulama degisince ONBELLEK surumunu artir. */
// Onbellegin adi; app.js ya da index.html degisince surum artirilir, yeni sw.js eski onbellegi siler.
const ONBELLEK = 'reader-v1.2.1'
// Cevrimdisi da acilmasi gereken uygulama dosyalari (okuma dosyalari degil)
const DOSYALAR = ['./', 'index.html', 'app.js']

// install: yeni surum ilk kez yuklenince DOSYALAR onbellege konur; skipWaiting eski surumun kapanmasini beklemez.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(ONBELLEK).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting()))
})
// activate: adi ONBELLEK olmayan eski onbellekleri siler; clients.claim acik sayfalari hemen bu surume baglar.
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== ONBELLEK).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()))
})
// fetch: sayfanin yaptigi her istek buradan gecer.
self.addEventListener('fetch', (e) => {
  const r = e.request
  // ?src= ile indirilen okuma dosyasi (cache: 'no-store') onbellege girmez; IndexedDB'de saklanir
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin || r.cache === 'no-store') return
  // once onbellek, arka planda ag (stale-while-revalidate); ?f=<ad> adresi de index.html'den gelir (ignoreSearch)
  e.respondWith(caches.open(ONBELLEK).then(async (c) => {
    const eski = await c.match(r, { ignoreSearch: true })
    const ag = fetch(r).then((y) => { if (y && y.ok) c.put(r, y.clone()); return y }).catch(() => eski)
    return eski || ag
  }))
})
