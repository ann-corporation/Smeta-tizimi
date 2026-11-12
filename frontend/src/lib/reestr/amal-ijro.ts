/**
 * AMAL IJROCHILARI (ekotizim V2, 3-qadam): amal kaliti -> {nomzod, tekshir, oldindan ko'rish, ijro}. Faqat MAVJUD API klientlari
 * (yangi server mantiqi YO'Q); pul summasi hisob-yadro (yaxlit2) orqali. Ijrochisi yo'q amal — navigatsiya (yo'naltirish).
 * Idempotentlik: motor `operation_id` bo'yicha natijani keshlaydi (klientlar o'z operation_id sini yaratadi — server tomonda ham himoya).
 */
import { sbZayavkaYoz } from '../../api/t2-zayavka';
import { tolovYoz } from '../../api/t2-nakopitelniy';
import { sbArxivla } from '../../api/t2-arxiv';
import { sbFaktYoz } from '../../api/t2-fakt';
import { aloqalarOl, murojaatTurlariOl, murojaatYarat, taqdimlarOl, taqdimQarori, taqdimYubor } from '../../api/t2-tomon';
import { hujjatRoyxatOl } from '../../api/t2-hujjat-canonical';
import { sorovYubor } from '../../api/t2-lab-sorov';
import { buxDavr } from '../../api/t2-bux-hisob';
import { daraxtVaHolatOl } from '../oylik-hujjat/ostatka-slichitelniy';
import type { T2QatorHolat } from '../../api/supabase';
import { qidiruvTayyorla } from '../qidiruv-normalizatsiya';
import { yaxlit2 } from '../hisob-yadro';
import type { AmalKontekst, Ijrochi, Nomzod } from './amal-motor';

const som = (n: number): string => `${yaxlit2(n).toLocaleString('ru-RU')} so‘m`;
const obyektNomi = (ctx: AmalKontekst, id: unknown): string => ctx.obyektlar.find((o) => o.id === Number(id))?.nom ?? `#${String(id)}`;
const xato = (r: { error?: string; xabar?: string } | null | undefined, zaxira: string): string => r?.xabar || r?.error || zaxira;
const sana = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
type Tomon<T> = { ok: true; natija: T } | { ok: false; error: string };
const tomonNatija = (r: Tomon<unknown> | { ok?: boolean; error?: string }, ok: string, havola: string, zaxira: string) =>
  (r as { ok?: boolean }).ok ? { ok: true, xabar: ok, havola } : { ok: false, xabar: xato(r as { error?: string }, zaxira) };

/* ── Fakt: qatorni raqam / shifr / nom bo'yicha topish ─────────────────────────────────────────────────────────── */
const TO_LDIRUVCHI = new Set(['fakt', 'yoz', 'kirit', 'kiriting', 'yozing', 'qatorga', 'qator', 'ga', 'da', 'ni', 'uchun', 'bugun', 'iltimos', 'record', 'enter', 'внести', 'факт', 'записать']);
const birlikNorm = (b: string | null | undefined): string => (b ?? '').toLowerCase().replace(/[³]/g, '3').replace(/[²]/g, '2').replace(/\s+/g, '').replace(/м/g, 'm').replace(/кг/g, 'kg').replace(/шт/g, 'dona').replace(/т$/g, 't').replace(/\./g, '');
const BIRLIK_RE = /(?:^|\s)\d[\d.,]*\s*(m3|м3|m2|м2|kg|кг|tonna|t|тн|dona|шт|pm|p\.m|m|м|l|л)(?=\s|$|[.,])/iu;

/** Qator so'rovi: «5-qatorga» -> raqam 5; shifr (КР-5, 1.2-3) -> kod; qolgani -> nom bo'yicha qidiruv. */
export function qatorNomzodlari(matn: string, obyektNomlari: readonly string[], holatlar: readonly T2QatorHolat[], raqamlar: ReadonlyMap<number, string | null>): T2QatorHolat[] {
  const ishlar = holatlar.filter((h) => h.tur === 'bl' || h.tur == null);
  const raqam = matn.match(/(\d+)\s*-?\s*(?:qator|ish|pozitsiya|позици|строк)\w*/iu)?.[1] ?? matn.match(/(?:qator|№)\s*(\d+)/iu)?.[1];
  if (raqam) {
    const r = ishlar.filter((h) => String(raqamlar.get(h.qator_id) ?? '').trim() === raqam);
    if (r.length) return r;
  }
  const shifr = matn.match(/[\p{L}]+-?\d+(?:[.-]\d+)*/gu)?.filter((x) => !/^[mм][23]$/iu.test(x) && !/^\d+$/.test(x)) ?? [];
  for (const k of shifr) {
    const r = ishlar.filter((h) => (h.kod ?? '').toLowerCase().replace(/\s/g, '') === k.toLowerCase());
    if (r.length) return r;
  }
  let t = matn.replace(/\d[\d.,]*\s*(?:m3|м3|m2|м2|kg|кг|tonna|t|тн|dona|шт|pm|m|м|l|л)\b/giu, ' ').replace(/\d+\s*-?\s*(?:qator|ish)\w*/giu, ' ');
  for (const o of obyektNomlari) t = t.replace(new RegExp(`${o.split(/\s+/)[0].slice(0, Math.max(4, o.split(/\s+/)[0].length - 2))}\\w*`, 'iu'), ' ');
  const sozlar = t.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !TO_LDIRUVCHI.has(w.toLowerCase()) && !/^\d+$/.test(w));
  if (!sozlar.length) return [];
  const mos = qidiruvTayyorla(sozlar.join(' '));
  return ishlar.filter((h) => mos(`${h.kod ?? ''} ${h.nom ?? ''}`));
}

const holatMap = (s: { malumot: Record<string, unknown> }): Map<number, T2QatorHolat> => (s.malumot.holat as Map<number, T2QatorHolat>) ?? new Map();

export const IJROCHILAR: Readonly<Record<string, Ijrochi>> = {
  /* 1) FAKT — naqsh bilan: obyekt (kontekst/nom) + qator (raqam/shifr/nom) + hajm; birlik mos kelmasa so'raladi */
  'fakt.kiritish': {
    nomzod: {
      qator: async (p, ctx, s) => {
        const r = await daraxtVaHolatOl(Number(p.obyekt));
        if (!r.ok) return [];
        const m = new Map(r.states.map((h) => [h.qator_id, h])); s.malumot.holat = m;
        const raqamlar = new Map(r.rows.map((q) => [q.id, q.raqam]));
        const topildi = qatorNomzodlari(s.matn, ctx.obyektlar.map((o) => o.nom), r.states, raqamlar);
        return topildi.slice(0, 3).map((h): Nomzod => ({ id: h.qator_id, nom: `${raqamlar.get(h.qator_id) ? `${String(raqamlar.get(h.qator_id))}. ` : ''}${h.kod ?? ''} ${h.nom ?? ''} (${h.birlik ?? '—'}; smeta ${h.smeta_hajm ?? '—'}, fakt ${h.fakt_hajm})`.replace(/\s+/g, ' ').trim() }));
      },
    },
    tekshir: async (p, _ctx, s) => {
      if (s.malumot.birlikTekshirildi) return null;
      s.malumot.birlikTekshirildi = true;
      const h = holatMap(s).get(Number(p.qator));
      const yozilgan = s.matn.match(BIRLIK_RE)?.[1];
      if (!h || !yozilgan || birlikNorm(yozilgan) === birlikNorm(h.birlik)) return null;
      return { param: 'hajm', tozala: ['hajm'], savol: `Qatorning birligi «${h.birlik ?? '—'}», siz «${yozilgan}» dedingiz. Hajmni «${h.birlik ?? '—'}» da yozing (raqam bilan) — birlikni o‘zim o‘zgartirmayman.` };
    },
    korinish: (p, ctx, s) => {
      const h = s ? holatMap(s).get(Number(p.qator)) : undefined;
      const hajm = Number(p.hajm);
      if (!h) return { matn: `Fakt yoziladi: qator #${String(p.qator)}, ${String(hajm)} — obyekt: ${obyektNomi(ctx, p.obyekt)}.` };
      const jami = yaxlit2(h.fakt_hajm + hajm);
      const oshadi = h.smeta_hajm != null && jami > h.smeta_hajm;
      return { matn: `Fakt yoziladi (${obyektNomi(ctx, p.obyekt)}):\n«${h.kod ?? ''} ${h.nom ?? ''}»\nBugungi hajm: +${hajm} ${h.birlik ?? ''}\nSmeta: ${h.smeta_hajm ?? '—'}; hozirgacha fakt: ${h.fakt_hajm}; yangi jami: ${jami}${oshadi ? `\n⚠ SMETADAN OSHADI: ${yaxlit2(jami - (h.smeta_hajm as number))} ${h.birlik ?? ''} ortiqcha — qo‘shimcha ish yoki zamena kerak bo‘lishi mumkin.` : ''}` };
    },
    ijro: async (p, ctx, operationId) => {
      const r = await sbFaktYoz({ obyektId: Number(p.obyekt), sana: sana(ctx.bugun), qatorlar: [{ qator_id: Number(p.qator), hajm: Number(p.hajm) }], operationId });
      return (r as { ok?: boolean }).ok ? { ok: true, xabar: 'Fakt yozildi.', havola: `/admin/fakt?obyekt=${String(p.obyekt)}` } : { ok: false, xabar: xato(r as { error?: string }, 'Fakt yozilmadi.') };
    },
  },
  /* 2) Hujjatni tomonga yuborish (F2 / АОСР): aloqa va hujjat nomzodlari */
  'tomon.taqdim': {
    nomzod: {
      aloqa: async (_p, ctx, s) => aloqaNomzod(ctx, s.matn),
      manba: async (p, ctx, s) => {
        if (ctx.kompaniyaId == null) return [];
        const resurs = /aosr|аосr|акт скрыт/iu.test(s.matn) ? 'aosr' : 'f2'; s.malumot.resurs = resurs;
        const r = await hujjatRoyxatOl({ kompaniyaId: ctx.kompaniyaId, obyektId: ctx.obyektId ?? undefined, limit: 200 });
        const mos = (r.documents || []).filter((d) => String(d.type).includes(resurs === 'f2' ? 'f2' : 'aosr')) as Array<{ id: number | string; filename: string }>;
        p.resurs = resurs; return mos.sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 3).map((d) => ({ id: Number(d.id), nom: d.filename }));
      },
    },
    korinish: (p, _ctx, s) => ({ matn: `Hujjat tomonga YUBORILADI: ${String((s?.malumot.manbaNom as string) ?? `#${String(p.manba)}`)} → ${String((s?.malumot.aloqaNom as string) ?? `aloqa #${String(p.aloqa)}`)}. Tomon uni ko‘radi va qaror beradi.` }),
    ijro: async (p, ctx, operationId) => {
      void operationId;
      if (ctx.kompaniyaId == null) return { ok: false, xabar: 'Kompaniya tanlanmagan.' };
      const r = await taqdimYubor(ctx.kompaniyaId, Number(p.aloqa), String(p.resurs ?? 'f2'), Number(p.manba));
      return tomonNatija(r, 'Hujjat tomonga yuborildi.', '/admin/taqdimlar', 'Yuborilmadi.');
    },
  },
  /* 3) Kelgan hujjatga qaror: qabul / tuzatish / rad (sabab bilan) — ikki tasdiq */
  'tomon.qaror': {
    nomzod: {
      taqdim: async (_p, ctx, s) => {
        if (ctx.kompaniyaId == null) return [];
        const r = await taqdimlarOl(ctx.kompaniyaId, { yonalish: 'kelgan', holat: 'yuborilgan' });
        if (!r.ok) return [];
        const mos = qidiruvTayyorla(s.matn.replace(/\b(qabul|rad|tuzatish|qil|qilish|принять|отклонить)\w*/giu, ' '));
        const royxat = r.natija.filter((t) => mos(`${t.nom} ${t.qarshi_nom ?? ''} ${t.obyekt_nom ?? ''}`) || r.natija.length <= 3);
        for (const t of royxat) (s.malumot.taqdimlar ??= {} as Record<string, unknown>) && ((s.malumot.taqdimlar as Record<string, unknown>)[String(t.id)] = t);
        return royxat.slice(0, 3).map((t) => ({ id: t.id, nom: `${t.nom} — ${t.qarshi_nom ?? ''}${t.summa != null ? ` (${som(t.summa)})` : ''}` }));
      },
    },
    tekshir: async (p) => (p.qaror !== 'qabul' && !p.izoh ? { param: 'izoh', savol: `«${String(p.qaror)}» uchun sababini qisqa yozing.` } : null),
    korinish: (p, _ctx, s) => {
      const t = (s?.malumot.taqdimlar as Record<string, { nom: string; qarshi_nom: string | null; summa: number | null }> | undefined)?.[String(p.taqdim)];
      return { summa: t?.summa ?? null, matn: `QAROR: «${String(p.qaror)}» — ${t ? `${t.nom} (${t.qarshi_nom ?? ''})${t.summa != null ? `, summa ${som(t.summa)}` : ''}` : `hujjat #${String(p.taqdim)}`}${p.izoh ? `\nSabab: ${String(p.izoh)}` : ''}\nQaror yuboruvchiga ko‘rinadi.` };
    },
    ijro: async (p, ctx) => {
      if (ctx.kompaniyaId == null) return { ok: false, xabar: 'Kompaniya tanlanmagan.' };
      const r = await taqdimQarori(ctx.kompaniyaId, Number(p.taqdim), String(p.qaror) as 'qabul' | 'rad' | 'tuzatish', p.izoh ? String(p.izoh) : undefined);
      return tomonNatija(r, 'Qaror yozildi.', '/admin/taqdimlar', 'Qaror yozilmadi.');
    },
  },
  /* 4) Murojaat / remark / predpisaniya yaratish */
  'tomon.murojaat': {
    nomzod: {
      aloqa: async (_p, ctx, s) => aloqaNomzod(ctx, s.matn),
      turi: async (_p, ctx, s) => {
        if (ctx.kompaniyaId == null) return [];
        const r = await murojaatTurlariOl(ctx.kompaniyaId);
        if (!r.ok) return [];
        const mos = qidiruvTayyorla(s.matn);
        const t = r.natija.filter((x) => mos(`${x.kalit} ${x.nom} ${x.nom_ru ?? ''}`));
        return (t.length ? t : r.natija).slice(0, 3).map((x) => ({ id: x.kalit, nom: x.nom }));
      },
    },
    korinish: (p, ctx) => ({ matn: `Murojaat yaratiladi: «${String(p.sarlavha)}» (tur: ${String(p.turi)})${ctx.obyektId ? `, obyekt: ${obyektNomi(ctx, ctx.obyektId)}` : ''}. Tomon ko‘radi va javob beradi.` }),
    ijro: async (p, ctx) => {
      if (ctx.kompaniyaId == null) return { ok: false, xabar: 'Kompaniya tanlanmagan.' };
      const r = await murojaatYarat(ctx.kompaniyaId, { aloqaId: Number(p.aloqa), turi: String(p.turi), sarlavha: String(p.sarlavha), obyektId: ctx.obyektId });
      return tomonNatija(r, 'Murojaat yaratildi.', '/admin/murojaatlar', 'Murojaat yaratilmadi.');
    },
  },
  /* 7) Laboratoriyaga sinov so'rovi */
  'lab.sorov': {
    nomzod: { aloqa: async (_p, ctx, s) => aloqaNomzod(ctx, s.matn, 'laboratoriya') },
    korinish: (p, ctx) => ({ matn: `Laboratoriyaga sinov so‘rovi: «${String(p.sinovTuri)}» — obyekt: ${obyektNomi(ctx, p.obyekt)}. Laboratoriya natijani o‘zi to‘ldiradi.` }),
    ijro: async (p, ctx) => {
      if (ctx.kompaniyaId == null) return { ok: false, xabar: 'Kompaniya tanlanmagan.' };
      const r = await sorovYubor(ctx.kompaniyaId, { aloqaId: Number(p.aloqa), sinovTuri: String(p.sinovTuri), obyektId: Number(p.obyekt) });
      return tomonNatija(r as Tomon<unknown>, 'Sinov so‘rovi yuborildi.', '/admin/laboratoriya', 'So‘rov yuborilmadi.');
    },
  },
  /* 12) Buxgalteriya davrini yopish — ikki tasdiq */
  'bux.davr': {
    korinish: (p) => ({ matn: `Buxgalteriya davri YOPILADI: ${String(p.oy)}. Yopilgan davrga yangi provodka yozib bo‘lmaydi (qayta ochish alohida amal).` }),
    ijro: async (p, ctx, operationId) => {
      if (ctx.kompaniyaId == null) return { ok: false, xabar: 'Kompaniya tanlanmagan.' };
      const r = await buxDavr({ kompaniyaId: ctx.kompaniyaId, oy: String(p.oy), amal: 'yop', tasdiq: true, operationId });
      return (r as { ok?: boolean }).ok ? { ok: true, xabar: `${String(p.oy)} davri yopildi.`, havola: '/admin/buxgalteriya' } : { ok: false, xabar: xato(r as { error?: string }, 'Davr yopilmadi.') };
    },
  },
  /* ── Oldingi (3-qadam boshi) ijrochilar ─────────────────────────────────────────────────────────────────────── */
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

/** Faol aloqalar (tomonlar): so'rovdagi nom/rol bo'yicha filtr (buyurtmachi -> zakazchik …); `rol` berilsa faqat shu qarshi rol. */
async function aloqaNomzod(ctx: AmalKontekst, matn: string, rol?: string): Promise<Nomzod[]> {
  if (ctx.kompaniyaId == null) return [];
  const r = await aloqalarOl(ctx.kompaniyaId);
  if (!r.ok) return [];
  let royxat = r.natija.filter((a) => a.holat === 'faol');
  if (rol) royxat = royxat.filter((a) => a.qarshi_rol === rol);
  const ROL_SIN: Record<string, string> = { buyurtmachi: 'zakazchik', заказчик: 'zakazchik', texnadzor: 'texnadzor', loyihachi: 'loyihachi', laboratoriya: 'laboratoriya', yetkazuvchi: 'taminotchi', поставщик: 'taminotchi', subpudratchi: 'subpudratchi' };
  const t = matn.toLowerCase();
  const rollar = Object.entries(ROL_SIN).filter(([k]) => t.includes(k)).map(([, v]) => v);
  const nomli = royxat.filter((a) => rollar.includes(a.qarshi_rol) || (a.qarshi_nom && a.qarshi_nom.length >= 4 && t.includes(a.qarshi_nom.toLowerCase().slice(0, Math.max(4, a.qarshi_nom.length - 2)))));
  return (nomli.length ? nomli : royxat).slice(0, 3).map((a) => ({ id: a.id, nom: `${a.qarshi_nom} (${a.qarshi_rol})` }));
}