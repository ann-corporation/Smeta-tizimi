/**
 * «Oflayn uchun tayyorlash»: tanlangan obyektlarning ma'lumotini OCHMASDAN keshga yuklaydi. Sahifalar ishlatadigan
 * AYNI yuklagichlar chaqiriladi (daraxt+holat, narx nazorati, o'zgarish/avvalgi versiya, akt reestri, obyekt paketi),
 * shuning uchun so'rovlar sahifa so'rovlari bilan bir xil va oflayn ochilganda keshdan topiladi. Hammasi fetch qatlamidan
 * o'tadi — alohida yozish yo'li yo'q.
 */
import { oflaynKorinish } from './holat';

export type Yuklagich = { nom: string; yukla: (obyektId: number) => Promise<unknown> };
export type TayyorlaNatija = { tayyor: number[]; xato: { obyektId: number; nom: string }[] };

export async function sahifaYuklagichlari(): Promise<Yuklagich[]> {
  const [tr, pc, oz, ak] = await Promise.all([
    import('../oylik-hujjat/ostatka-slichitelniy'),
    import('../../api/t2-price-control'),
    import('../../api/t2-ozgarish'),
    import('../../api/supabase'),
  ]);
  return [
    { nom: 'daraxt', yukla: async (id) => { const r = await tr.daraxtVaHolatOl(id); if (!r.ok) throw new Error(r.xato); } },
    { nom: 'narx', yukla: (id) => pc.priceControlOl(id) },
    { nom: 'ozgarish', yukla: (id) => oz.ozgarishMalumotOl(id) },
    { nom: 'avvalgi', yukla: (id) => oz.avvalgiVersiyaOl(id) },
    { nom: 'reestr', yukla: async (id) => { const r = await ak.sbT2AktReestrOl(id); if (!r.ok) throw new Error(r.error ?? 'reestr'); } },
    // Paket tezkor yo'li ixtiyoriy (ruxsat/flag bo'lmasa 403/404): yiqilishi tayyorlashni buzmaydi.
    { nom: 'paket', yukla: async (id) => { const r = await fetch('/api/obyekt-paket?obyekt_id=' + id); await r.arrayBuffer(); } },
  ];
}

export async function oflaynUchunTayyorla(
  obyektIds: readonly number[],
  opts: { yuklagichlar?: Yuklagich[]; onProgress?: (bajarildi: number, jami: number) => void } = {},
): Promise<TayyorlaNatija> {
  // Oflayn paytda yuklagichlar keshdan javob olardi va «tayyor» deb yolg'on aytilardi.
  if (oflaynKorinish().oflayn || (typeof navigator !== 'undefined' && navigator.onLine === false)) throw new Error('OFLAYN_TAYYORLASH_ONLAYN_KERAK');
  const yuklagichlar = opts.yuklagichlar ?? await sahifaYuklagichlari();
  const natija: TayyorlaNatija = { tayyor: [], xato: [] };
  let b = 0;
  for (const id of obyektIds) {
    let buzildi = false;
    // Bir obyektning yuklagichlari ketma-ket (server/egress'ni bosmaslik uchun); biri yiqilsa qolgani davom etadi.
    for (const y of yuklagichlar) {
      try { await y.yukla(id); } catch { natija.xato.push({ obyektId: id, nom: y.nom }); buzildi = true; }
    }
    if (!buzildi) natija.tayyor.push(id);
    opts.onProgress?.(++b, obyektIds.length);
  }
  return natija;
}
