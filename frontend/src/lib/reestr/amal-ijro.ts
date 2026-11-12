/**
 * AMAL IJROCHILARI (ekotizim V2, 3-qadam): amal kaliti -> {oldindan ko'rish, ijro}. Faqat MAVJUD API klientlari (yangi server mantiqi YO'Q);
 * pul summasi hisob-yadro (yaxlit2) orqali. Ijrochisi yo'q amal — navigatsiya (yo'naltirish), «model» amal — mavjud model oqimi.
 */
import { sbZayavkaYoz } from '../../api/t2-zayavka';
import { tolovYoz } from '../../api/t2-nakopitelniy';
import { sbArxivla } from '../../api/t2-arxiv';
import { yaxlit2 } from '../hisob-yadro';
import type { AmalKontekst, Ijrochi } from './amal-motor';

const som = (n: number): string => `${yaxlit2(n).toLocaleString('ru-RU')} so‘m`;
const obyektNomi = (ctx: AmalKontekst, id: unknown): string => ctx.obyektlar.find((o) => o.id === Number(id))?.nom ?? `#${String(id)}`;
const xato = (r: { error?: string; xabar?: string } | null | undefined, zaxira: string): string => r?.xabar || r?.error || zaxira;

export const IJROCHILAR: Readonly<Record<string, Ijrochi>> = {
  'zayavka.yaratish': {
    korinish: (p, ctx) => ({ matn: `Zayavka yaratiladi: «${String(p.material)}», ${String(p.miqdor)} dona/birlik — obyekt: ${obyektNomi(ctx, p.obyekt)}. Yuborish ombor/ta‘minotga ko‘rinadi.` }),
    ijro: async (p, ctx) => {
      if (ctx.kompaniyaId == null) return { ok: false, xabar: 'Kompaniya tanlanmagan.' };
      const r = await sbZayavkaYoz(ctx.kompaniyaId, { obyektId: Number(p.obyekt), itemText: String(p.material), requestedQty: Number(p.miqdor) });
      return r?.ok ? { ok: true, xabar: 'Zayavka yaratildi.', havola: '/admin/zayavka' } : { ok: false, xabar: xato(r as { error?: string }, 'Zayavka yaratilmadi.') };
    },
  },
  'moliya.tolov': {
    korinish: (p) => ({ summa: Number(p.summa), matn: `To‘lov yoziladi: ${som(Number(p.summa))}, shartnoma #${String(p.shartnoma)}, sana ${String(p.sana)}. Bu pul yozuvi — qayta tahrirlash uchun alohida amal kerak.` }),
    ijro: async (p, ctx, operationId) => {
      if (ctx.kompaniyaId == null) return { ok: false, xabar: 'Kompaniya tanlanmagan.' };
      const r = await tolovYoz({ kompaniyaId: ctx.kompaniyaId, shartnomaId: Number(p.shartnoma), summa: yaxlit2(Number(p.summa)), tur: 'tolov', sana: String(p.sana), operationId });
      return (r as { ok?: boolean })?.ok ? { ok: true, xabar: 'To‘lov yozildi.', havola: '/admin/nakopitelniy' } : { ok: false, xabar: xato(r as { error?: string }, 'To‘lov yozilmadi.') };
    },
  },
  'arxiv.obyekt': {
    korinish: (p, ctx) => ({ matn: `Obyekt Korzinkaga yuboriladi: ${obyektNomi(ctx, p.obyekt)}. Tiklash mumkin; tasdiqlangan hujjati bo‘lsa — rad etiladi.` }),
    ijro: async (p) => {
      const r = await sbArxivla('obyekt', Number(p.obyekt));
      return r.ok ? { ok: true, xabar: 'Obyekt Korzinkaga yuborildi.', havola: '/admin/korzinka' } : { ok: false, xabar: xato(r, 'Arxivlanmadi.') };
    },
  },
};