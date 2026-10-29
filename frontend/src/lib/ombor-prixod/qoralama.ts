import { prixodMiqdor, prixodSana } from './kitob';
import type { PrixodQator, PrixodXato } from './turlar';

export type PrixodMaydonlar = { sana: string; nom: string; birlik: string; miqdor: string; yetkazuvchi: string; hujjat: string };
export type PrixodQoralama = { manba: PrixodQator; maydonlar: PrixodMaydonlar; versiya: number; tasdiq: string | null };

export function prixodQoralama(q: PrixodQator): PrixodQoralama {
  return { manba: structuredClone(q), maydonlar: { sana: q.sana ?? '', nom: q.nom, birlik: q.birlik,
    miqdor: q.miqdor == null ? q.miqdorMatni : String(q.miqdor), yetkazuvchi: q.yetkazuvchi, hujjat: q.hujjat }, versiya: 1, tasdiq: null };
}

export function qoralamaTahrirla(q: PrixodQoralama, fields: Partial<PrixodMaydonlar>): PrixodQoralama {
  if (Object.entries(fields).every(([k,v]) => q.maydonlar[k as keyof PrixodMaydonlar] === v)) return q;
  return { ...q, maydonlar: { ...q.maydonlar, ...fields }, versiya: q.versiya + 1, tasdiq: null };
}

function fingerprint(q: PrixodQoralama): string {
  const f = q.maydonlar;
  return JSON.stringify([q.manba.manbaQator, q.versiya, f.sana, f.nom, f.birlik, f.miqdor, f.yetkazuvchi, f.hujjat]);
}

export function qoralamaQator(q: PrixodQoralama): PrixodQator {
  const f = q.maydonlar; const sana = prixodSana(f.sana); const miqdor = prixodMiqdor(f.miqdor);
  const xatolar: PrixodXato[] = [];
  if (!sana) xatolar.push(f.sana.trim() ? 'SANA_XATO' : 'SANA_YOQ');
  if (!f.nom.trim()) xatolar.push('NOM_YOQ');
  if (!f.birlik.trim()) xatolar.push('BIRLIK_YOQ');
  const unchangedDateQuantity = q.manba.xatolar.includes('MIQDOR_SANA') && f.miqdor === q.manba.miqdorMatni;
  if (unchangedDateQuantity) xatolar.push('MIQDOR_SANA');
  else if (miqdor == null || miqdor <= 0) xatolar.push(f.miqdor.trim() ? 'MIQDOR_XATO' : 'MIQDOR_YOQ');
  return { ...q.manba, sana, nom: f.nom.trim(), birlik: f.birlik.trim(), miqdor: unchangedDateQuantity ? null : miqdor,
    miqdorMatni: f.miqdor, yetkazuvchi: f.yetkazuvchi.trim(), hujjat: f.hujjat.trim(),
    kalit: null, holat: xatolar.length ? 'xato' : 'yangi', xatolar,
    ogohlar: [...q.manba.ogohlar.filter(k => k !== 'YETKAZUVCHI_YOQ'), ...(!f.yetkazuvchi.trim() ? ['YETKAZUVCHI_YOQ' as const] : [])] };
}

/** Explicit approval binds the complete visible draft. Editing any field invalidates it. */
export function qoralamaTasdiqla(q: PrixodQoralama): PrixodQoralama {
  if (qoralamaQator(q).xatolar.length) return { ...q, tasdiq: null };
  return { ...q, tasdiq: fingerprint(q) };
}

export function qoralamaTasdiqlangan(q: PrixodQoralama): boolean {
  return q.tasdiq != null && q.tasdiq === fingerprint(q) && qoralamaQator(q).xatolar.length === 0;
}
