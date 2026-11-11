/**
 * Ish varag'i «F2» rejimi — tarmoq qatlami. Yozish yo'llari MAVJUD (yangi dvigatel/route/migratsiya yo'q):
 * mavjud qoralama — `sbT2F2QoralamaYangila` (CAS: kutilgan versiya), yo'q bo'lsa — `sbT2AktYaratV2` (+ token, F2 tayyorlash bilan bir xil).
 * F2 hech qachon TASDIQLANMAYDI — faqat joriy oyning qoralamasi.
 */
import { sbOqi, sbT2AktYaratV2, sbT2F2QoralamaYangila, yangiOperationId } from '../../api/supabase';
import { sbF2QoralamaHajmlar } from '../../api/t2-fakt';
import { amaldagiProtokolNarxlari, narxProtokolQatorlariOl } from '../../api/t2-narx-protokol';
import { t2ToliqOqi } from '../../api/t2-toliq-oqish';
import { tokenBilan } from '../../api/t2-token';
import { zamenaToliqOqi } from '../fakt-zamena-boglanish';
import { f2YozishXatoMatni } from '../f2-tayyor-sabab';
import { f2Yacheykalar, type ProtokolNarxlari } from '../f2-tayyor';
import type { F2NativePayloadRow } from '../f2-native-preparation';
import { t } from '../../i18n/til';
import type { AktBand } from '../f2-akt-kiritma';

export type F2Qoralama = { id: number; raqam: string | null; oy: string | null; versiya: number; qatorlar: AktBand[] };
export type F2Yuklangan = {
  akt: F2Qoralama | null;
  aktlar: ReadonlyArray<{ raqam: string | null; holat: string }>;
  protokolNarx: ProtokolNarxlari;
  qoralamaHajm: ReadonlyMap<number, number>;
  zamenaAsl: ReadonlyMap<number, number>;
  miqdor: ReadonlyMap<number, number>;
};

/** Joriy oy boshi: `YYYY-MM-01` (F2 tayyorlash bilan bir xil). */
export const joriyOyBoshi = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

type AktSarlavha = { id: number; raqam: string | null; oy: string | null; holat: string; lifecycle_status: string | null; versiya: number | null };

/**
 * Joriy oyning F2 qoralamasi va narx/zamena manbalarini o'qiydi. BIRORTA o'qish muvaffaqiyatsiz bo'lsa — xato (jim bo'sh qiymat
 * narxni buzardi: protokol narxi yo'qolsa qoralama noto'g'ri narxda yoziladi).
 */
export async function f2ManbalarOqi(obyektId: number, oy: string): Promise<{ ok: true; v: F2Yuklangan } | { ok: false; sabab: string }> {
  try {
    const aktlarR = await t2ToliqOqi<AktSarlavha>(sbOqi, { jadval: 't2_akt', filtr: `obyekt_id=eq.${obyektId}&tur=eq.f2`, ustunlar: 'id,raqam,oy,holat,lifecycle_status,versiya', limit: 50000 }, 'id');
    if (!aktlarR?.ok || aktlarR.toliq === false) return { ok: false, sabab: t('F2 qoralamalari o‘qilmadi.') };
    const aktlar = aktlarR.qatorlar ?? [];
    // Shu oy uchun eng yangi QORALAMA (F2 tayyorlashdagi «davom» qoidasi bilan bir xil).
    const joriy = aktlar
      .filter((a) => a.holat === 'qoralama' && (a.lifecycle_status ?? 'draft') === 'draft' && String(a.oy ?? '').slice(0, 7) === oy.slice(0, 7))
      .sort((a, b) => b.id - a.id)[0];
    const [qR, pR, hR, zR] = await Promise.all([
      joriy
        ? t2ToliqOqi<AktBand>(sbOqi, { jadval: 't2_akt_qator', filtr: `akt_id=eq.${joriy.id}&obyekt_id=eq.${obyektId}`, ustunlar: 'id,qator_id,hajm,certified_quantity,certified_unit_price,certified_amount,provenance_status,raw_snapshot', limit: 200000 }, 'id')
        : Promise.resolve(null),
      narxProtokolQatorlariOl(obyektId),
      sbF2QoralamaHajmlar(obyektId, joriy?.id ?? null),
      zamenaToliqOqi(obyektId),
    ]);
    if (joriy && (!qR?.ok || qR.toliq === false)) return { ok: false, sabab: t('F2 qoralama qatorlari to‘liq o‘qilmadi.') };
    if (!pR?.ok || pR.toliq === false) return { ok: false, sabab: t('Narx protokollari o‘qilmadi — narx noto‘g‘ri bo‘lmasligi uchun F2 yozilmaydi.') };
    if (!hR.ok) return { ok: false, sabab: t('Boshqa F2 qoralamalaridagi hajm o‘qilmadi.') };
    if (!zR.ok) return { ok: false, sabab: t('Zamena bog‘lanishi o‘qilmadi.') };
    const protokol = (pR.qatorlar ?? []).filter((x: { holat?: string }) => x.holat === 'tasdiqlangan');
    return {
      ok: true,
      v: {
        akt: joriy ? { id: joriy.id, raqam: joriy.raqam, oy: joriy.oy, versiya: Number(joriy.versiya ?? 0), qatorlar: qR?.qatorlar ?? [] } : null,
        aktlar: aktlar.map((a) => ({ raqam: a.raqam, holat: a.holat })),
        protokolNarx: amaldagiProtokolNarxlari(protokol, oy),
        qoralamaHajm: hR.hajm,
        zamenaAsl: zR.natija.boglanish.almashtiradi,
        miqdor: zR.natija.miqdor,
      },
    };
  } catch { return { ok: false, sabab: t('F2 ma‘lumotlari o‘qilmadi. Qayta urinib ko‘ring.') }; }
}

export type F2YozNatija = { ok: true; aktId: number; yangi: boolean; sarflandi?: number } | { ok: false; matn: string; stale?: boolean };

/** BITTA yozish chaqiruvi: mavjud qoralama bo'lsa yangilanadi (CAS), bo'lmasa shu oyga yangi qoralama yaratiladi. */
export async function f2QoralamaYoz(o: {
  kompaniyaId: number; obyektId: number; oy: string; akt: F2Qoralama | null; aktlar: F2Yuklangan['aktlar']; raqam: string;
  yuk: readonly F2NativePayloadRow[]; operationId: string;
}): Promise<F2YozNatija> {
  const qatorlar = [...o.yuk];
  if (o.akt) {
    const r = await sbT2F2QoralamaYangila({ kompaniyaId: o.kompaniyaId, aktId: o.akt.id, kutilganVersiya: o.akt.versiya, operationId: o.operationId, qatorlar });
    if (!r.ok) {
      if (r.code === 'STALE_VERSION') return { ok: false, stale: true, matn: t('Qoralama boshqa oynada o‘zgargan — F2 rejimini qayta oching (qoralama qayta o‘qiladi).') };
      return { ok: false, matn: f2YozishXatoMatni(r, t('F2 qoralama yangilanmadi.')) };
    }
    return { ok: true, aktId: o.akt.id, yangi: false };
  }
  const yacheyka = f2Yacheykalar(qatorlar);
  const tk = await tokenBilan({ kompaniyaId: o.kompaniyaId, amal: 'f2_qoralama', birlikSoni: yacheyka, meta: { obyekt: o.obyektId, qator: qatorlar.length, yacheyka } }, async () => {
    const r = await sbT2AktYaratV2({ obyektId: o.obyektId, oy: o.oy, operationId: o.operationId, qatorlar, raqam: o.raqam.trim() || undefined });
    if (!r.ok) throw new Error(f2YozishXatoMatni(r as typeof r & { code?: string }, t('F2 qoralama yaratilmadi.')));
    return r;
  });
  if (!tk.ok) return { ok: false, matn: tk.xabar };
  const aktId = Number((tk.natija as { akt_id?: unknown; id?: unknown }).akt_id ?? (tk.natija as { id?: unknown }).id ?? 0);
  return { ok: true, aktId, yangi: true, sarflandi: tk.sarflandi };
}

export const yangiF2OperationId = yangiOperationId;
