/**
 * AI taklif qilgan harakatlarni BAJARISH — faqat foydalanuvchi tasdig'idan keyin (yoki o'z sozlamasiga ko'ra past xavfda avto),
 * foydalanuvchining O'Z sessiyasi bilan mavjud nomli gateway orqali (shuning uchun uning huquqi, tenant va audit qoidalari to'liq qo'llanadi).
 * AI serveri hech qachon bu yozuvlarni o'zi bajarmaydi.
 */
import { sbSkladgaYozish, yangiOperationId } from '../../api/supabase';
import { sbGrafikYangila, type GrafikHolat } from '../../api/t2-grafik';
import { agentYoz } from '../../api/t2-agent-ish';

export const HARAKAT_NOMI: Record<string, string> = {
  ombor_kirim: 'Omborga kirim', ombor_chiqim: 'Ombordan chiqim', grafik_foiz: 'Grafik foizini yangilash', eslatma: 'Eslatma saqlash',
};
export const XAVF_NOMI: Record<string, string> = { past: 'Past xavf', orta: 'O‘rta xavf — tasdiq kerak', yuqori: 'YUQORI XAVF' };

/** Ma'lumot toifalari nomi (javob ostida «qaysi ma'lumotdan foydalanildi» belgilari uchun). */
export const TOIFA_NOMI: Record<string, string> = {
  obyektlar: 'Obyektlar', smeta_pul: 'Smeta summalari', f2_fakt_pul: 'F2 va fakt summalari', hajm: 'Bajarilish foizi', grafik: 'Grafik', moliya: 'Moliya',
  ombor: 'Ombor', sifat: 'AOSR va laboratoriya', kadr: 'Xodimlar', texnika: 'Texnika',
};

export type MaydonTuri = { kalit: string; nom: string; tur: 'matn' | 'son' | 'sana' };
/** Kartada tahrirlash mumkin bo'lgan maydonlar (obyekt_id/grafik_id kabi tizim maydonlari tahrirlanmaydi). */
export const HARAKAT_MAYDONLARI: Record<string, MaydonTuri[]> = {
  ombor_kirim: [{ kalit: 'nomi', nom: 'Material', tur: 'matn' }, { kalit: 'obyomi', nom: 'Miqdor', tur: 'son' }, { kalit: 'birligi', nom: 'Birlik', tur: 'matn' }, { kalit: 'sana', nom: 'Sana', tur: 'sana' }, { kalit: 'izoh', nom: 'Izoh', tur: 'matn' }],
  ombor_chiqim: [{ kalit: 'nomi', nom: 'Material', tur: 'matn' }, { kalit: 'obyomi', nom: 'Miqdor', tur: 'son' }, { kalit: 'birligi', nom: 'Birlik', tur: 'matn' }, { kalit: 'sana', nom: 'Sana', tur: 'sana' }, { kalit: 'izoh', nom: 'Izoh', tur: 'matn' }],
  grafik_foiz: [{ kalit: 'foiz', nom: 'Yangi foiz', tur: 'son' }],
  eslatma: [{ kalit: 'mazmun', nom: 'Matn', tur: 'matn' }],
};

export type HarakatNatijasi = { ok: boolean; xabar: string; natija: Record<string, unknown> };

const son = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

export async function harakatniBajar(kompaniyaId: number, amal: string, p: Record<string, unknown>): Promise<HarakatNatijasi> {
  try {
    if (amal === 'ombor_kirim' || amal === 'ombor_chiqim') {
      const hajm = son(p.obyomi);
      if (!(hajm > 0)) return { ok: false, xabar: 'Miqdor 0 dan katta bo‘lishi kerak', natija: {} };
      const r = await sbSkladgaYozish(kompaniyaId, amal === 'ombor_kirim' ? 'prixod' : 'rasxod', {
        obyekt_id: Number(p.obyekt_id), operatsiya: amal === 'ombor_kirim' ? 'prixod' : 'rasxod', turi: String(p.turi ?? 'material'), sana: String(p.sana ?? new Date().toISOString().slice(0, 10)),
        nomi: String(p.nomi ?? ''), birligi: String(p.birligi ?? ''), obyomi: hajm, izoh: p.izoh ? String(p.izoh) : undefined, operation_id: yangiOperationId(),
      });
      return r.ok ? { ok: true, xabar: 'Omborga yozildi', natija: { nomi: p.nomi, obyomi: hajm } } : { ok: false, xabar: r.error || 'Omborga yozilmadi', natija: {} };
    }
    if (amal === 'grafik_foiz') {
      const foiz = son(p.foiz);
      if (!(foiz >= 0 && foiz <= 100)) return { ok: false, xabar: 'Foiz 0–100 oralig‘ida bo‘lishi kerak', natija: {} };
      const holat: GrafikHolat = foiz >= 100 ? 'bajarildi' : foiz > 0 ? 'jarayonda' : 'reja';
      const r = await sbGrafikYangila(Number(p.grafik_id), Number(p.kutilgan_versiya), { foiz, holat });
      return r.ok ? { ok: true, xabar: 'Grafik yangilandi', natija: { foiz, holat } } : { ok: false, xabar: r.error || 'Grafik yangilanmadi (sahifa eskirgan bo‘lishi mumkin — savolni qayta bering)', natija: {} };
    }
    if (amal === 'eslatma') {
      const r = await agentYoz('xotira_yoz', kompaniyaId, { kalit: String(p.kalit ?? ''), mazmun: String(p.mazmun ?? '') });
      return r.ok ? { ok: true, xabar: 'Eslatma saqlandi', natija: { kalit: p.kalit } } : { ok: false, xabar: r.error, natija: {} };
    }
    return { ok: false, xabar: 'Noma’lum harakat', natija: {} };
  } catch (e) { return { ok: false, xabar: e instanceof Error ? e.message : String(e), natija: {} }; }
}
