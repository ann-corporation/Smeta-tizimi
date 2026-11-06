import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import type { SaqlanganAktQator, StornoDaraxtTugun, StornoManbaQator } from '../../lib/f2-storno';
import { stornoBlokHolati, stornoBlokQur, stornoDaraxtQur, stornoJamlar, stornoUmumiy, type StornoSaqlanganQator } from '../../lib/f2-storno-daraxt';
import { f2StornoDaraxtOl, f2StornoHolatOl, f2StornoManbaOl, type StornoQatorKorinish } from '../../api/t2-f2-storno';
import { F2StornoDaraxtRoyxat } from './F2StornoDaraxtRoyxat';

const kalit = (aktId: number, qatorId: number) => `${aktId}:${qatorId}`;

/**
 * Pereraschet QORALAMASIDAGI «Сторно (eski F2)» blokini tahrirlash (egasi 2026-11-06: «storno dan keyin tekshirish tahrirlash»).
 * Manba — har storno qatorining `stornoOf` eski F2 si (faqat o'qish). Shu daraxtda qatorni / butun razdelni stornodan olish yoki
 * qayta qo'shish, storno hajmini qisman qilish (0 < h ≤ eski F2 hajmi). Natija `onOzgar` bilan F2 tayyorlashga qaytadi va
 * odatdagi «Saqlash» (`stornoBlokniSaqla` → `t2_f2_qoralama_yangila_v1`) bilan yoziladi — yangi RPC yo'q.
 * Fakt bu yerda yozilmaydi: storno paytida «0 ga» tushirilgan fakt stornodan olingan qatorda o'zicha qaytmaydi (ogohlantiriladi).
 */
export function F2StornoBlokTahrir(p: {
  obyektId: number;
  /** Joriy (tahrirlangan bo'lsa — tahrirlangan) storno qatorlari. */
  saqlangan: readonly SaqlanganAktQator[];
  /** Qoralamaning AYNAN saqlangan storno qatorlari (o'zgarmagan qatorlar shu nusxadan qaytadi). */
  asl: readonly SaqlanganAktQator[];
  onOzgar: (qatorlar: StornoSaqlanganQator[]) => void;
  onBekor: () => void;
  aktRaqami?: (id: number) => string | null;
}) {
  const boshHolat = useMemo(() => stornoBlokHolati(p.saqlangan, kalit), [p.saqlangan]);
  const [manba, setManba] = useState<Array<{ aktId: number; qatorlar: StornoManbaQator[] }> | null>(null);
  const [nomlar, setNomlar] = useState<ReadonlyMap<number, StornoQatorKorinish>>(new Map());
  const [daraxt, setDaraxt] = useState<StornoDaraxtTugun[] | null>(null);
  const [xato, setXato] = useState('');
  const [tanlangan, setTanlangan] = useState<ReadonlySet<string>>(boshHolat.tanlangan);
  const [hajm, setHajm] = useState<ReadonlyMap<string, number>>(boshHolat.hajm);
  const aktIdlar = boshHolat.manbaAktlar.join(',');

  useEffect(() => {
    let jonli = true;
    const ids = aktIdlar ? aktIdlar.split(',').map(Number) : [];
    void (async () => {
      try {
        const [m, h, d] = await Promise.all([Promise.all(ids.map((a) => f2StornoManbaOl(a, p.obyektId))), f2StornoHolatOl(p.obyektId), f2StornoDaraxtOl(p.obyektId).catch(() => null)]);
        if (!jonli) return;
        if (m.some((x) => !x.ok)) { setXato(t('Eski F2 qatorlari o‘qilmadi — storno blokini tahrirlab bo‘lmaydi. Qayta urinib ko‘ring.')); return; }
        setManba(ids.map((a, i) => ({ aktId: a, qatorlar: m[i].qatorlar })));
        if (h.ok) setNomlar(new Map(h.qatorlar.map((x) => [x.qator_id, x] as const)));
        setDaraxt(d?.ok ? d.qatorlar : null);
      } catch { if (jonli) setXato(t('Eski F2 qatorlari o‘qilmadi — storno blokini tahrirlab bo‘lmaydi. Qayta urinib ko‘ring.')); }
    })();
    return () => { jonli = false; };
  }, [aktIdlar, p.obyektId]);

  const aktRaqami = p.aktRaqami;
  const tree = useMemo(() => (manba ? stornoDaraxtQur({
    bloklar: manba.map((b) => ({ aktId: b.aktId, aktNom: aktRaqami?.(b.aktId) || String(b.aktId), qatorlar: b.qatorlar })), daraxt, nomlar, kalit,
  }) : null), [manba, daraxt, nomlar, aktRaqami]);
  const jam = useMemo(() => stornoJamlar(tree?.ildiz ?? [], tanlangan), [tree, tanlangan]);
  const umumiy = useMemo(() => (tree ? stornoUmumiy(tree.ildiz, jam) : null), [tree, jam]);
  const natija = useMemo(() => (manba ? stornoBlokQur(manba, tanlangan, hajm, p.asl, kalit) : null), [manba, tanlangan, hajm, p.asl]);
  /** Storno paytida fakt «0 ga» tushirilgan bo'lishi mumkin: stornodan olingan qatorlar soni (fakt o'zicha qaytmaydi). */
  const olingan = useMemo(() => [...boshHolat.tanlangan].filter((k) => !tanlangan.has(k)).length, [boshHolat, tanlangan]);

  return (
    <section data-testid="storno-blok-tahrir" aria-label={t('Storno blokini tahrirlash')} className="fz-card space-y-2 p-3 text-[13px]">
      <p className="text-text-dim">{t('Belgini olish — qator yoki razdel stornodan chiqadi; belgilash — eski F2 qiymatida qayta stornoga kiradi. Storno hajmini qisman qilish mumkin (eski F2 hajmidan oshmaydi). Saqlash — sahifadagi «Saqlash» tugmasi bilan.')}</p>
      {xato && <p role="alert" className="fz-note fz-note--danger"><ShieldAlert />{xato}</p>}
      {!xato && !tree && <div className="skel min-h-[100px] rounded-xl" />}
      {tree && (
        <F2StornoDaraxtRoyxat tree={tree} jam={jam} tanlangan={tanlangan} onTanlangan={setTanlangan} qulf={false}
          faktOl={(id) => { const f = nomlar.get(id)?.fakt_hajm; return f == null ? null : Number(f); }}
          hajm={{ ol: (q) => hajm.get(q.kalit) ?? Math.abs(q.hajm ?? 0), qoy: (q, v) => setHajm((m) => new Map(m).set(q.kalit, v)) }} />
      )}
      {natija && umumiy && (
        <p data-testid="storno-blok-tahrir-jam" className="tabular-nums">
          {t('Storno: {n} qator', { n: natija.qatorlar.length })} · <FmtN val={umumiy.jami} />
          {natija.qisman > 0 && <> · {t('qisman hajm: {n}', { n: natija.qisman })}</>}
          {umumiy.qolganSoni > 0 && <> · {t('qoladi: {n}', { n: umumiy.qolganSoni })}</>}
        </p>
      )}
      {natija && natija.toqnashdi > 0 && <p className="fz-note fz-note--warn"><ShieldAlert />{t('{n} ta qator bir nechta eski F2 da bor: bitta hujjatda bir pozitsiya ikki marta bo‘lmaydi — keyingi F2 dagisi tashlandi.', { n: natija.toqnashdi })}</p>}
      {olingan > 0 && <p data-testid="storno-blok-fakt-ogoh" className="fz-note fz-note--warn"><ShieldAlert />{t('{n} qator stornodan olindi. Storno yaratilganda fakt 0 ga tushirilgan bo‘lsa, bu qatorlar fakti o‘zicha qaytmaydi — kerak bo‘lsa faktni qayta kiriting.', { n: olingan })}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={p.onBekor}>{t('Tahrirni bekor qilish')}</button>
        <button type="button" data-testid="storno-blok-qollash" className="fz-btn fz-btn--sm" disabled={!natija || natija.qatorlar.length === 0} onClick={() => natija && p.onOzgar(natija.qatorlar)}>
          {t('Storno blokiga qo‘llash ({n} qator)', { n: natija?.qatorlar.length ?? 0 })}
        </button>
      </div>
    </section>
  );
}

export default F2StornoBlokTahrir;
