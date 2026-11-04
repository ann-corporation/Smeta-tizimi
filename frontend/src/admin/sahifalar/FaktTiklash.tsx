import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { yangiOperationId } from '../../api/supabase';
import { sbTiklashObyektManba, type YuklashFn } from '../../api/t2-fakt-tiklash';
import type { AktBekorFn } from '../../lib/fakt-f2-tenglash';
import type { JurnalHolat, SummaKesim } from '../../lib/fakt-jurnal';
import { faktKeyin, obyektTiklashXulosa, tiklashJami, tiklashSarlavha, type ObyektTiklashXulosa, type TiklashSatr } from '../../lib/fakt-tiklash';
import { qamrovBolaklari } from '../../lib/fakt-qamrov';
import { urinishYarat } from '../../lib/fakt-qamrov-urinish';
import { t } from '../../i18n/til';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { FaktUrinishPanel, useFaktUrinish } from './useFaktUrinish';

const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));
const KORSAT_CHEGARA = 400;

export type TiklashObyekt = { id: number; nom: string };

/**
 * «Fakt tiklash»: fakt hali to‘liq kiritilmagan obyektda dalil (tasdiqlangan F2, qoralama F2) bo‘yicha yetishmayotgan
 * fakt takliflari. Foydalanuvchi qatorlarni belgilaydi (tasdiqlangan F2 — sukut bo‘yicha belgilangan, qoralama — yo‘q) va
 * BITTA tasdiq bilan qo‘llaydi — bu qo‘lda amal, avtomatik «fakt ≥ F2» emas. Yozish — «Fakt = F2» bilan bir xil yagona
 * urinish yo‘li (fakt_yoz_v2: faqat delta, har bo‘lakka o‘z operation_id, qayta yuborish bir xil ID bilan, bekor qilish).
 * Tasdiqlangan F2 va smeta qatorlariga tegilmaydi.
 */
export function FaktTiklash({ obyektNom, satrlar, fakt, f2, obyektId, kompaniyaId, sana, holatMap, obyektlar = [], onYop, onBajarildi, aktBekor, yukla = sbTiklashObyektManba }: {
  obyektNom: string; satrlar: readonly TiklashSatr[];
  /** Obyektning hozirgi fakt va F2 jami (ustamasiz + kategoriya kesimi). */
  fakt: SummaKesim | null; f2: SummaKesim | null;
  obyektId: number; kompaniyaId: number; sana: string;
  holatMap: ReadonlyMap<number, JurnalHolat>;
  /** Kompaniya obyektlari (kompaniya bo‘yicha xulosa uchun). */
  obyektlar?: readonly TiklashObyekt[];
  onYop: () => unknown; onBajarildi: () => unknown; aktBekor: AktBekorFn;
  yukla?: YuklashFn;
}) {
  const ur = useFaktUrinish({ kompaniyaId, obyektId, holatMap, onYop, onBajarildi, aktBekor, bekorMatn: t('Fakt tiklash bekor qilindi.') });
  const { band, urinish, jadvalYangi } = ur;
  const [tanlangan, setTanlangan] = useState<Set<string>>(() => new Set(satrlar.filter((s) => s.manba === 'f2').map((s) => s.kalit)));
  const jami = useMemo(() => tiklashJami(satrlar, tanlangan), [satrlar, tanlangan]);
  const keyin = useMemo(() => faktKeyin(fakt, jami), [fakt, jami]);
  const almashtir = (k: string) => setTanlangan((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const guruhBelgila = (manba: TiklashSatr['manba'], yoq: boolean) => setTanlangan((s) => {
    const n = new Set(s);
    for (const x of satrlar) if (x.manba === manba) { if (yoq) n.add(x.kalit); else n.delete(x.kalit); }
    return n;
  });
  const f2Satrlar = useMemo(() => satrlar.filter((s) => s.manba === 'f2'), [satrlar]);
  const qorSatrlar = useMemo(() => satrlar.filter((s) => s.manba === 'qoralama'), [satrlar]);
  const hammasiF2 = useMemo(() => tiklashJami(satrlar, new Set(f2Satrlar.map((s) => s.kalit))), [satrlar, f2Satrlar]);
  const hammasiQor = useMemo(() => tiklashJami(satrlar, new Set(qorSatrlar.map((s) => s.kalit))), [satrlar, qorSatrlar]);

  /** Qo‘llash: bitta tasdiq (nima yoziladi, qoralama dalili haqida ogohlantirish), keyin yagona urinish yo‘li. */
  const qollash = async () => {
    if (band) return;
    if (!urinish) {
      if (!jami.paket.length) return;
      const matn = t('{n} qator faktga yoziladi (hujjatlar: {h}). Tasdiqlangan F2 o‘zgarmaydi.', { n: String(jami.paket.length), h: jami.hujjatlar.join('; ') })
        + (jami.qoralama.soni > 0 ? '\n' + t('Shundan {n} qator qoralama F2 asosida — bu kuchsizroq dalil (qoralama hali tasdiqlanmagan).', { n: String(jami.qoralama.soni) }) : '')
        + '\n' + t('Davom etilsinmi?');
      if (!await tasdiqSora(matn)) return;
    }
    await ur.yoz(() => {
      if (!jami.paket.length) return null;
      const faktlar = new Map(satrlar.map((q) => [q.id, q.fakt] as const));
      return urinishYarat({ kompaniyaId, obyektId, sana, sarlavha: tiklashSarlavha(obyektNom, jami.hujjatlar), foiz: 100, tur: 'f2', izohBosh: 'Fakt tiklash' },
        qamrovBolaklari(jami.paket), yangiOperationId, undefined, (id) => faktlar.get(id) ?? 0);
    });
  };
  const yozMumkin = !band && (!!urinish || (jami.paket.length > 0 && jadvalYangi));

  const jadval = (royxat: readonly TiklashSatr[], nomi: string, id: string) => {
    if (!royxat.length) return null;
    const hammasi = royxat.every((s) => tanlangan.has(s.kalit));
    const kop = royxat.length - KORSAT_CHEGARA;
    return <section data-testid={id} className="mb-3">
      <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-text">
        <input type="checkbox" checked={hammasi} onChange={() => guruhBelgila(royxat[0].manba, !hammasi)} aria-label={t('Hammasini belgilash: {nom}', { nom: nomi })} />
        <span>{nomi}</span><span className="font-normal text-text-mute">({royxat.length})</span>
      </div>
      <table className="fz-table w-full text-[12px]">
        <thead><tr className="border-b border-border text-left text-text-mute">
          <th className="w-6 px-1" /><th className="px-1">{t('Qator')}</th><th className="px-1 text-right">{t('Fakt hozir')}</th><th className="px-1 text-right">{t('Taklif')}</th>
          <th className="px-1 text-right">{t('Farq')}</th><th className="px-1">{t('Manba hujjat')}</th><th className="px-1 text-right">{t('Pul ta’siri')}</th>
        </tr></thead>
        <tbody>{royxat.slice(0, KORSAT_CHEGARA).map((s) => <tr key={s.kalit} className={`border-b border-border/40 ${tanlangan.has(s.kalit) ? '' : 'opacity-60'}`} data-testid={`tiklash-${s.kalit}`}>
          <td className="px-1"><input type="checkbox" checked={tanlangan.has(s.kalit)} onChange={() => almashtir(s.kalit)} aria-label={t('Tanlash: {nom}', { nom: s.nom })} /></td>
          <td className="max-w-[300px] truncate px-1" title={s.bolim ? `${s.bolim} — ${s.nom}` : s.nom}>{s.nom}{s.tur === 'ob' ? ` · ${t('uskuna')}` : s.tur === 'mat' ? ` · ${t('material')}` : s.tur === 'rs' ? ` · ${t('mehnat/mashina')}` : ''}</td>
          <td className="px-1 text-right tabular-nums">{fmt(s.fakt)}</td>
          <td className="px-1 text-right tabular-nums">{fmt(s.keyin)}</td>
          <td className={`px-1 text-right font-semibold tabular-nums ${s.delta < 0 ? 'text-warn' : ''}`}>{s.delta > 0 ? '+' : ''}{fmt(s.delta)} {s.birlik ?? ''}</td>
          <td className="max-w-[200px] truncate px-1 text-text-dim" title={s.hujjat}>{s.hujjat}</td>
          <td className="px-1 text-right">{s.summa == null
            ? <span className="text-text-mute" title={t('Narx noma’lum — summa to‘qilmaydi')}>—</span>
            : <SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={s.summa} katKesim={s.kesim} className="items-end" />}</td>
        </tr>)}</tbody>
      </table>
      {kop > 0 && <p className="pt-1 text-[11px] text-text-mute">{t('yana {n} ta qator', { n: String(kop) })}</p>}
    </section>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] p-4" role="dialog" aria-modal="true" aria-label={t('Fakt tiklash')}
      onKeyDown={(e) => { if (e.key === 'Escape') onYop(); }}>
      <div className="fz-card flex max-h-[90vh] w-full max-w-5xl flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-text">{t('Fakt tiklash')}</h2>
            <p className="truncate text-[12px] text-text-dim" title={obyektNom}>{obyektNom}</p>
          </div>
          <button type="button" onClick={onYop} aria-label={t('Yopish')} className="fz-btn fz-btn--ghost fz-btn--icon"><X size={16} /></button>
        </div>
        <FaktUrinishPanel u={ur} />
        <p className="text-[12px] text-text-dim">{t('Dalil: hujjatda fakt dan ko‘p ish bor qatorlar. Qatorlarni belgilang va bitta bosishda yozing — bu qo‘lda amal. Fakt to‘qilmaydi: faqat farq (delta) yoziladi, tasdiqlangan F2 o‘zgarmaydi.')}</p>

        <div className="fz-note fz-note--info flex-wrap items-start gap-x-6 gap-y-2 text-[12px]" data-testid="tiklash-jami">
          <span className="inline-flex items-start gap-1.5"><b className="text-text">{t('Fakt hozir')}</b><SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={fakt?.ustamasiz ?? null} katKesim={fakt?.kesim ?? null} /></span>
          <span className="inline-flex items-start gap-1.5"><b className="text-text">{t('Keyin')}</b><SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={keyin.ustamasiz} katKesim={keyin.kesim} /></span>
          <span className="inline-flex items-start gap-1.5"><b className="text-text">F2</b><SummaJuft kichik obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={f2?.ustamasiz ?? null} katKesim={f2?.kesim ?? null} /></span>
          <span data-testid="tiklash-soni"><b className="text-text">{jami.paket.length}</b> {t('qator yoziladi')} · {t('tasdiqlangan F2: {n}', { n: String(jami.f2.soni) })} · {t('qoralama: {n}', { n: String(jami.qoralama.soni) })}
            {jami.narxsiz > 0 ? <span className="text-warn"> · {t('summa noma’lum: {n} qator', { n: String(jami.narxsiz) })}</span> : null}
            {jami.manfiySoni > 0 ? <span className="text-text-mute"> · {t('minus qatorlar: {n}', { n: String(jami.manfiySoni) })}</span> : null}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {satrlar.length === 0
            ? <p className="text-[13px] text-text-dim" data-testid="tiklash-bosh">{t('Fakt dalildan kam emas — qo‘shiladigan hajm yo‘q.')}</p>
            : <>
              {jadval(f2Satrlar, t('Tasdiqlangan F2 (kuchli dalil)'), 'tiklash-f2')}
              {jadval(qorSatrlar, t('Qoralama F2 (kuchsizroq dalil — tasdiqlanmagan)'), 'tiklash-qoralama')}
            </>}
          <KompaniyaXulosa obyektlar={obyektlar} yukla={yukla} kompaniyaId={kompaniyaId} joriy={{ id: obyektId, f2: hammasiF2, qor: hammasiQor }} />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2 text-[12px]">
          <span className="text-text-mute">{t('Sana')}: {sana}</span>
          <div className="ml-auto flex gap-2">
            <button type="button" className="fz-btn fz-btn--ghost" onClick={onYop}>{t('Bekor')}</button>
            <button type="button" className="fz-btn fz-btn--primary" disabled={!yozMumkin} onClick={() => void qollash()} aria-label={t('Qo‘llash')} data-testid="tiklash-qollash">
              {band ? t('Yozilmoqda…') : urinish ? t('Faktga yozish — qayta yuborish (bir xil ID)') : t('Faktga yozish ({n})', { n: String(jami.paket.length) })}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

type Qator = { id: number; nom: string; holat: 'kutmoqda' | 'xato' | 'tayyor'; x?: ObyektTiklashXulosa; xato?: string };

/**
 * Kompaniya bo‘yicha: har obyekt uchun (a) tasdiqlangan F2 va (b) qoralama F2 dan potensial fakt o‘sishi (QQS bilan · ustamali ·
 * to‘g‘ri). Bosilganda har obyekt ketma-ket o‘qiladi (faqat o‘qish), hech narsa yozilmaydi.
 */
export function KompaniyaXulosa({ obyektlar, yukla, kompaniyaId, joriy }: {
  obyektlar: readonly TiklashObyekt[]; yukla: YuklashFn; kompaniyaId: number;
  joriy: { id: number; f2: { soni: number }; qor: { soni: number } };
}) {
  const [qatorlar, setQatorlar] = useState<Qator[] | null>(null);
  const [yuk, setYuk] = useState(false);
  const hisobla = async () => {
    if (yuk) return;
    setYuk(true);
    const bosh: Qator[] = obyektlar.map((o) => ({ id: o.id, nom: o.nom, holat: 'kutmoqda' as const }));
    setQatorlar(bosh);
    const joy = [...bosh];
    for (let i = 0; i < obyektlar.length; i++) {
      try {
        const r = await yukla(obyektlar[i].id);
        joy[i] = r.ok && r.manba ? { ...joy[i], holat: 'tayyor', x: obyektTiklashXulosa(r.manba.holat, r.manba.yigma) } : { ...joy[i], holat: 'xato', xato: r.error ?? t('O‘qilmadi') };
      } catch { joy[i] = { ...joy[i], holat: 'xato', xato: t('O‘qilmadi') }; }
      setQatorlar([...joy]);
    }
    setYuk(false);
  };
  const korinadi = (qatorlar ?? []).filter((q) => q.holat !== 'tayyor' || (q.x && (q.x.a.soni > 0 || q.x.b.soni > 0)));
  return <section className="mt-2 border-t border-border pt-2" data-testid="tiklash-kompaniya">
    <div className="mb-1 flex items-center gap-3">
      <h3 className="text-[12px] font-semibold text-text">{t('Kompaniya bo‘yicha: fakt qayerda yetishmaydi')}</h3>
      <button type="button" className="fz-btn fz-btn--sm" disabled={yuk || !obyektlar.length} onClick={() => void hisobla()} data-testid="tiklash-kompaniya-hisobla">{yuk ? t('Hisoblanmoqda…') : t('Hisoblash')}</button>
      <span className="text-[11px] text-text-mute">{t('Joriy obyekt: tasdiqlangan F2 {a} qator, qoralama {b} qator', { a: String(joriy.f2.soni), b: String(joriy.qor.soni) })}</span>
    </div>
    {qatorlar && <table className="fz-table w-full text-[12px]">
      <thead><tr className="border-b border-border text-left text-text-mute">
        <th className="px-1">{t('Obyekt')}</th><th className="px-1 text-right">{t('Fakt hozir')}</th><th className="px-1 text-right">F2</th>
        <th className="px-1 text-right">{t('(a) tasdiqlangan F2 dan')}</th><th className="px-1 text-right">{t('(b) qoralama F2 dan')}</th>
      </tr></thead>
      <tbody>{korinadi.map((q) => <tr key={q.id} className="border-b border-border/40" data-testid={`tiklash-komp-${q.id}`}>
        <td className="max-w-[260px] truncate px-1" title={q.nom}>{q.nom}</td>
        {q.holat === 'tayyor' && q.x ? <>
          <td className="px-1 text-right"><SummaJuft kichik obyektId={q.id} kompaniyaId={kompaniyaId} ustamasiz={q.x.fakt.ustamasiz} katKesim={q.x.fakt.kesim} className="items-end" /></td>
          <td className="px-1 text-right"><SummaJuft kichik obyektId={q.id} kompaniyaId={kompaniyaId} ustamasiz={q.x.f2.ustamasiz} katKesim={q.x.f2.kesim} className="items-end" /></td>
          <td className="px-1 text-right">{q.x.a.soni > 0 ? <><SummaJuft kichik obyektId={q.id} kompaniyaId={kompaniyaId} ustamasiz={q.x.a.ustamasiz} katKesim={q.x.a.kesim} className="items-end" /><span className="text-[10px] text-text-mute">{t('{n} qator', { n: String(q.x.a.soni) })}{q.x.a.noma > 0 ? ` · ${t('narxsiz')} ${q.x.a.noma}` : ''}</span></> : '—'}</td>
          <td className="px-1 text-right">{q.x.b.soni > 0 ? <><SummaJuft kichik obyektId={q.id} kompaniyaId={kompaniyaId} ustamasiz={q.x.b.ustamasiz} katKesim={q.x.b.kesim} className="items-end" /><span className="text-[10px] text-text-mute">{t('{n} qator', { n: String(q.x.b.soni) })}{q.x.b.noma > 0 ? ` · ${t('narxsiz')} ${q.x.b.noma}` : ''}</span></> : '—'}</td>
        </> : <td colSpan={4} className="px-1 text-text-mute">{q.holat === 'xato' ? q.xato : t('Hisoblanmoqda…')}</td>}
      </tr>)}</tbody>
    </table>}
  </section>;
}
