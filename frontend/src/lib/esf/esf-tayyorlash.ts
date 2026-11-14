/**
 * ESF (elektron hisob-faktura) TAYYORLASH — toza yordamchilar (UI siz, tarmoq yo'q).
 * Manba: shartnoma darajasidagi Forma 3 (forma3-export.ts `f3ShartnomaYigish`) — summa YANGIDAN hisoblanmaydi, faqat ko'chiriladi.
 * Natija: (1) rekvizit/ID tekshiruvi (jo'natishdan oldingi ro'yxat), (2) neytral JSON paket (didox/faktura.uz ga buxgalter qo'lda yuklaydi).
 * Tashqi servis chaqirilmaydi, kalit/credential yo'q. Bazada faqat ESF holati + tashqi ID saqlanadi (t2_forma3.esf_*).
 *
 * YURIDIK ESLATMA: qaysi ID majburiy ekani quyidagi SOZLAMADA — qotirilgan da'vo emas («T — tekshirilsin»).
 * Tadqiqot xulosasi: qurilishda my3.soliq.uz shartnoma ID; byudjet obyektida kapital.imv.uz ID; boshqa holda kadastr raqami.
 */

import type { F3ShartnomaYigindi } from '../forma3-export';
import { yaxlit2 } from '../hisob-yadro';

export type EsfIdTuri = 'my3' | 'kapital' | 'kadastr';
export const ESF_ID_TURLARI: ReadonlyArray<EsfIdTuri> = ['my3', 'kapital', 'kadastr'];
export const ESF_ID_NOMI: Record<EsfIdTuri, string> = {
  my3: 'my3.soliq.uz shartnoma ID',
  kapital: 'kapital.imv.uz ID (byudjet obyekti)',
  kadastr: 'Kadastr raqami',
};
export const ESF_T_ESLATMA = 'T — tekshirilsin: majburiy ID turini buxgalter/yurist rasmiy manbadan tasdiqlasin.';

/** Sozlanadigan talablar: qaysi rekvizitlar majburiy (kalit → majburiymi). Yuridik da'vo emas — kompaniya o'zgartira oladi. */
export interface EsfSozlama {
  sotuvchiStir: boolean; xaridorStir: boolean; sotuvchiBank: boolean; xaridorBank: boolean;
  shartnomaRaqam: boolean; shartnomaSana: boolean;
  /** Tanlangan ID turi (shartnomada) majburiymi. */
  shartnomaId: boolean;
  ikpu: boolean; birlikKodi: boolean;
}
export const ESF_SOZLAMA_SUKUT: EsfSozlama = {
  sotuvchiStir: true, xaridorStir: true, sotuvchiBank: true, xaridorBank: true,
  shartnomaRaqam: true, shartnomaSana: true, shartnomaId: true,
  // IKPU/o'lchov kodi: ESF qatori uchun odatda kerak, lekin tayyorlash bosqichida ogohlantirish (bloklamaydi) — buxgalter to'ldiradi.
  ikpu: false, birlikKodi: false,
};

export interface EsfTomon { nom?: string | null; stir?: string | null; bank?: string | null; hisobRaqam?: string | null; mfo?: string | null; manzil?: string | null }
export interface EsfShartnoma {
  raqam?: string | null; sana?: string | null;
  idTuri?: EsfIdTuri | null; my3Id?: string | null; kapitalId?: string | null; kadastr?: string | null;
}
export interface EsfQator {
  nom: string;
  ikpu?: string | null; birlikKodi?: string | null; birlikNomi?: string | null;
  miqdor: number;
  /** NDS siz summa (ustamali, ИТОГО-4) — F3 «за отчетный месяц». null — noma'lum (0 emas). */
  summaNdsiz: number | null; qqsSumma: number | null; summaNdsBilan: number | null;
}
export interface EsfKiritma {
  forma3Raqam?: string | null; davr: string; hujjatSana?: string | null;
  sotuvchi: EsfTomon; xaridor: EsfTomon; shartnoma: EsfShartnoma;
  qqsFoiz: number | null; qatorlar: ReadonlyArray<EsfQator>;
}

export type EsfTekshiruvHolat = 'ok' | 'yoq' | 'ogohlantirish';
export interface EsfTekshiruvQator { kalit: string; nom: string; holat: EsfTekshiruvHolat; izoh?: string }
export interface EsfTekshiruvNatija { qatorlar: EsfTekshiruvQator[]; tayyor: boolean; yoqSoni: number; ogohSoni: number }

const bor = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim() !== '';
/** STIR/INN: 9 raqam (yuridik shaxs) yoki 14 raqam (jismoniy shaxs, PINFL) — bo'shliqsiz raqamlar. */
export const stirToza = (v: string | null | undefined): string => (v ?? '').replace(/\s+/g, '');
export const stirYaroqli = (v: string | null | undefined): boolean => /^\d{9}$/.test(stirToza(v)) || /^\d{14}$/.test(stirToza(v));
const yaqin = (a: number, b: number) => Math.abs(a - b) <= 0.01;

/** Qaysi shartnoma ID maydoni tanlangan tur uchun javob beradi. */
export function esfTanlanganId(sh: EsfShartnoma): string | null {
  const t = sh.idTuri;
  const v = t === 'my3' ? sh.my3Id : t === 'kapital' ? sh.kapitalId : t === 'kadastr' ? sh.kadastr : null;
  return bor(v) ? String(v).trim() : null;
}

export function esfTekshir(k: EsfKiritma, s: EsfSozlama = ESF_SOZLAMA_SUKUT): EsfTekshiruvNatija {
  const q: EsfTekshiruvQator[] = [];
  const add = (kalit: string, nom: string, talab: boolean, ok: boolean, yoqIzoh: string) => {
    q.push({ kalit, nom, holat: ok ? 'ok' : (talab ? 'yoq' : 'ogohlantirish'), izoh: ok ? undefined : yoqIzoh });
  };
  const stir = (kalit: string, nom: string, v: string | null | undefined, talab: boolean) => {
    if (!bor(v)) add(kalit, nom, talab, false, 'kiritilmagan');
    else if (!stirYaroqli(v)) add(kalit, nom, true, false, 'STIR 9 raqam (yoki 14 raqamli PINFL) bo‘lishi kerak');
    else add(kalit, nom, talab, true, '');
  };
  stir('sotuvchi_stir', 'Sotuvchi STIR', k.sotuvchi.stir, s.sotuvchiStir);
  stir('xaridor_stir', 'Xaridor STIR', k.xaridor.stir, s.xaridorStir);
  add('sotuvchi_bank', 'Sotuvchi bank rekvizitlari (bank, hisob raqam, MFO)', s.sotuvchiBank,
    bor(k.sotuvchi.bank) && bor(k.sotuvchi.hisobRaqam) && bor(k.sotuvchi.mfo), 'bank / hisob raqam / MFO to‘liq emas');
  add('xaridor_bank', 'Xaridor bank rekvizitlari (bank, hisob raqam, MFO)', s.xaridorBank,
    bor(k.xaridor.bank) && bor(k.xaridor.hisobRaqam) && bor(k.xaridor.mfo), 'bank / hisob raqam / MFO to‘liq emas');
  add('shartnoma_raqam', 'Shartnoma raqami', s.shartnomaRaqam, bor(k.shartnoma.raqam), 'kiritilmagan');
  add('shartnoma_sana', 'Shartnoma sanasi', s.shartnomaSana, bor(k.shartnoma.sana), 'kiritilmagan');

  if (!k.shartnoma.idTuri) {
    add('shartnoma_id', `Shartnoma ID turi (my3 / kapital.imv / kadastr). ${ESF_T_ESLATMA}`, s.shartnomaId, false, 'ID turi tanlanmagan');
  } else {
    add('shartnoma_id', `${ESF_ID_NOMI[k.shartnoma.idTuri]}. ${ESF_T_ESLATMA}`, s.shartnomaId, esfTanlanganId(k.shartnoma) != null, 'qiymati kiritilmagan');
  }

  add('qqs_foiz', 'QQS stavkasi', true, k.qqsFoiz != null && Number.isFinite(k.qqsFoiz), 'stavka noma‘lum (obyekt nakrutka/podvalidan)');
  add('qatorlar', 'ESF qatorlari', true, k.qatorlar.length > 0, 'qator yo‘q');
  const nomalum = k.qatorlar.filter((x) => x.summaNdsiz == null || x.qqsSumma == null || x.summaNdsBilan == null);
  if (k.qatorlar.length) add('summa_nomalum', 'Barcha qator summalari aniq (NULL ≠ 0)', true, nomalum.length === 0,
    `${nomalum.length} ta qator summasi noma‘lum: ${nomalum.map((x) => x.nom).join('; ')}`);
  const nomsiz = k.qatorlar.filter((x) => !bor(x.nom));
  if (k.qatorlar.length) add('qator_nom', 'Har qatorda nom bor', true, nomsiz.length === 0, `${nomsiz.length} ta qator nomsiz`);
  const nomuvofiq = k.qatorlar.filter((x) => x.summaNdsiz != null && x.qqsSumma != null && x.summaNdsBilan != null && !yaqin(x.summaNdsiz + x.qqsSumma, x.summaNdsBilan));
  if (k.qatorlar.length) add('summa_mos', 'Har qatorda NDS siz + QQS = NDS bilan', true, nomuvofiq.length === 0,
    `${nomuvofiq.length} ta qatorda mos emas: ${nomuvofiq.map((x) => x.nom).join('; ')}`);
  const ikpuYoq = k.qatorlar.filter((x) => !bor(x.ikpu));
  if (k.qatorlar.length) add('ikpu', 'Har qatorda IKPU kodi', s.ikpu, ikpuYoq.length === 0, `${ikpuYoq.length} ta qatorda IKPU yo‘q (didox/faktura.uz da to‘ldiriladi)`);
  const birYoq = k.qatorlar.filter((x) => !bor(x.birlikKodi));
  if (k.qatorlar.length) add('birlik_kodi', 'Har qatorda o‘lchov birligi kodi', s.birlikKodi, birYoq.length === 0, `${birYoq.length} ta qatorda birlik kodi yo‘q`);

  const yoqSoni = q.filter((x) => x.holat === 'yoq').length;
  const ogohSoni = q.filter((x) => x.holat === 'ogohlantirish').length;
  return { qatorlar: q, tayyor: yoqSoni === 0, yoqSoni, ogohSoni };
}

/** Neytral JSON paket (didox/faktura.uz ga qo'lda yuklash uchun; platformaning rasmiy sxemasi EMAS — maydon nomlari tushunarli, moslash buxgalter/integrator ishi). */
export interface EsfPaket {
  format: 'neytral-esf-v1';
  eslatma: string;
  hujjat: { forma3Raqam: string | null; davr: string; sana: string | null };
  sotuvchi: EsfTomon; xaridor: EsfTomon;
  shartnoma: { raqam: string | null; sana: string | null; idTuri: EsfIdTuri | null; idQiymat: string | null; my3Id: string | null; kapitalId: string | null; kadastr: string | null };
  qqsFoiz: number | null;
  qatorlar: Array<{ tartib: number; nom: string; ikpu: string | null; birlikKodi: string | null; birlikNomi: string | null; miqdor: number; narx: number | null; summaNdsiz: number | null; qqsSumma: number | null; summaNdsBilan: number | null }>;
  jami: { summaNdsiz: number | null; qqsSumma: number | null; summaNdsBilan: number | null };
}

const yigish = (a: ReadonlyArray<number | null>): number | null => (a.some((x) => x == null) ? null : yaxlit2(a.reduce<number>((s, x) => s + (x as number), 0)));
const sonsiz = (v: string | null | undefined) => (bor(v) ? String(v).trim() : null);

export function esfPaketQur(k: EsfKiritma): EsfPaket {
  const tomon = (t: EsfTomon): EsfTomon => ({ nom: sonsiz(t.nom), stir: bor(t.stir) ? stirToza(t.stir) : null, bank: sonsiz(t.bank), hisobRaqam: sonsiz(t.hisobRaqam), mfo: sonsiz(t.mfo), manzil: sonsiz(t.manzil) });
  const qat = k.qatorlar.map((x, i) => ({
    tartib: i + 1, nom: x.nom.trim(), ikpu: sonsiz(x.ikpu), birlikKodi: sonsiz(x.birlikKodi), birlikNomi: sonsiz(x.birlikNomi), miqdor: x.miqdor,
    narx: x.summaNdsiz == null || !x.miqdor ? null : yaxlit2(x.summaNdsiz / x.miqdor),
    summaNdsiz: x.summaNdsiz, qqsSumma: x.qqsSumma, summaNdsBilan: x.summaNdsBilan,
  }));
  return {
    format: 'neytral-esf-v1',
    eslatma: `Bu didox/faktura.uz rasmiy sxemasi emas — qo‘lda yuklash uchun tayyorlangan neytral ma’lumot. ${ESF_T_ESLATMA}`,
    hujjat: { forma3Raqam: sonsiz(k.forma3Raqam), davr: k.davr, sana: sonsiz(k.hujjatSana) },
    sotuvchi: tomon(k.sotuvchi), xaridor: tomon(k.xaridor),
    shartnoma: {
      raqam: sonsiz(k.shartnoma.raqam), sana: sonsiz(k.shartnoma.sana), idTuri: k.shartnoma.idTuri ?? null, idQiymat: esfTanlanganId(k.shartnoma),
      my3Id: sonsiz(k.shartnoma.my3Id), kapitalId: sonsiz(k.shartnoma.kapitalId), kadastr: sonsiz(k.shartnoma.kadastr),
    },
    qqsFoiz: k.qqsFoiz,
    qatorlar: qat,
    jami: { summaNdsiz: yigish(qat.map((x) => x.summaNdsiz)), qqsSumma: yigish(qat.map((x) => x.qqsSumma)), summaNdsBilan: yigish(qat.map((x) => x.summaNdsBilan)) },
  };
}

/** Shartnoma F3 yig'indisidan (ustun J — «за отчетный месяц») har obyekt uchun bitta ESF qatori. Summalar F3 dan AYNAN ko'chiriladi. */
export function esfQatorlarF3dan(y: Pick<F3ShartnomaYigindi, 'obyektlar'>): EsfQator[] {
  return y.obyektlar.map((o) => ({
    nom: `Строительно-монтажные работы: ${o.nom}`,
    miqdor: 1, birlikNomi: 'komplekt',
    summaNdsiz: o.ustun.J.itogo4, qqsSumma: o.ustun.J.qqs, summaNdsBilan: o.ustun.J.vsego,
  }));
}

export const esfJson = (p: EsfPaket): string => JSON.stringify(p, null, 2);

/** Excel (CSV, ';' ajratgich, UTF-8 BOM) — qatorlar jadvali; Excel to'g'ridan-to'g'ri ochadi. null katak — bo'sh. */
export function esfCsv(p: EsfPaket): string {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows: unknown[][] = [
    ['№', 'Nomi', 'IKPU', 'Birlik kodi', 'Birlik', 'Miqdor', 'Narx (NDS siz)', 'Summa NDS siz', 'QQS', 'Summa NDS bilan'],
    ...p.qatorlar.map((x) => [x.tartib, x.nom, x.ikpu, x.birlikKodi, x.birlikNomi, x.miqdor, x.narx, x.summaNdsiz, x.qqsSumma, x.summaNdsBilan]),
    ['', 'JAMI', '', '', '', '', '', p.jami.summaNdsiz, p.jami.qqsSumma, p.jami.summaNdsBilan],
  ];
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}
