import { sbOqi, sbT2DaraxtOl, sbT2QatorHolatOl, type T2Qator, type T2QatorHolat } from './supabase';
import { t2ObyektNakrutka } from './t2-nakrutka';
import { obyektPodvaliOqi, ustamaKontekstXatosi } from './t2-nakrutka-podval';
import { dalilYigish, type AktQatorXom, type AktXom, type DalilXarita, type ObosnovanieKirish } from '../lib/fakt-obosnovanie';
import { yaxlitQatorIdlari } from '../lib/svod-yaxlit';

/**
 * «Основание» ustuni uchun dalil (faqat o'qish): obyektning bekor qilinmagan fakt va F2 hujjatlari (№, sana, holat, izoh)
 * va ularning qator bog'lanishlari. Hisob-kitobga ta'sir qilmaydi — faqat fakt qaysi hujjatga tayanishini ko'rsatadi.
 */
export async function sbFaktDalilOl(obyektId: number): Promise<{ ok: boolean; dalil: DalilXarita; error?: string }> {
  const bosh = new Map() as DalilXarita;
  const a = await sbOqi<AktXom>({
    jadval: 't2_akt', filtr: `obyekt_id=eq.${obyektId}&tur=in.(fakt,f2)&holat=neq.bekor`, ustunlar: 'id,tur,raqam,sana,izoh,holat', limit: 20000,
  });
  if (!a.ok) return { ok: false, dalil: bosh, error: a.error };
  const aktlar = (a.qatorlar ?? []).filter((x) => x.tur === 'fakt' || (x.tur === 'f2' && (x.holat === 'tasdiqlangan' || x.holat === 'qoralama')));
  const qatorlar: AktQatorXom[] = [];
  for (let i = 0; i < aktlar.length; i += 100) {
    const ids = aktlar.slice(i, i + 100).map((x) => x.id).filter((x) => Number.isSafeInteger(x) && x > 0);
    if (!ids.length) continue;
    const q = await sbOqi<AktQatorXom>({ jadval: 't2_akt_qator', filtr: `akt_id=in.(${ids.join(',')})&hajm=neq.0`, ustunlar: 'akt_id,qator_id', limit: 200000 });
    if (!q.ok) return { ok: false, dalil: bosh, error: q.error };
    qatorlar.push(...(q.qatorlar ?? []));
  }
  return { ok: true, dalil: dalilYigish(aktlar, qatorlar) };
}

export type ObosnovanieYuklash =
  | { ok: true; kirish: ObosnovanieKirish; ogohlantirish: string[] }
  | { ok: false; xato: string };

/**
 * Bitta obyekt uchun hujjat kirishi: smeta daraxti + holat (berilmasa o'qiladi), dalil, ustama konteksti.
 * Dalil yoki ustama o'qilmasa hujjat bloklanmaydi — mos ustun/jamilar bo'sh qoladi va ogohlantirish qaytadi (taxmin yo'q).
 */
export async function obosnovanieObyektYukla(
  kompaniyaId: number,
  obyekt: { id: number; nom: string },
  tayyor?: { qatorlar: readonly T2Qator[]; holatlar: readonly T2QatorHolat[] } | null,
): Promise<ObosnovanieYuklash> {
  const ogohlantirish: string[] = [];
  let qatorlar = tayyor?.qatorlar;
  let holatlar = tayyor?.holatlar;
  if (!qatorlar || !holatlar) {
    const [d, h] = await Promise.all([sbT2DaraxtOl(obyekt.id), sbT2QatorHolatOl(obyekt.id)]);
    if (!d.ok || !h.ok) return { ok: false, xato: `${obyekt.nom}: smeta yoki holat o‘qilmadi` };
    qatorlar = d.qatorlar ?? [];
    holatlar = h.qatorlar ?? [];
  }
  const [dl, nk] = await Promise.all([sbFaktDalilOl(obyekt.id).catch(() => null), t2ObyektNakrutka(obyekt.id).catch(() => null)]);
  if (!dl?.ok) ogohlantirish.push(`${obyekt.nom}: asos (jurnal / Ф-2 №) o‘qilmadi`);
  const pod = nk?.ok ? await obyektPodvaliOqi(kompaniyaId, obyekt.id, nk.shartnoma_id ?? null, nk.nakrutka_podval_id ?? null) : null;
  const xato = ustamaKontekstXatosi(nk, pod);
  const kontekst = xato || !nk?.ok || !pod?.ok ? null : {
    nakrutka: nk.koeffitsientlar ?? null, podval: pod.podval, nkManba: nk.nk_manba ?? null,
    yaxlitIdlar: yaxlitQatorIdlari(qatorlar, nk.svod_yaxlit ?? null),
  };
  if (xato) ogohlantirish.push(`${obyekt.nom}: ${xato} — ustamali va QQS bilan summa aniqlanmadi`);
  return { ok: true, ogohlantirish, kirish: { obyektId: obyekt.id, obyektNomi: obyekt.nom, qatorlar, holatlar, dalil: dl?.ok ? dl.dalil : null, kontekst } };
}
