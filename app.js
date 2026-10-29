/* Okuyucu: secilen okuma dosyasini (build_reader.py ciktisi) cihazda saklar (IndexedDB) ve bu adreste acar.
   Dosya ayni kokene (origin) yazildigi icin localStorage calisir: okundu isaretleri, okuma yeri ve ⚑ kalici olur.
   Okuma dosyasi depo anahtarini adresteki ?f=<dosya adi>'ndan alir (reader_page.py, FK).
   Hepsi bir fonksiyonun icinde: document.write ayni global'i kullanir, okuma dosyasinin const'lariyla carpismasin. */
(() => {
  const DB = 'reader-files', ST = 'files'

  const open = () => new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'name' })
    r.onsuccess = () => ok(r.result)
    r.onerror = () => no(r.error)
  })
  async function tx(mode, fn) {
    const d = await open()
    return new Promise((ok, no) => {
      const t = d.transaction(ST, mode), r = fn(t.objectStore(ST))
      t.oncomplete = () => ok(r && r.result)
      t.onerror = () => no(t.error)
    })
  }
  const put = (f) => tx('readwrite', (s) => s.put(f))
  const get = (n) => tx('readonly', (s) => s.get(n))
  const all = () => tx('readonly', (s) => s.getAll())
  const del = (n) => tx('readwrite', (s) => s.delete(n))

  const $ = (id) => document.getElementById(id)
  const msg = (t) => { $('msg').textContent = t || '' }
  const isReader = (t) => /id="tools"/.test(t) && /<article/.test(t)
  const prefix = (name) => 'f:' + location.pathname + name + ':'

  // Okuma dosyasinin menusune (#tools) "dosya listesine don" baglantisi; menu yoksa sol altta sabit dugme
  const BACK = '<script>(function(){function add(){var t=document.getElementById("tools"),a=document.createElement("a");' +
    'a.href=location.pathname;a.textContent="📂 Other files";a.id="reader-back";' +
    'a.setAttribute("style",t?"display:block;padding:6px 0":"position:fixed;left:8px;bottom:8px;z-index:99;background:#fff;color:#222;padding:6px 10px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.2)");' +
    '(t||document.body).appendChild(a)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",add):add()})()<\/script>'

  async function show(name) {
    const f = await get(name)
    if (!f) { history.replaceState(null, '', location.pathname); msg('File not found on this device: ' + name); return list() }
    f.opened = Date.now()
    await put(f)
    history.replaceState(null, '', location.pathname + '?f=' + encodeURIComponent(name))
    const i = f.text.search(/<\/body>\s*<\/html>\s*$/i)
    const html = i < 0 ? f.text + BACK : f.text.slice(0, i) + BACK + f.text.slice(i)
    document.open(); document.write(html); document.close()
  }

  async function list() {
    const files = (await all()).sort((a, b) => b.opened - a.opened)
    $('empty').hidden = files.length > 0
    $('list').replaceChildren(...files.map((f) => {
      const li = document.createElement('li'), a = document.createElement('a'), b = document.createElement('button')
      a.href = '?f=' + encodeURIComponent(f.name)
      a.textContent = f.title || f.name
      const s = document.createElement('span')
      s.className = 'muted'
      s.textContent = `${f.name} · ${Math.round(f.size / 1024)} KB · ${new Date(f.opened).toLocaleDateString()}`
      a.append(s)
      b.textContent = 'Remove'
      b.onclick = async () => {
        if (!confirm(`Remove “${f.title || f.name}” from this device? Read marks and flags are removed too.`)) return
        await del(f.name)
        try { Object.keys(localStorage).filter((k) => k.startsWith(prefix(f.name))).forEach((k) => localStorage.removeItem(k)) } catch {}
        list()
      }
      li.append(a, b)
      return li
    }))
  }

  // Ayni adla gelen dosya eskisinin yerine gecer (kullanici karari 29.10.2026; "ad 2.html" kopyasi geri alindi): okuma yeri, ayarlar ve ⚑
  // isaretleri dosya adina bagli, ayni ad altinda korunur. Icerik ayniysa yalniz acilir. Secim kutusu her durumda sifirlanir: bir hatadan
  // sonra ayni dosya yeniden secilince change olayi gelmiyordu.
  $('pick').addEventListener('change', async (e) => {
    msg()
    const picked = [...e.target.files], ok = [], notes = []
    try {
      for (const file of picked) {
        const text = await file.text()
        if (!isReader(text)) { notes.push('Not a reading file: ' + file.name); continue }
        const title = (text.match(/<title>([^<]*)<\/title>/i) || [])[1], old = await get(file.name)
        if (!old || old.text !== text) {
          await put({ name: file.name, title: title && title.replace(/&amp;/g, '&'), text, size: file.size, added: Date.now(), opened: Date.now() })
          if (old) notes.push('Replaced the stored copy: ' + file.name)
        }
        ok.push(file.name)
      }
    } catch (err) { notes.push('Could not open: ' + (err && err.message || err)) } finally { e.target.value = '' }
    msg(notes.join(' · '))
    if (ok.length === 1 && picked.length === 1) return show(ok[0])
    list()
  })

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {})
  const f = new URLSearchParams(location.search).get('f')
  f ? show(f) : list()
})()
