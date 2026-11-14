/* «Nima yangi» yozuvlari: har yangilik — frontend/yangiliklar/ ichida BITTA alohida fayl (global hisoblagich yo'q,
 * shuning uchun PR'lar o'zaro to'qnashmaydi). Build paytida shu fayllardan /yangiliklar.json yig'iladi (vite plugin).
 *
 * Fayl nomi:  YYYYMMDD-slug.json  yoki  YYYYMMDD-HHMM-slug.json  (bir kunda bir nechta bo'lsa vaqt qo'shing; bir xil prefiks takrorlansa ham build yiqilmaydi)
 * Fayl ichi:  { "sana": "2026-11-12", "sarlavha": "...", "bandlar": ["...", "..."] }
 * id:         faylda "id" bo'lsa (eski, ko'chirilgan yozuvlar 1..155) o'sha; bo'lmasa YYYYMMDD*10000 + HHMM (bir xil bo'lsa nom tartibida +1, +2 ...).
 *             Brauzer «ko'rilgan» id ni raqam sifatida solishtiradi — yangi id lar eskilardan doim katta. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const NOM = /^(\d{8})(?:-(\d{4}))?-([a-z0-9][a-z0-9-]*)\.json$/;

export function yangilikFayllari(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

/** @returns {{izoh: string, yozuvlar: Array<{id:number,sana:string,sarlavha:string,bandlar:string[]}>}} id kamayish tartibida */
export function yangiliklarniYig(dir) {
  const yozuvlar = [];
  for (const f of yangilikFayllari(dir)) {
    const m = NOM.exec(f);
    if (!m) throw new Error(`yangiliklar/${f}: fayl nomi YYYYMMDD[-HHMM]-slug.json bo'lishi kerak`);
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const id = Number.isSafeInteger(j.id) ? j.id : Number(m[1]) * 10000 + Number(m[2] ?? 0);
    yozuvlar.push({ id, sana: String(j.sana ?? ''), sarlavha: j.sarlavha, bandlar: j.bandlar, _fayl: f });
  }
  /* Bir xil vaqt prefiksi (YYYYMMDD-HHMM) bilan bir necha fayl kirsa (parallel PR'lar) build YIQILMAYDI: ular nom bo'yicha
     barqaror tartibda tartiblanib, id lari bitta-bittadan oshiriladi (id faqat tartib va «ko'rilgan» belgisi uchun).
     Eski id formati (YYYYMMDD*10000+HHMM) saqlanadi — brauzerdagi ko'rilgan belgi buzilmaydi. */
  yozuvlar.sort((a, b) => a.id - b.id || (a._fayl < b._fayl ? -1 : a._fayl > b._fayl ? 1 : 0));
  let oxirgi = -Infinity;
  for (const y of yozuvlar) { if (y.id <= oxirgi) y.id = oxirgi + 1; oxirgi = y.id; }  yozuvlar.sort((a, b) => b.id - a.id);
  return {
    izoh: "Avtomatik yig'ilgan (frontend/yangiliklar/*.json). Qo'lda tahrirlamang. Eng yangisi tepada.",
    yozuvlar: yozuvlar.map(({ _fayl, ...y }) => y),
  };
}
