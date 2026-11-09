/**
 * MOSLASH HISOBOTI (F2 import auditi, 2026-11-09): yozishdan OLDIN har manba qatori uchun — manba yo'li, bog'langan smeta
 * qatori, ishonch (aniq / ehtimol / topilmadi) va sabablar. Shubhali qatorlar (P2 birlashish, P3/P5 modifikator, P7 boshqa
 * bo'lim, birlik farqi) va xatolar (P4 qo'shni ish resursi, P8 ishsiz resurs) shu yerda ko'rinadi — jim import qilinmaydi.
 * Faqat o'qiydi: bog'lanishlarni o'zgartirmaydi.
 */
import { normBir, normNom } from '../f2-match-engine';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { BOSHQA_BOLIM_USUL, MODIFIKATOR_USUL, type F2MoslashNatija } from './index';
import { bogIdlari, korinish, TARKIB_USUL, type F2Indeks, type IshJoyi, type SmetaIndeks } from './ishJoyi';
import { modifikatorFarqlari, modifikatorIzoh } from './modifikator';

export type HisobotIshonch = 'aniq' | 'ehtimol' | 'topilmadi' | 'otkazildi';

export interface HisobotQator {
  uid: string;
  manzil: string;
  tur: F2Tugun['tur'];
  kod: string | null;
  nom: string;
  birlik: string | null;
  hajm: number | null;
  /** Manba (F2) bo'limlar yo'li. */
  manbaYol: string;
  qatorId: number | null;
  /** Bog'langan smeta qatori (kod + nom) va uning bo'lim yo'li. */
  smeta: string;
  smetaYol: string;
  ishonch: HisobotIshonch;
  usul: string;
  sabablar: string[];
  /** PTO tasdig'isiz aktga kirmasligi kerak bo'lgan holat. */
  shubhali: boolean;
  /** Bog'lanish xato — yozishdan oldin tuzatilishi kerak. */
  xato: boolean;
}

export interface MoslashHisoboti {
  qatorlar: HisobotQator[];
  stat: { aniq: number; ehtimol: number; topilmadi: number; otkazildi: number; shubhali: number; xato: number };
}

const SHUBHALI_USUL = new Set(['takror', 'boshqa_razdel', BOSHQA_BOLIM_USUL, MODIFIKATOR_USUL, 'zamena_nomzod']);

/** Ommaviy tasdiqda jim o'tmaydigan ◐ usullari: boshqa bo'lim (P7), modifikator (P3/P5), ikkinchi alohida blok (P2). */
export function shubhaliUsulmi(usul: string | null | undefined): boolean {
  return !!usul && (SHUBHALI_USUL.has(usul) || /modifikator/.test(usul));
}

function smetaYoli(S: SmetaIndeks, id: number): string {
  const out: string[] = [];
  let t = S.byId.get(id);
  for (let i = 0; t && i < 64; i++) {
    const o = t.otaId != null ? S.byId.get(t.otaId) : undefined;
    if (o?.tur === 'rz') out.unshift(String(o.nom ?? ''));
    t = o;
  }
  return out.join(' / ');
}

function ajdodlar(S: SmetaIndeks, id: number): Set<number> {
  const out = new Set<number>();
  let t = S.byId.get(id);
  for (let i = 0; t && t.otaId != null && i < 64; i++) { out.add(t.otaId); t = S.byId.get(t.otaId); }
  return out;
}

export function moslashHisoboti(p: { ind: F2Indeks; ij: IshJoyi; S: SmetaIndeks; natija?: F2MoslashNatija | null }): MoslashHisoboti {
  const { ind, ij, S, natija } = p;
  const rzDoira = new Map<string, number[]>();
  for (const d of natija?.rzDiag ?? []) if (d.ok && d.smetaRzIdlar.length) rzDoira.set(d.f2Uid, d.smetaRzIdlar);
  const halmi = (uid: string) => { const b = ij.bog.get(uid); return !!b && b.holat !== 'taklif' && !ij.otkaz.has(uid); };

  // Bir smeta qatoriga tushgan manba qatorlari (taqsimsiz) — P2.
  const qatorga = new Map<number, F2Tugun[]>();
  for (const n of ind.qatorlar) {
    const b = ij.bog.get(n.uid);
    if (!b || ij.otkaz.has(n.uid) || b.usul === TARKIB_USUL || (b.taqsim && b.taqsim.length > 1)) continue;
    const a = qatorga.get(b.qatorId) ?? [];
    a.push(n); qatorga.set(b.qatorId, a);
  }
  const ishEgasi = new Map<number, string>();
  for (const n of ind.qatorlar) if (n.tur === 'bl') { const b = ij.bog.get(n.uid); if (b && !ij.otkaz.has(n.uid)) for (const id of bogIdlari(b)) ishEgasi.set(id, n.uid); }

  const qatorlar: HisobotQator[] = [];
  for (const n of ind.qatorlar) {
    const k = korinish(ij, n.uid);
    const b = ij.bog.get(n.uid);
    const r = natija?.natijalar.get(n.uid);
    const sabablar: string[] = [];
    let shubhali = false, xato = false;
    const t = b ? S.byId.get(b.qatorId) : undefined;
    if (r?.sabab) sabablar.push(r.sabab);
    if (b && k !== 'otkazildi') {
      if (shubhaliUsulmi(b.usul)) shubhali = true;
      if (t && normBir(n.birlik) && normBir(t.birlik) && normBir(n.birlik) !== normBir(t.birlik) && b.usul !== TARKIB_USUL) {
        shubhali = true; sabablar.push(`birlik farqli: manba ${n.birlik ?? '—'} ↔ smeta ${t.birlik ?? '—'}`);
      }
      if (t) {
        const modF = modifikatorFarqlari(n, t);
        if (modF.length && b.usul !== TARKIB_USUL) { shubhali = true; sabablar.push(`modifikator farqli: ${modifikatorIzoh(modF)}`); }
      }
      // P2: bitta smeta qatoriga bir nechta manba qatori.
      const birga = qatorga.get(b.qatorId) ?? [];
      if (birga.length > 1) {
        const turli = new Set(birga.map((x) => normNom(x.nom) + '|' + normBir(x.birlik))).size > 1;
        if (n.tur === 'bl' || turli) shubhali = true;
        sabablar.push(`${birga.length} ta manba qatori shu smeta qatoriga qo‘shiladi${turli ? ' (ular TURLI — birlashtirish xato bo‘lishi mumkin)' : ''}`);
      }
      // P7: manba bo'limi smetadagi bo'limga ulangan, bog'langan qator esa boshqa bo'limda.
      const otaRz = ind.ota.get(n.uid);
      const rzManba = otaRz?.tur === 'rz' ? otaRz : otaRz ? ind.ota.get(otaRz.uid) : null;
      const doira = rzManba ? rzDoira.get(rzManba.uid) : undefined;
      if (doira && t && n.tur === 'bl') {
        const aj = ajdodlar(S, t.id);
        if (!doira.some((id) => aj.has(id))) { shubhali = true; sabablar.push('boshqa bo‘limdagi smeta qatori — manba bo‘limi boshqa joyga ulangan'); }
      }
      // P4 / P8: resurs o'z ishiga bog'liq.
      const o = ind.ota.get(n.uid);
      if (n.tur !== 'bl' && o?.tur === 'bl') {
        if (k !== 'taklif' && !halmi(o.uid) && !ij.otkaz.has(o.uid)) { xato = true; sabablar.push('ishi (BL) hal qilinmagan — resurs bloklandi, aktga kirmaydi'); }
        const ob = ij.bog.get(o.uid);
        const oz = new Set(ob ? bogIdlari(ob) : []);
        for (const id of bogIdlari(b)) {
          const ota = S.byId.get(id)?.otaId;
          if (oz.has(id) || ota == null || oz.has(ota) || S.byId.get(ota)?.tur !== 'bl') continue;
          const egasi = ishEgasi.get(ota);
          if (egasi && egasi !== o.uid) { xato = true; sabablar.push('qo‘shni ishning resursiga bog‘langan — resurs faqat o‘z ishi ostiga'); break; }
        }
      }
    }
    const ishonch: HisobotIshonch = k === 'otkazildi' ? 'otkazildi' : k === 'topilmadi' ? 'topilmadi' : k === 'taklif' || shubhali ? 'ehtimol' : 'aniq';
    qatorlar.push({
      uid: n.uid, manzil: `${n.manzil.varaq}!${n.manzil.qator}`, tur: n.tur, kod: n.kod, nom: n.nom, birlik: n.birlik, hajm: n.hajm,
      manbaYol: n.yol.join(' / '), qatorId: b?.qatorId ?? null,
      smeta: t ? `${t.kod ?? ''} ${t.nom ?? ''}`.trim() : '', smetaYol: t ? smetaYoli(S, t.id) : '',
      ishonch, usul: b?.usul ?? r?.usul ?? '', sabablar, shubhali: shubhali && k !== 'otkazildi', xato,
    });
  }
  const stat = { aniq: 0, ehtimol: 0, topilmadi: 0, otkazildi: 0, shubhali: 0, xato: 0 };
  for (const q of qatorlar) { stat[q.ishonch]++; if (q.shubhali) stat.shubhali++; if (q.xato) stat.xato++; }
  return { qatorlar, stat };
}
