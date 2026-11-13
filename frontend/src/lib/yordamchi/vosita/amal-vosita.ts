/**
 * AMAL REESTRI -> JARVIS VOSITASI (ekotizim V2): lib/reestr/amal.ts dagi HAR amal avtomatik Jarvis vositasiga aylanadi.
 * Parallel ta'rif YO'Q: nom, sinonim, ruxsat (capability), parametr sxemasi, tasdiq darajasi — hammasi Amal yozuvidan;
 * bajaruvchi — amal-ijro.ts dagi ijrochi (mavjud API klientlari). Ijrochisi yo'q amal — sahifaga yo'naltirish (havola).
 * Yozuv amali taklif kartasi qaytaradi; bajarish faqat foydalanuvchi tasdig'idan keyin (ikkiTasdiq/pul — ikkinchi «Tasdiqlayman»);
 * operation_id taklif tuzilganda bir marta olinadi (c.opId()), aktor serverda sessiyadan (vositaga aktor parametri yo'q).
 * Nomi bir xil QO'LDA vosita bor bo'lsa (reestr.ts) — u ustun, bu yerdan yaratilmaydi.
 */
import type { Amal, AmalParamTur } from '../../reestr/amal';
import { AMAL_IJRO_KALITLAR } from '../../reestr/amal-ijro-kalitlar';
import { amalTopish, bajar, holatAsync, javobQabul, korinish, sessiyaBosh, type AmalKontekst, type AmalSessiya, type Ijrochi } from '../../reestr/amal-motor';
import type { ParamSxema, ParamTur, Slot, Variant, Vosita, VositaJavob, VositaKont } from './tur';

const PARAM_TUR: Record<AmalParamTur, ParamTur> = { son: 'son', matn: 'matn', sana: 'sana', obyekt: 'tanlov', shartnoma: 'tanlov', qator: 'tanlov', tanlov: 'tanlov' };

/**
 * Ijrochilar (API klientlari) ilova ishga tushganda ulanadi (AiHelper): vosita reestri sof qoladi, Cloudflare Functions type gate
 * brauzer kodiga kirib ketmaydi. Ulanmagan bo'lsa (masalan serverda) — vosita sahifaga yo'naltiradi.
 */
let ijroYuklovchi: (() => Promise<Readonly<Record<string, Ijrochi>>>) | null = null;
export function amalIjroniUla(f: () => Promise<Readonly<Record<string, Ijrochi>>>): void { ijroYuklovchi = f; }

/** Vosita nomi: Amal.jarvisVosita, bo'lmasa kalit (`.` -> `_`). */
export const amalVositaNomi = (a: Pick<Amal, 'kalit' | 'jarvisVosita'>): string => a.jarvisVosita ?? a.kalit.replace(/\./g, '_');

/** Oxirgi so'rov uchun bitta xotira: har vosita mos() ida amalTopish qayta hisoblanmasin. */
let oxirgi: { xom: string; kalit: string | null } | null = null;
function topilganKalit(xom: string): string | null {
  if (oxirgi?.xom === xom) return oxirgi.kalit;
  const t = amalTopish(xom);
  oxirgi = { xom, kalit: t?.tur === 'aniq' ? t.amal.kalit : null };
  return oxirgi.kalit;
}

async function amalKontekst(c: VositaKont): Promise<AmalKontekst> {
  let shartnomalar: AmalKontekst['shartnomalar'] = [];
  try { shartnomalar = ((await c.api.shartnomalar()) ?? []).map((s) => ({ id: s.id, raqam: s.raqam, nom: s.nom })); } catch { /* shartnomalarsiz davom */ }
  return { kompaniyaId: c.kompaniyaId, obyektId: c.obyekt?.id ?? null, obyektlar: c.obyektlar, shartnomalar, permissions: c.kim.ruxsatlar.length ? c.kim.ruxsatlar : null, superadmin: !!c.kim.platformSuperadmin, bugun: c.bugun ?? new Date() };
}

const javob = (matn: string, xato = false, yol?: string, nom?: string): VositaJavob => ({ tur: 'javob', matn, xato: xato || undefined, ...(yol ? { havolalar: [{ yol, nom: nom ?? yol }] } : {}) });

function savol(id: string, slot: Slot, s: AmalSessiya, matn: string): VositaJavob {
  const { __javob: _j, __kutilgan: _k, ...toza } = slot;
  const variantlar: Variant[] | undefined = s.tanlov ? s.tanlov.royxat.map((x, i) => ({ nom: x.nom, matn: String(i + 1) })) : undefined;
  return { tur: 'savol', matn, variantlar, davom: { id, slotlar: { ...toza, __amal: s }, kutilgan: s.savol?.param ?? '' } };
}

/** Bitta amaldan Vosita yasaydi. */
export function amalVositasi(amal: Amal): Vosita {
  const id = amalVositaNomi(amal);
  const ijBor = AMAL_IJRO_KALITLAR.has(amal.kalit);
  const parametrlar: ParamSxema = Object.fromEntries((amal.parametrlar ?? []).map((p) => [p.nom, { tur: PARAM_TUR[p.tur], majburiy: p.majburiy || undefined, izoh: p.savol }]));
  const pul = amal.tasdiq === 'ikkiTasdiq';
  /* Qator topish kerak amal (fakt) — mavjud model oqimida; nomi sahifa nomi bilan bir xil bo'lgani uchun navigatsiyani o'g'irlamaydi. */
  const qatorli = (amal.parametrlar ?? []).some((p) => p.tur === 'qator');
  return {
    id, tur: amal.turi, pul, hujjat: amal.mavzu?.includes('hujjat') || undefined, ruxsat: amal.capability, parametrlar,
    tavsif: amal.ai?.tavsif ?? `${amal.nom ?? amal.kalit} (amal reestridan).`,
    /* Yozuv amali niyati amalTopish bilan; o'qish amallari navigatsiya qatlamida hal qilinadi (LLM id bilan chaqirishi mumkin). */
    /* Qisqa (<=2 so'z) gap — sahifa nomi (navigatsiya): masalan «zayavka och». */
    mos: (t, xom) => ijBor && !qatorli && t.length > 2 && amal.turi === 'yozish' && topilganKalit(xom) === amal.kalit,
    ishla: async (c, slot, xom) => {
      if (!ijBor) return javob(`«${amal.nom ?? amal.kalit}» hozircha sahifada bajariladi — tugmani bosib o'ting.`, false, amal.yol, amal.nom);
      const ij = ijroYuklovchi ? (await ijroYuklovchi())[amal.kalit] : undefined;
      if (!ij) return javob(`«${amal.nom ?? amal.kalit}» hozircha sahifada bajariladi — tugmani bosib o'ting.`, false, amal.yol, amal.nom);
      const ctx = await amalKontekst(c);
      let s = slot.__amal as AmalSessiya | undefined;
      if (!s) s = sessiyaBosh(amal, xom, ctx, c.opId());
      else if (s.savol) {
        const r = javobQabul(amal, s, String(slot.__javob ?? ''), ctx);
        if (!r.ok) return savol(id, slot, s, r.matn);
      }
      const h = await holatAsync(amal, s, ctx, ij);
      if (s.modelga) return javob(`«${amal.nom ?? amal.kalit}»: qatorni aniq topa olmadim. Sahifada tanlab kiriting.`, false, amal.yol, amal.nom);
      if (h.tur === 'ruxsatYoq' || h.tur === 'topilmadi') return javob(h.matn, h.tur === 'topilmadi', amal.yol, amal.nom);
      if (h.tur === 'savol') return savol(id, slot, s, h.matn);
      const k = korinish(amal, s, ctx, ij);
      const sess = s;
      return {
        tur: 'taklif', nom: amal.nom ?? amal.kalit, izoh: k.matn, pul: pul || k.summa != null, matn: `${amal.nom ?? amal.kalit} — oldindan ko'rish tayyor. Hali bajarilmagan.`,
        bajar: async () => {
          try { const n = await bajar(amal, sess, { karta: true, ikkinchi: true }, ctx, ij); return [`${n.ok ? '✓' : '✗'} ${n.xabar}`]; }
          catch (e) { return [`✗ ${e instanceof Error ? e.message : String(e)}`]; }
        },
      };
    },
  };
}
