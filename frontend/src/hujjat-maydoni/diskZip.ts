/**
 * diskZip.ts - Kompaniya diskidagi papkani (ichki papkalari bilan) ZIP qilish; ixtiyoriy "hamma ma'lumotlar" jadvallari (CSV/JSON) bilan.
 * Ilgari FaylMenejer da edi; endi Disk daraxtining o'zida (t2_hm_*): yo'l = papka zanjiri, nom to'qnashsa (#id) qo'shiladi, manifest.json bilan.
 */
import { strToU8, zipSync, type Zippable } from 'fflate';
import { hmBaytlar, hmRoyxat } from '../api/t2-hujjat-maydoni';
import { EKSPORT_JADVALLARI, jadvalHammasi } from '../api/t2-fayl';
import { csv, xavfsizNom } from '../lib/fayl-daraxt';

export const ZIP_MAX_FAYL = 2000;
const ZIP_MAX_CHUQURLIK = 12;

export type ZipNatija = { bytes: Uint8Array; nomi: string; soni: number; olinmagan: string[]; kesilgan: boolean };

type Navbat = { papkaId: number | null; yol: string; chuqurlik: number };

/** Papka daraxtini aylanib chiqadi (savatdagi fayllar kirmaydi). Hech qachon bitta xatoda to'xtamaydi: olinmaganlar manifestga yoziladi. */
export async function papkaZip(p: {
  kompaniyaId: number; papkaId: number | null; nom: string; malumot?: boolean; holat?: (s: string) => void; bekor?: () => boolean;
}): Promise<ZipNatija | null> {
  const z: Zippable = {}; const olinmagan: string[] = []; const manifest: Array<Record<string, unknown>> = [];
  const ishlatilgan = new Set<string>(); let soni = 0; let kesilgan = false;
  const navbat: Navbat[] = [{ papkaId: p.papkaId, yol: '', chuqurlik: 0 }];
  while (navbat.length) {
    if (p.bekor?.()) return null;
    const n = navbat.shift()!;
    const r = await hmRoyxat({ kompaniyaId: p.kompaniyaId, papkaId: n.papkaId });
    if (!r.ok) { olinmagan.push(`${n.yol || p.nom}: ${r.code}`); continue; }
    if (n.chuqurlik < ZIP_MAX_CHUQURLIK) for (const k of r.papkalar) navbat.push({ papkaId: k.id, yol: `${n.yol}${xavfsizNom(k.nom)}/`, chuqurlik: n.chuqurlik + 1 });
    for (const f of r.fayllar) {
      if (p.bekor?.()) return null;
      if (soni >= ZIP_MAX_FAYL) { kesilgan = true; break; }
      p.holat?.(`${soni + 1}`);
      const b = await hmBaytlar(f.id);
      if (!b) { olinmagan.push(`#${f.id} ${f.nom}`); continue; }
      let yol = `${n.yol}${xavfsizNom(f.nom)}`;
      if (ishlatilgan.has(yol.toLowerCase())) yol = `${n.yol}${xavfsizNom(f.nom)} (#${f.id})`;
      ishlatilgan.add(yol.toLowerCase());
      z[yol] = [b.bayt, { level: 0 }]; soni++;
      manifest.push({ id: f.id, yol, nom: f.nom, versiya: f.versiya, bayt: f.bayt, yangilandi: f.yangilandi, manba: f.manba_turi ?? null, kalit: f.hujjat_kalit ?? null });
    }
  }
  if (p.malumot) {
    for (const j of EKSPORT_JADVALLARI) {
      if (p.bekor?.()) return null;
      p.holat?.(j.nom);
      try {
        const q = await jadvalHammasi(j.jadval, p.kompaniyaId, j.ustunlar, j.versiya);
        z[`malumotlar/${j.nom}.csv`] = strToU8(csv(q)); z[`malumotlar/json/${j.nom}.json`] = strToU8(JSON.stringify(q));
      } catch { olinmagan.push(j.nom); }
    }
  }
  z['manifest.json'] = strToU8(JSON.stringify({ kompaniya_id: p.kompaniyaId, papka: p.nom, yaratildi: new Date().toISOString(), fayllar: manifest, olinmagan, kesilgan }, null, 1));
  z['manifest.csv'] = strToU8(csv(manifest));
  return { bytes: zipSync(z, { level: 6 }), nomi: `${xavfsizNom(p.nom)}_${new Date().toISOString().slice(0, 10)}.zip`, soni, olinmagan, kesilgan };
}