import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { yangiOperationId, type T2Obyekt } from '../../api/supabase';
import { sbFaktYoz, sbQatorHolatOl } from '../../api/t2-fakt';
import { sbT2QatorHolatQisman } from '../../api/t2-holat-qisman';
import { egizakQatorlarOl } from '../../api/t2-egizak';
import { egizakObyektlar, type EgizakQator } from '../../lib/f2-moslash-v3/egizak';
import { RAD_SABAB_MATN, faktEgizakReja, faktEgizakYoz, qoshimchaXarita, type EgizakNatija, type EgizakReja } from '../../lib/fakt-egizak';
import type { Kiritma } from '../../lib/fakt-jurnal';
import { t } from '../../i18n/til';

const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));
const KORSAT = 150;

export type EgizakDoira = 'qoralama' | 'bolim' | 'obyekt';
type Tomon = { qatorlar: EgizakQator[]; smeta: Map<number, number | null>; fakt: Map<number, number>; qosh: Map<number, number> };

/**
 * «Egizaklarga ham yozish»: shu oynada (yangi sahifa yo'q) tanlangan egizak obyektlar uchun oldindan ko'rish
 * (mos / mos kelmagan qatorlar sababi bilan, yoziladigan hajm) va har egizakka alohida yozish natijasi.
 * Moslash — F2 egizak yadrosi; foiz har egizakning o'z smetasidan; '+' / '=' kiritmadagidek.
 */
export function FaktEgizakOyna({ obyektId, obyektNom, objects, sana, qoralama, bolimNom, bolimKiritma, obyektKiritma, manbaSaqla, onYop, onYozildi }: {
  obyektId: number; obyektNom: string; objects: readonly T2Obyekt[]; sana: string;
  qoralama: Readonly<Record<number, Kiritma>>;
  bolimNom: string | null; bolimKiritma: Readonly<Record<number, Kiritma>>; obyektKiritma: Readonly<Record<number, Kiritma>>;
  /** Qoralama doirasida: avval shu obyektga saqlash (jurnalning o'z yo'li). */
  manbaSaqla: { (): Promise<boolean> };
  onYop: () => unknown; onYozildi: () => unknown;
}) {
  // Ochilgan paytdagi surat: manba saqlangach jurnal qoralamasi tozalansa ham reja o'zgarmaydi.
  const [snap] = useState(() => ({ qoralama: { ...qoralama }, bolim: { ...bolimKiritma }, obyekt: { ...obyektKiritma } }));
  const nomzod = useMemo(() => egizakObyektlar(objects, obyektId), [objects, obyektId]);
  const [doira, setDoira] = useState<EgizakDoira>(Object.keys(snap.qoralama).length ? 'qoralama' : bolimNom ? 'bolim' : 'obyekt');
  const [tanlangan, setTanlangan] = useState<Set<number>>(() => new Set(nomzod.map((o) => o.id)));
  const [manbaBilan, setManbaBilan] = useState(true);
  const [yuk, setYuk] = useState(true);
  const [xato, setXato] = useState('');
  const [manba, setManba] = useState<EgizakQator[]>([]);
  const [tomonlar, setTomonlar] = useState<Map<number, Tomon>>(new Map());
  const [band, setBand] = useState(false);
  const [natijalar, setNatijalar] = useState<Map<number, EgizakNatija>>(new Map());
  const opRef = useRef(new Map<number, { imzo: string; id: string }>());

  useEffect(() => {
    let faol = true;
    void (async () => {
      try {
        const m = await egizakQatorlarOl(obyektId);
        const tm = new Map<number, Tomon>();
        await Promise.all(nomzod.map(async (o) => {
          const [qatorlar, h] = await Promise.all([egizakQatorlarOl(o.id), sbQatorHolatOl(o.id)]);
          if (!h.ok) throw new Error(t('Egizak obyekt ma’lumotlari o‘qilmadi.'));
          const holat = new Map((h.qatorlar ?? []).map((x) => [Number(x.qator_id), x] as const));
          const smeta = new Map<number, number | null>(); const fakt = new Map<number, number>();
          for (const q of qatorlar) {
            const x = holat.get(q.id);
            const s = x?.smeta_hajm ?? q.hajm;
            smeta.set(q.id, s == null || !Number.isFinite(Number(s)) ? null : Number(s));
            fakt.set(q.id, Number(x?.fakt_hajm ?? 0));
          }
          tm.set(o.id, { qatorlar, smeta, fakt, qosh: await qoshimchaXarita(m, qatorlar, o.id) });
        }));
        if (faol) { setManba(m); setTomonlar(tm); setYuk(false); }
      } catch (e) { if (faol) { setXato(e instanceof Error ? e.message : t('Egizak obyekt ma’lumotlari o‘qilmadi.')); setYuk(false); } }
    })();
    return () => { faol = false; };
  }, [obyektId, nomzod]);

  const kirit = doira === 'qoralama' ? snap.qoralama : doira === 'bolim' ? snap.bolim : snap.obyekt;
  const rejalar = useMemo(() => nomzod.filter((o) => tomonlar.has(o.id)).map((o) => {
    const e = tomonlar.get(o.id)!;
    return faktEgizakReja(manba, kirit, { id: o.id, nom: o.nom, qatorlar: e.qatorlar, smeta: e.smeta, fakt: e.fakt }, e.qosh);
  }), [nomzod, tomonlar, manba, kirit]);
  const yozilgan = useMemo(() => new Set([...natijalar.values()].filter((n) => n.holat === 'yozildi').map((n) => n.obyektId)), [natijalar]);
  const yoziladi = rejalar.filter((r) => tanlangan.has(r.obyektId) && !yozilgan.has(r.obyektId) && r.paket.length > 0);
  const jamiQator = yoziladi.reduce((s, r) => s + r.paket.length, 0);
  const almashtir = (id: number) => setTanlangan((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const opOl = (r: EgizakReja) => {
    const imzo = JSON.stringify(r.paket); const bor = opRef.current.get(r.obyektId);
    if (bor && bor.imzo === imzo) return bor.id;
    const id = yangiOperationId(); opRef.current.set(r.obyektId, { imzo, id }); return id;
  };
  const yoz = async () => {
    if (band || !yoziladi.length) return;
    setBand(true);
    try {
      if (doira === 'qoralama' && manbaBilan && !(await manbaSaqla())) return;
      const ops = new Map(yoziladi.map((r) => [r.obyektId, opOl(r)] as const));
      const res = await faktEgizakYoz(yoziladi, ops, {
        serverFakt: async (oid, idlar) => {
          const h = await sbT2QatorHolatQisman(oid, idlar);
          return h.ok ? new Map((h.qatorlar ?? []).map((x) => [Number(x.qator_id), Number(x.fakt_hajm ?? 0)] as const)) : null;
        },
        yoz: async (oid, paket, operationId) => {
          const r = await sbFaktYoz({ obyektId: oid, sana, operationId, qatorlar: paket, izoh: `Egizak fakt: ${obyektNom} → ${paket.length} qator` });
          return { ok: !!r.ok, xato: r.ok ? undefined : (r.error || r.xabar) };
        },
        progress: (n) => setNatijalar((o) => new Map(o).set(n.obyektId, n)),
      });
      if (res.some((n) => n.holat === 'yozildi')) void Promise.resolve(onYozildi());
    } finally { setBand(false); }
  };

  const natijaMatn = (n: EgizakNatija) => n.holat === 'yozildi' ? t('Yozildi: {n} qator', { n: String(n.qatorSoni) })
    : n.holat === 'ziddiyat' ? t('Ziddiyat: {n} qator fakti boshqa joyda o‘zgargan — bu egizak to‘xtadi. Oynani qayta oching.', { n: String(n.ziddiyatIdlar?.length ?? 0) })
    : n.holat === 'bosh' ? t('Yoziladigan qator yo‘q') : t('Xato: {xabar}', { xabar: n.xabar ?? '' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] p-4" role="dialog" aria-modal="true" aria-label={t('Egizaklarga ham yozish')}>
      <div className="fz-card flex max-h-[88vh] w-full max-w-4xl flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-text">{t('Egizaklarga ham yozish')}</h2>
            <p className="truncate text-[12px] text-text-dim" title={obyektNom}>{obyektNom}</p>
          </div>
          <button type="button" onClick={onYop} aria-label={t('Yopish')} className="fz-btn fz-btn--ghost fz-btn--icon"><X size={16} /></button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[12px]" role="group" aria-label={t('Nimani yozish')}>
          {([['qoralama', t('Saqlanmagan kiritmalar')], ['bolim', bolimNom ? t('Bo‘lim: {nom}', { nom: bolimNom }) : t('Bo‘lim')], ['obyekt', t('Butun obyekt fakti')]] as const).map(([k, l]) =>
            <button key={k} type="button" aria-pressed={doira === k} disabled={band || (k === 'bolim' && !bolimNom)} onClick={() => setDoira(k)}
              className={`fz-btn fz-btn--sm ${doira === k ? 'border-transparent bg-accent/15 text-text' : 'fz-btn--ghost'}`}>{l} ({Object.keys(k === 'qoralama' ? snap.qoralama : k === 'bolim' ? snap.bolim : snap.obyekt).length})</button>)}
          {doira === 'qoralama' && <label className="flex items-center gap-1.5 text-text-dim"><input type="checkbox" checked={manbaBilan} disabled={band} onChange={(e) => setManbaBilan(e.target.checked)} /> {t('Avval shu obyektga ham saqlash')}</label>}
        </div>
        <p className="text-[11px] text-text-mute">{doira === 'qoralama' ? t('«+» va «=» rejimi, foiz (masalan 50%) har egizakning o‘z smeta hajmidan hisoblanadi.') : t('Joriy fakt egizaklarga «jami» (=) sifatida yoziladi; faqat fakti bor ish/material qatorlari. Tasdiqlangan F2 o‘zgarmaydi.')}</p>

        {yuk && <p role="status" className="text-[12px] text-text-dim">{t('Egizak obyekt tekshirilmoqda…')}</p>}
        {xato && <p role="alert" className="text-[12px] text-danger">{xato}</p>}
        {!yuk && !xato && nomzod.length === 0 && <p className="text-[12px] text-text-dim">{t('Bu loyihada egizak obyekt yo‘q.')}</p>}

        <div className="min-h-0 flex-1 space-y-3 overflow-auto">
          {rejalar.map((r) => {
            const n = natijalar.get(r.obyektId);
            return <section key={r.obyektId} className="rounded-[var(--radius-sm)] border border-border p-2 text-[12px]" data-testid={`egizak-${r.obyektId}`}>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 font-semibold text-text"><input type="checkbox" checked={tanlangan.has(r.obyektId)} disabled={band || yozilgan.has(r.obyektId)} onChange={() => almashtir(r.obyektId)} aria-label={r.nom} />{r.nom}</label>
                <span className="text-text-dim">{t('mos: {a}, mos kelmadi: {b}', { a: String(r.moslar.length), b: String(r.radlar.length) })}</span>
                {!r.qatiy && <span className="fz-chip fz-chip--warn">{t('smeta tuzilmasi aynan bir xil emas')}</span>}
                {n && <span role="status" className={n.holat === 'yozildi' ? 'text-ok' : n.holat === 'bosh' ? 'text-text-dim' : 'text-danger'} data-testid={`egizak-natija-${r.obyektId}`}>{natijaMatn(n)}</span>}
              </div>
              {r.moslar.length > 0 && <table className="fz-table mt-2 w-full">
                <thead><tr className="border-b border-border text-left text-text-mute"><th className="px-1">{t('Qator')}</th><th className="px-1 text-right">{t('Smeta')}</th><th className="px-1 text-right">{t('Hozirgi fakt')}</th><th className="px-1 text-center">{t('Rejim')}</th><th className="px-1 text-right">{t('Yoziladi')}</th><th className="px-1 text-right">{t('Yangi fakt')}</th></tr></thead>
                <tbody>{r.moslar.slice(0, KORSAT).map((x) => <tr key={x.bId} className="border-b border-border/40">
                  <td className="max-w-[300px] truncate px-1" title={x.nom}>{x.nom}{x.hajmFarq ? ' ⚠' : ''}</td>
                  <td className="px-1 text-right tabular-nums">{fmt(x.smeta)}</td><td className="px-1 text-right tabular-nums">{fmt(x.joriy)}</td>
                  <td className="px-1 text-center font-mono">{x.rejim}{x.qiymat.includes('%') ? ` ${x.qiymat}` : ''}</td>
                  <td className="px-1 text-right font-semibold tabular-nums">{x.delta > 0 ? '+' : ''}{fmt(x.delta)} {x.birlik ?? ''}</td>
                  <td className="px-1 text-right tabular-nums">{fmt(x.yangi)}</td></tr>)}</tbody>
              </table>}
              {KORSAT < r.moslar.length && <p className="pt-1 text-[11px] text-text-mute">{t('yana {n} ta qator', { n: String(r.moslar.length - KORSAT) })}</p>}
              {r.radlar.length > 0 && <details open className="mt-2 text-warn"><summary>{t('Yozilmaydigan qatorlar ({n}):', { n: String(r.radlar.length) })}</summary>
                <ul className="ml-4 list-disc">{r.radlar.slice(0, KORSAT).map((x) => <li key={x.aId}>{x.nom} — {t(RAD_SABAB_MATN[x.sabab])}</li>)}</ul></details>}
            </section>;
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2 text-[12px]">
          <span className="text-text-mute">{t('Sana')}: {sana}</span>
          <div className="ml-auto flex gap-2">
            <button type="button" className="fz-btn fz-btn--ghost" onClick={onYop}>{t('Yopish')}</button>
            <button type="button" className="fz-btn fz-btn--primary" disabled={band || yuk || !yoziladi.length} onClick={() => void yoz()}>
              {band ? t('Yozilmoqda…') : t('Egizaklarga yozish ({n})', { n: String(jamiQator) })}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
