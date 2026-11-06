/* Okuyucu: secilen okuma dosyasini (build_reader.py ciktisi) cihazda saklar (IndexedDB) ve bu adreste acar.
   Dosya ayni kokene (origin) yazildigi icin localStorage calisir: okundu isaretleri, okuma yeri ve ⚑ kalici olur.
   Okuma dosyasi depo anahtarini adresteki ?f=<dosya adi>'ndan alir (reader_page.py, FK).
   ?src=<ayni kokende bir okuma dosyasi> (ÖNERİ-64, 04.11.2026): dosyayi indirir, cihazda saklar ve acar; boylece yayinlanan bir dosya
   (books/) tek bir baglantiyla kutuphaneye girer. Ag yoksa saklanan kopya acilir; icerik degistiyse eskisinin yerine gecer.
   Hepsi bir fonksiyonun icinde: document.write ayni global'i kullanir, okuma dosyasinin const'lariyla carpismasin.
   Bolumler (sirayla): 1 arayuz dili · 2 IndexedDB katmani · 3 yardimcilar · 4 show: dosyayi acar · 5 list: kutuphane listesi
   · 6 "+ Open file" · 7 fromSrc: ?src= baglantisi · 8 baslangic (adrese gore ne yapilacagi). */
(() => {
  // IndexedDB veritabaninin ve icindeki deponun adi (tarayicida DevTools > Application > IndexedDB altinda gorunur)
  const DB = "reader-files",
    ST = "files";

  // ===== 1. Arayuz dili =====
  // Arayuz dili (ÖNERİ-54, 56; 03.11.2026): okuma dosyalariyla ayni ayar (localStorage uiLang; ayni koken), varsayilan tarayicinin dili
  // UI: Ingilizce metin -> [Turkce, Almanca]. Burada karsiligi olmayan metin Ingilizce kalir.
  const UI = {
    "Interface language": ["Arayüz dili", "Oberflächensprache"],
    "Language of menus, buttons and messages": [
      "Menülerin, düğmelerin ve iletilerin dili",
      "Sprache der Menüs, Schaltflächen und Meldungen",
    ],
    "Opens reading files (HTML) made by the html-okuma-dosyasi tool. Files stay on this device; nothing is uploaded.":
      [
        "html-okuma-dosyasi aracının ürettiği okuma dosyalarını (HTML) açar. Dosyalar bu cihazda kalır; hiçbir şey yüklenmez.",
        "Öffnet Lesedateien (HTML), die das Werkzeug html-okuma-dosyasi erstellt. Die Dateien bleiben auf diesem Gerät; nichts wird hochgeladen.",
      ],
    "＋ Open file": ["＋ Dosya aç", "＋ Datei öffnen"],
    "No files yet. Download a reading file, then open it here. It is kept here for next time, with your read marks and flags.":
      [
        "Henüz dosya yok. Bir okuma dosyası indirin, sonra burada açın. Dosya, okundu ve çeviri işaretleriyle birlikte bir dahaki sefer için burada saklanır.",
        "Noch keine Dateien. Laden Sie eine Lesedatei herunter und öffnen Sie sie hier. Sie bleibt mit Ihren Lese- und Übersetzungsmarkierungen für das nächste Mal gespeichert.",
      ],
    "File not found on this device: {n}": [
      "Bu cihazda dosya bulunamadı: {n}",
      "Datei auf diesem Gerät nicht gefunden: {n}",
    ],
    Remove: ["Kaldır", "Entfernen"],
    "Remove “{t}” from this device? Read marks and flags are removed too.": [
      "“{t}” bu cihazdan kaldırılsın mı? Okundu ve çeviri işaretleri de silinir.",
      "„{t}“ von diesem Gerät entfernen? Lese- und Übersetzungsmarkierungen werden ebenfalls entfernt.",
    ],
    "Not a reading file: {n}": [
      "Okuma dosyası değil: {n}",
      "Keine Lesedatei: {n}",
    ],
    "Replaced the stored copy: {n}": [
      "Saklanan kopyanın yerine geçti: {n}",
      "Gespeicherte Kopie ersetzt: {n}",
    ],
    "Could not open: {e}": [
      "Açılamadı: {e}",
      "Konnte nicht geöffnet werden: {e}",
    ],
    "📂 Other files": ["📂 Öteki dosyalar", "📂 Andere Dateien"],
  };
  // UIL: kullanilacak dil. Once kayitli secim (uiLang), yoksa tarayicinin dili (tr/de), o da yoksa en.
  // try: gizli pencerede localStorage hata verebilir; o zaman kayitli secim yok sayilir.
  const UIL = (() => {
    let s = null;
    try {
      s = localStorage.getItem("uiLang");
    } catch {}
    if (s === "en" || s === "tr" || s === "de") return s;
    const n = (navigator.language || "").slice(0, 2).toLowerCase();
    return n === "tr" || n === "de" ? n : "en";
  })();
  // T("metin {n}", {n: ...}): metni secili dile cevirir, {n} gibi yer tutuculari doldurur.
  const T = (s, o) => {
    let r = UIL !== "en" && UI[s] ? UI[s][UIL === "tr" ? 0 : 1] : s;
    if (o) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
    return r;
  };
  // index.html'de data-t isaretli ogelerin metni cevrilir (data-t bossa ogenin kendi metni anahtar olur).
  document.querySelectorAll("[data-t]").forEach((e) => {
    e.textContent = T(e.dataset.t || e.textContent.trim());
  });
  // 🌐 dil secimi: yeni dil kaydedilir ve sayfa yeniden yuklenir; metinler yukaridaki adimlarla yeni dilde kurulur.
  {
    const s = document.getElementById("uil");
    s.title = T(s.title);
    s.value = UIL;
    s.addEventListener("change", () => {
      try {
        localStorage.setItem("uiLang", s.value);
      } catch {}
      location.reload();
    });
  }

  // ===== 2. IndexedDB katmani: dosyalarin cihazda saklandigi veritabani =====
  // Her kayit: {name, title, text (HTML'in tamami), size, added, opened}. Anahtar name (dosya adi): ayni ad = ayni kayit.
  // open: veritabanini acar; ilk acilista (surum 1) "files" deposunu kurar.
  const open = () =>
    new Promise((ok, no) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () =>
        r.result.createObjectStore(ST, { keyPath: "name" });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    });
  // tx: her okuma ve yazma işlemini bir transaction (işlem – Transaktion) içinde yapar: fn'e depoyu verir, işlem bitince
  // sonucu döndürür. mode: "readonly" ya da "readwrite".
  async function tx(mode, fn) {
    const d = await open();
    return new Promise((ok, no) => {
      const t = d.transaction(ST, mode),
        r = fn(t.objectStore(ST));
      t.oncomplete = () => ok(r && r.result);
      t.onerror = () => no(t.error);
    });
  }
  // Kodun geri kalani veritabanini yalniz bu dort islevle kullanir: kaydet, oku, hepsini oku, sil.
  const put = (f) => tx("readwrite", (s) => s.put(f));
  const get = (n) => tx("readonly", (s) => s.get(n));
  const all = () => tx("readonly", (s) => s.getAll());
  const del = (n) => tx("readwrite", (s) => s.delete(n));

  // ===== 3. Yardimcilar =====
  // $: id ile oge bulur · msg: #msg satirina ileti yazar (bos cagrilirsa siler)
  const $ = (id) => document.getElementById(id);
  const msg = (t) => {
    $("msg").textContent = t || "";
  };
  // isReader: metin bir okuma dosyasi mi (menu id="tools" ve <article> var mi); rastgele bir HTML kabul edilmez.
  const isReader = (t) => /id="tools"/.test(t) && /<article/.test(t);
  // prefix: okuma dosyasinin localStorage anahtarlarinin basi, ornegin f:/reader/umre-rehberi.html: (reader_page.py ayni
  // bicimi kullanir). Remove bu onekle baslayan kayitlari siler.
  const prefix = (name) => "f:" + location.pathname + name + ":";

  // Okuma dosyasinin menusune (#tools) "dosya listesine don" baglantisi; menu yoksa sol altta sabit dugme
  const BACK =
    '<script>(function(){function add(){var t=document.getElementById("tools"),a=document.createElement("a");' +
    "a.href=location.pathname;a.textContent=" +
    JSON.stringify(T("📂 Other files")) +
    ';a.id="reader-back";' +
    'a.setAttribute("style",t?"display:block;padding:6px 0":"position:fixed;left:8px;bottom:8px;z-index:99;background:#fff;color:#222;padding:6px 10px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.2)");' +
    '(t||document.body).appendChild(a)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",add):add()})()<\/script>';

  // ===== 4. show: saklanan dosyayi acar =====
  // Dosyayi veritabanindan alir, acilma zamanini yazar, adrese ?f=<ad> koyar (sayfa yenilenince ayni dosya acilir), sonuna
  // BACK'i ekler ve document.open/write/close ile bu sayfanin yerine yazar. Ayni adreste kaldigi icin dosyanin
  // localStorage kayitlari (okundu isaretleri, okuma yeri, ⚑) bu sitede kalici olur. Dosya yoksa ileti ve liste.
  async function show(name) {
    const f = await get(name);
    if (!f) {
      history.replaceState(null, "", location.pathname);
      msg(T("File not found on this device: {n}", { n: name }));
      return list();
    }
    f.opened = Date.now();
    await put(f);
    history.replaceState(
      null,
      "",
      location.pathname + "?f=" + encodeURIComponent(name),
    );
    const i = f.text.search(/<\/body>\s*<\/html>\s*$/i);
    const html =
      i < 0 ? f.text + BACK : f.text.slice(0, i) + BACK + f.text.slice(i);
    document.open();
    document.write(html);
    document.close();
  }

  // ===== 5. list: kutuphane listesi =====
  // Saklanan dosyalari son acilana gore siralar. Her satir: baglanti (?f=<ad>) ile baslik, altinda ad · KB · son acilis,
  // yaninda Remove. Remove onay sorar, kaydi ve dosyanin localStorage kayitlarini siler. Liste bossa #empty gorunur.
  async function list() {
    const files = (await all()).sort((a, b) => b.opened - a.opened);
    $("empty").hidden = files.length > 0;
    $("list").replaceChildren(
      ...files.map((f) => {
        const li = document.createElement("li"),
          a = document.createElement("a"),
          b = document.createElement("button");
        a.href = "?f=" + encodeURIComponent(f.name);
        a.textContent = f.title || f.name;
        const s = document.createElement("span");
        s.className = "muted";
        s.textContent = `${f.name} · ${Math.round(f.size / 1024)} KB · ${new Date(f.opened).toLocaleDateString(UIL)}`;
        a.append(s);
        b.textContent = T("Remove");
        b.onclick = async () => {
          if (
            !confirm(
              T(
                "Remove “{t}” from this device? Read marks and flags are removed too.",
                { t: f.title || f.name },
              ),
            )
          )
            return;
          await del(f.name);
          try {
            Object.keys(localStorage)
              .filter((k) => k.startsWith(prefix(f.name)))
              .forEach((k) => localStorage.removeItem(k));
          } catch {}
          list();
        };
        li.append(a, b);
        return li;
      }),
    );
  }

  // ===== 6. "+ Open file": cihazdan dosya secmek =====
  // Her dosya okunur; okuma dosyasi degilse not edilip atlanir, basligi <title>'dan alinir ve kaydedilir.
  // Tek dosya secildiyse hemen acilir, birden coksa liste gosterilir.
  // Ayni adla gelen dosya eskisinin yerine gecer (kullanici karari 29.10.2026; "ad 2.html" kopyasi geri alindi): okuma yeri, ayarlar ve ⚑
  // isaretleri dosya adina bagli, ayni ad altinda korunur. Icerik ayniysa yalniz acilir.
  // finally içinde seçim kutusu sıfırlanır (e.target.value = "").
  // Yoksa aynı dosyayı ikinci kez seçtiğinizde tarayıcı "değişmedi" sayar ve hiçbir şey olmaz.
  $("pick").addEventListener("change", async (e) => {
    msg();
    const picked = [...e.target.files],
      ok = [],
      notes = [];
    try {
      for (const file of picked) {
        const text = await file.text();
        if (!isReader(text)) {
          notes.push(T("Not a reading file: {n}", { n: file.name }));
          continue;
        }
        const title = (text.match(/<title>([^<]*)<\/title>/i) || [])[1],
          old = await get(file.name);
        if (!old || old.text !== text) {
          await put({
            name: file.name,
            title: title && title.replace(/&amp;/g, "&"),
            text,
            size: file.size,
            added: Date.now(),
            opened: Date.now(),
          });
          if (old)
            notes.push(T("Replaced the stored copy: {n}", { n: file.name }));
        }
        ok.push(file.name);
      }
    } catch (err) {
      notes.push(T("Could not open: {e}", { e: (err && err.message) || err }));
    } finally {
      e.target.value = "";
    }
    msg(notes.join(" · "));
    if (ok.length === 1 && picked.length === 1) return show(ok[0]);
    list();
  });

  // ===== 7. fromSrc: ?src=books/<ad>.html baglantisi =====
  // Yalniz ayni siteden (origin) dosya alir. Tarayici onbellegini atlayarak (no-store) her seferinde sunucudan indirir;
  // ag yoksa ya da indirme basarisizsa saklanan kopyayi acar. Yeni ya da degismis icerigi kaydeder (ilk ekleme tarihi
  // korunur), sonra show ile acar. Yayindaki dosya guncellenince cihaz yeni surumu boylece alir.
  async function fromSrc(src) {
    const u = new URL(src, location.href),
      name = decodeURIComponent(u.pathname.split("/").pop());
    if (u.origin !== location.origin || !name) {
      msg(T("Could not open: {e}", { e: src }));
      return list();
    }
    const old = await get(name);
    let text;
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      text = await r.text();
    } catch (err) {
      if (old) return show(name);
      msg(T("Could not open: {e}", { e: (err && err.message) || err }));
      return list();
    }
    if (!isReader(text)) {
      msg(T("Not a reading file: {n}", { n: name }));
      return list();
    }
    if (!old || old.text !== text) {
      const title = (text.match(/<title>([^<]*)<\/title>/i) || [])[1];
      await put({
        name,
        title: title && title.replace(/&amp;/g, "&"),
        text,
        size: new Blob([text]).size,
        added: old ? old.added : Date.now(),
        opened: Date.now(),
      });
    }
    return show(name);
  }

  // ===== 8. Baslangic =====
  // sw.js: uygulama dosyalarini onbellege alir; internet yokken de sayfa acilir.
  // Adrese gore: ?src= -> indir, sakla, ac · ?f= -> saklanani ac · hicbiri -> kutuphane listesi.
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js").catch(() => {});
  const q = new URLSearchParams(location.search),
    f = q.get("f"),
    src = q.get("src");
  src ? fromSrc(src) : f ? show(f) : list();
})();
