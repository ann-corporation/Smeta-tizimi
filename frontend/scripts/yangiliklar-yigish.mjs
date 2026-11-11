/* «Nima yangi» yozuvlari: har yangilik — frontend/yangiliklar/ ichida BITTA alohida fayl (global hisoblagich yo'q,
 * shuning uchun PR'lar o'zaro to'qnashmaydi). Build paytida shu fayllardan /yangiliklar.json yig'iladi (vite plugin).
 *
 * Fayl nomi:  YYYYMMDD-slug.json  yoki  YYYYMMDD-HHMM-slug.json  (bir kunda bir nechta bo'lsa vaqt qo'shing)
 * Fayl ichi:  { "sana": "2026-11-12", "sarlavha": "...", "bandlar": ["...", "..."] }
 * id:         faylda "id" bo'lsa (eski, ko'chirilgan yozuvlar 1..155) o'sha; bo'lmasa YYYYMMDD*10000 + HHMM.
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
  const korilgan = new Map();
  for (const y of yozuvlar) {
    if (korilgan.has(y.id)) throw new Error(`yangiliklar: id ${y.id} takrorlanadi (${korilgan.get(y.id)} va ${y._fayl}) — fayl nomiga HHMM qo'shing`);
    korilgan.set(y.id, y._fayl);
  }
  yozuvlar.sort((a, b) => b.id - a.id);
  return {
    izoh: "Avtomatik yig'ilgan (frontend/yangiliklar/*.json). Qo'lda tahrirlamang. Eng yangisi tepada.",
    yozuvlar: yozuvlar.map(({ _fayl, ...y }) => y),
  };
}
