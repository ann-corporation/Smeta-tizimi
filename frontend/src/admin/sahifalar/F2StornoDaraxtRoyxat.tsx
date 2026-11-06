import { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import {
  stornoBelgiHolat, stornoBolinganIshlar, stornoQidir, stornoTugunAlmashtir,
  type StornoBarg, type StornoDaraxt, type StornoJam, type StornoTugun,
} from '../../lib/f2-storno-daraxt';

const KORSATISH_LIMIT = 400;

/** Storno hajmini tahrirlash (qoralama tahriri): mutlaq qiymat, 0 < h ≤ eski F2 hajmi. */
export type StornoHajmTahrir = {
  ol: (q: StornoBarg) => number | null;
  qoy: (q: StornoBarg, mutlaq: number) => void;
};

/**
 * Storno tanlov daraxti (egasi 2026-11-06): УЧАСТОК/РАЗДЕЛ → ish → resurs/material, uch holatli belgilar, qidiruv
 * (ajdodlar saqlanadi), «Hammasini belgilash/olish», «Tanlanmaganlarni ko'rsatish», ochish/yopish, bo'lingan ish ogohi.
 * «Storno (minus) F2 yaratish» oynasi va pereraschet qoralamasidagi storno bloki tahriri — ikkalasi shu ro'yxatda.
 * Yopiq tugunlar render qilinmaydi; ko'rinadigan satrlar 400 tadan bo'lib ko'rsatiladi.
 */
export function F2StornoDaraxtRoyxat(p: {
  tree: StornoDaraxt;
  jam: ReadonlyMap<string, StornoJam>;
  tanlangan: ReadonlySet<string>;
  onTanlangan: (f: (s: ReadonlySet<string>) => ReadonlySet<string>) => void;
  qulf: boolean;
  faktOl?: (qatorId: number) => number | null;
  hajm?: StornoHajmTahrir;
}) {
  const { tree, jam } = p;
  const [qidir, setQidir] = useState('');
  const [ochiq, setOchiq] = useState<ReadonlySet<string> | null>(null);
  const [faqatQolgan, setFaqatQolgan] = useState(false);
  const [limit, setLimit] = useState(KORSATISH_LIMIT);
  const [hajmMatn, setHajmMatn] = useState<Record<string, string>>({});
  const qidiruv = useMemo(() => stornoQidir(tree.ildiz, tree.byId, qidir), [tree, qidir]);
  const bolingan = useMemo(() => stornoBolinganIshlar(tree.byId, jam), [tree, jam]);
  /** Sukut: F2 bloklari va 1-daraja bo'limlar ochiq (ichki bo'limlar va ishlar yopiq). */
  const ochiqlar = useMemo(() => ochiq ?? new Set([...tree.byId.values()]
    .filter((n) => n.k === 'akt' || (n.k === 'bolim' && (n.ota == null || tree.byId.get(n.ota)?.k === 'akt'))).map((n) => n.id)), [ochiq, tree]);
  const satrlar = useMemo(() => {
    const out: StornoTugun[] = [];
    const yur = (ns: readonly StornoTugun[]) => {
      for (const n of ns) {
        if (qidiruv && !qidiruv.korinadi.has(n.id)) continue;
        if (faqatQolgan && stornoBelgiHolat(jam.get(n.id)) === 'bor' && (jam.get(n.id)?.barchasi ?? 0) > 0) continue;
        out.push(n);
        if (n.bolalar.length && (ochiqlar.has(n.id) || qidiruv?.ochiq.has(n.id))) yur(n.bolalar);
      }
    };
    yur(tree.ildiz);
    return out;
  }, [tree, qidiruv, faqatQolgan, jam, ochiqlar]);
  const yanaSoni = satrlar.length - limit;
  const ochYop = (id: string) => setOchiq(() => { const n = new Set(ochiqlar); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const hammasiniOch = (on: boolean) => setOchiq(on ? new Set([...tree.byId.values()].filter((n) => n.bolalar.length).map((n) => n.id)) : new Set());
  const tugunBelgila = (n: StornoTugun) => p.onTanlangan((s) => stornoTugunAlmashtir(n, jam.get(n.id), s));
  const hammasi = (on: boolean) => p.onTanlangan(() => (on ? new Set(tree.ildiz.flatMap((n) => n.barglar)) : new Set()));
  const hajmOzgar = (q: StornoBarg, matn: string) => {
    setHajmMatn((m) => ({ ...m, [q.kalit]: matn }));
    const v = Number(matn.replace(',', '.'));
    const max = Math.abs(q.hajm ?? 0);
    if (p.hajm && matn.trim() !== '' && Number.isFinite(v) && v > 0 && v <= max) p.hajm.qoy(q, v);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label={t('Qator qidirish')} value={qidir} onChange={(e) => { setQidir(e.target.value); setLimit(KORSATISH_LIMIT); }} placeholder={t('Kod yoki nom bo‘yicha qidirish')} className="w-full sm:w-64" />
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={p.qulf} onClick={() => hammasi(true)}>{t('Hammasini belgilash')}</button>
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={p.qulf} onClick={() => hammasi(false)}>{t('Hammasidan olish')}</button>
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" aria-pressed={faqatQolgan} onClick={() => setFaqatQolgan((v) => !v)}>{faqatQolgan ? t('Hammasini ko‘rsatish') : t('Tanlanmaganlarni ko‘rsatish')}</button>
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => hammasiniOch(true)}>{t('Hammasini ochish')}</button>
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => hammasiniOch(false)}>{t('Hammasini yopish')}</button>
      </div>
      <div role="tree" aria-label={t('Storno qatorlari daraxti')} data-testid="storno-daraxt" className="max-h-[46dvh] overflow-auto rounded border border-border/60 text-[12.5px]">
        {satrlar.slice(0, limit).map((n) => {
          const j = jam.get(n.id);
          const holat = stornoBelgiHolat(j);
          const q = n.q;
          const guruh = n.k === 'akt' || n.k === 'bolim';
          const ochilgan = ochiqlar.has(n.id) || !!qidiruv?.ochiq.has(n.id);
          const tanlanmaydi = (j?.barchasi ?? 0) === 0;
          const fakt = q && p.faktOl ? p.faktOl(q.qatorId) : null;
          const tahrirHajm = p.hajm && q && q.tanlanadi && p.tanlangan.has(q.kalit) && !p.qulf;
          const hajmMatni = q ? (hajmMatn[q.kalit] ?? String(p.hajm?.ol(q) ?? Math.abs(q.hajm ?? 0))) : '';
          const hajmXato = !!tahrirHajm && (() => { const v = Number(hajmMatni.replace(',', '.')); return !(Number.isFinite(v) && v > 0 && v <= Math.abs(q.hajm ?? 0)); })();
          return (
            <div key={n.id} role="treeitem" aria-level={n.daraja + 1} aria-expanded={n.bolalar.length ? ochilgan : undefined} aria-selected={holat === 'bor'}
              data-testid={guruh ? 'storno-bolim' : 'f2-storno-qator'}
              className={`flex items-center gap-1.5 border-t border-border/40 py-1 pr-2 ${guruh ? 'bg-surface-2/60 font-semibold' : ''} ${holat === 'yoq' && !tanlanmaydi ? 'text-text-dim' : ''}`}
              style={{ paddingLeft: 6 + Math.min(n.daraja, 8) * 14 }}>
              {n.bolalar.length
                ? <button type="button" className="w-5 shrink-0 text-text-dim" aria-label={ochilgan ? t('Yopish: {n}', { n: n.nom }) : t('Ochish: {n}', { n: n.nom })} onClick={() => ochYop(n.id)}>{ochilgan ? '▾' : '▸'}</button>
                : <span className="w-5 shrink-0" />}
              <input type="checkbox" className="shrink-0" disabled={tanlanmaydi || p.qulf} checked={holat === 'bor'}
                ref={(el) => { if (el) el.indeterminate = holat === 'qisman'; }}
                onChange={() => tugunBelgila(n)}
                aria-label={guruh ? t('Storno bo‘limi: {n}', { n: n.nom }) : t('Storno: {n}', { n: q?.kod || n.nom })} />
              <span className="min-w-0 flex-1 truncate" title={n.nom}>
                {q?.kod && <span className="mr-1.5 font-mono text-[11.5px] text-text-mute">{q.kod}</span>}
                {n.nom}
                {q?.otkaz && <span className="ml-1 text-warn">({q.otkaz === 'nol' ? t('hajm 0 — stornolanmaydi') : t('hajm noma‘lum — stornolanmaydi')})</span>}
              </span>
              {tahrirHajm && q
                ? <label className="flex shrink-0 items-center gap-1 text-[11.5px] text-text-mute">−
                    <input inputMode="decimal" className="w-20 text-right tabular-nums" value={hajmMatni} aria-invalid={hajmXato}
                      aria-label={t('Storno hajmi: {n} (ko‘pi bilan {m})', { n: q.kod || n.nom, m: String(Math.abs(q.hajm ?? 0)) })}
                      onChange={(e) => hajmOzgar(q, e.target.value)} />
                    {q.birlik ?? ''}
                  </label>
                : q && q.hajm != null && <span className="hidden w-28 shrink-0 text-right tabular-nums sm:inline"><FmtN val={q.hajm} /> {q.birlik ?? ''}</span>}
              {n.k === 'qator' && q && (
                <span className="w-28 shrink-0 text-right tabular-nums">{q.otkaz ? '—' : q.summa == null ? <span className="text-warn">{t('noma‘lum')}</span> : <FmtN val={q.summa} />}</span>
              )}
              {n.k !== 'qator' && j && (
                <span className="shrink-0 text-right text-[11.5px] tabular-nums" data-testid="storno-tugun-jam">
                  <span className="text-text-mute">{j.soni}/{j.barchasi} · </span><FmtN val={j.jami} />
                  {j.nomalum > 0 && <span className="ml-1 text-warn">({t('qisman noma‘lum: {n}', { n: j.nomalum })})</span>}
                </span>
              )}
              {n.k === 'qator' && p.faktOl && <span className="hidden w-16 shrink-0 text-right tabular-nums text-text-mute sm:inline">{fakt != null ? <FmtN val={fakt} /> : ''}</span>}
            </div>
          );
        })}
        {satrlar.length === 0 && <p className="p-2 text-text-dim">{t('Hech narsa topilmadi.')}</p>}
        {yanaSoni > 0 && (
          <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm m-2" onClick={() => setLimit((l) => l + KORSATISH_LIMIT)}>
            {t('Yana ko‘rsatish ({n} qoldi)', { n: yanaSoni })}
          </button>
        )}
      </div>
      {bolingan.length > 0 && (
        <p data-testid="storno-bolingan" className="fz-note fz-note--warn"><ShieldAlert />
          {t('{n} ta ish o‘z resurslaridan ajratildi (bir qismi storno, bir qismi qoladi): {r}. Ataylab bo‘lsa — davom eting.', { n: bolingan.length, r: bolingan.slice(0, 3).map((x) => x.q?.kod || x.nom).join(', ') + (bolingan.length > 3 ? '…' : '') })}
        </p>
      )}
    </>
  );
}
