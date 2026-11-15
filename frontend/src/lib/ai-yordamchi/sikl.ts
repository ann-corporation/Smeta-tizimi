/**
 * Sahifa agent sikli: model → (o'qish vositalari brauzerda, real ma'lumot ustida) → model … (≤ MAX_AYLANISH) → javob + takliflar.
 * Vositalar sahifaga xos (`SahifaVositalar`); bu sikl sahifadan mustaqil — fakt va F2 bir xil qatlamdan foydalanadi.
 * Hech qanday yozuv bu yerda bajarilmaydi: amallar faqat qaytariladi, foydalanuvchi panelda tasdiqlaydi.
 */
import { sahifaSuhbat } from '../../api/smeta-ai';
import { t } from '../../i18n/til';
import type { OqishNatija, OqishSorovi, SahifaAmal, SahifaTuri, SahifaXabar } from './protokol';

export const MAX_AYLANISH = 4;
export const NATIJA_MAX = 6000;

/** Sahifa beradigan vositalar: kontekst xulosasi, o'qish va amallarni tekshirish/bajarish. */
export type SahifaVositalar = {
  sahifa: SahifaTuri;
  /** Sahifaning qisqa xulosasi (har aylanishda yangi o'qiladi). */
  kontekst: () => string;
  /** O'qish vositasi — matn natija (chegaralangan). Noma'lum vosita/argument → tushunarli xato matni. */
  oqi: (s: OqishSorovi) => Promise<string> | string;
  /** Amal taklifini tekshiradi: null — yaroqli; matn — sabab (taklif ogohlantirish bilan ko'rsatiladi, belgilanmagan). */
  tekshir: (a: SahifaAmal) => string | null;
  /** Amal yorlig'i (foydalanuvchiga): masalan «Fakt hajmi · Е06-001 Beton · +5». */
  nomi: (a: SahifaAmal) => string;
  /** Pul/huquqiy ta'sirli amalmi — bo'lsa panel «Bajarish»dan keyin ALOHIDA «Tasdiqlayman» so'raydi (ovoz bilan emas). */
  pul?: (a: SahifaAmal) => boolean;
  /** Tasdiqlangan amallarni bajaradi (mavjud yozish yo'llari: kiritma, mavjud modal). Natija qatorlari qaytadi. */
  bajar: (amallar: SahifaAmal[]) => Promise<string[]>;
};

export type SiklQadam = { matn: string; holat: 'ishda' | 'ok' | 'xato' | 'savol' };
export type SiklNatija =
  | { ok: true; javob: string; savollar: string[]; amallar: Array<SahifaAmal & { ogoh: string | null }>; model: string; ogohlantirish?: string }
  | { ok: false; code: string; message?: string };

const VOSITA_NOMI: Record<string, string> = { qidir: 'Qidiryapman', holat: 'Holatni o‘qiyapman', bolim: 'Bo‘limni o‘qiyapman', normativ: 'Normativ katalogdan qidiryapman',
  tekshir: 'Tekshiryapman', narx: 'Narx manbalarini o‘qiyapman', narxsiz: 'Narxsiz qatorlarni qidiryapman', qoldiq: 'Qoldiqni hisoblayapman',
  lugat: 'Lug‘atdan qidiryapman', kelishuv: 'Narxni smeta bilan solishtiryapman', naryad: 'Naryadlarni o‘qiyapman', loyiha_farq: 'Loyiha, smeta va fakt farqini o‘qiyapman', loyiha_tahrir: 'Chizma tahrirlari farqini o‘qiyapman', slichitelniy: 'Slichitelniy tayyorligini o‘qiyapman', asossiz: 'Asosi yo‘q qatorlarni qidiryapman' };
export const vositaYorligi = (s: OqishSorovi) => `${VOSITA_NOMI[s.vosita] ? t(VOSITA_NOMI[s.vosita]) : s.vosita}${s.arg ? ` «${s.arg}»` : ''}`;

export async function agentSikli(p: { kompaniyaId: number; xabarlar: SahifaXabar[]; vositalar: SahifaVositalar; qadam?: (q: SiklQadam) => void; tirikmi?: () => boolean }): Promise<SiklNatija> {
  const natijalar: OqishNatija[] = [];
  const bajarilgan = new Set<string>();
  const bekorQilindi = () => p.tirikmi !== undefined && !p.tirikmi();
  for (let i = 0; i < MAX_AYLANISH; i++) {
    const oxirgi = i === MAX_AYLANISH - 1;
    if (bekorQilindi()) return { ok: false, code: 'BEKOR' };
    const kontekst = p.vositalar.kontekst();
    if (bekorQilindi()) return { ok: false, code: 'BEKOR' };
    const r = await sahifaSuhbat(p.kompaniyaId, p.vositalar.sahifa, p.xabarlar, kontekst, natijalar, oxirgi);
    if (bekorQilindi()) return { ok: false, code: 'BEKOR' };
    if (!r.ok) return { ok: false, code: r.code, message: r.message };
    const shuJavobda = new Set<string>();
    const yangi = r.oqish.filter((s) => {
      const kalit = JSON.stringify([s.vosita, s.arg ?? null]);
      if (bajarilgan.has(kalit) || shuJavobda.has(kalit)) return false;
      shuJavobda.add(kalit);
      return true;
    });
    if (r.oqish.length && (oxirgi || !yangi.length)) return { ok: false, code: 'AYLANISH_TUGADI' };
    if (yangi.length) {
      for (const s of yangi) {
        if (bekorQilindi()) return { ok: false, code: 'BEKOR' };
        bajarilgan.add(JSON.stringify([s.vosita, s.arg ?? null]));
        p.qadam?.({ matn: vositaYorligi(s), holat: 'ishda' });
        if (bekorQilindi()) return { ok: false, code: 'BEKOR' };
        let natija = '';
        let xato: string | undefined;
        try { natija = String(await p.vositalar.oqi(s)).slice(0, NATIJA_MAX); }
        catch (e) { xato = e instanceof Error ? e.message : String(e); }
        if (bekorQilindi()) return { ok: false, code: 'BEKOR' };
        if (xato !== undefined) return { ok: false, code: 'OQISH_XATO' };
        natijalar.push({ ...s, natija });
      }
      continue;
    }
    const amallar = r.amallar.map((a) => ({ ...a, ogoh: p.vositalar.tekshir(a) }));
    return { ok: true, javob: r.javob, savollar: r.savollar, amallar, model: r.model, ...(r.ogohlantirish ? { ogohlantirish: r.ogohlantirish } : {}) };
  }
  return { ok: false, code: 'AYLANISH_TUGADI' };
}
