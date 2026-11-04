/**
 * Shaxmatka (chessboard): bino tanlash → podyezd ustunlari × qavat qatorlari (yuqori qavat tepada), katak rangi — holat.
 * Filtrlar (xonalar, maydon, narx, holat), xulosa paneli (server hisob), katak kartasi (bron, bitim, narx, holat),
 * ko'p tanlash → ommaviy narx; bo'sh bino → generator. Telefonda gorizontal aylantiriladi.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { CheckSquare, Plus, RefreshCw, Tag, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { ModalOyna } from '../../components/pto-workspace/ModalOyna';
import type { Birlik, BirlikHolat } from '../../api/t2-sotuv';
import {
  BOSH_FILTR, HOLATLAR, HOLAT_NUQTA, HOLAT_RANG, filtrBormi, filtrMos, shaxmatkaTuz, type ShaxmatkaFiltr,
} from '../../lib/sotuv/shaxmatka-korinish';
import { bronQoldi } from '../../lib/sotuv/bitim-korinish';
import { Ixcham, Maydon, Pul, Sana } from './umumiy';
import { HOLAT_NOMI, kirit, sonOl, type SotuvRuxsat } from './sotuv-umumiy';
import { useShaxmatka } from './sorovlar';
import { BronDialog, HolatDialog, NarxDialog } from './ShaxmatkaDialoglar';
import { BirlikGenerator } from './BirlikGenerator';

type Bino = { id: number; nom: string };

export function Shaxmatka({ kid, ruxsat, binolar, obyektId, setObyektId, bitimOch }: {
  kid: number; ruxsat: SotuvRuxsat; binolar: readonly Bino[]; obyektId: number | null; setObyektId: (id: number | null) => void;
  bitimOch: (id: number) => void;
}) {
  const sh = useShaxmatka(kid, obyektId);
  const [filtr, setFiltr] = useState<ShaxmatkaFiltr>(BOSH_FILTR);
  const [tanlashRejim, setTanlashRejim] = useState(false);
  const [tanlangan, setTanlangan] = useState<Set<number>>(new Set());
  const [karta, setKarta] = useState<Birlik | null>(null);
  const [dialog, setDialog] = useState<null | 'narx' | 'generator' | { holat: Birlik } | { bron: Birlik }>(null);

  const birliklar = useMemo(() => sh.data?.birliklar ?? [], [sh.data]);
  const tuz = useMemo(() => shaxmatkaTuz(birliklar), [birliklar]);
  const mos = useMemo(() => new Set(birliklar.filter((b) => filtrMos(b, filtr)).map((b) => b.id)), [birliklar, filtr]);
  const yozish = ruxsat.yozish && sh.data?.yozish !== false;
  const hisob = sh.data?.hisob;

  const bos = (b: Birlik) => {
    if (tanlashRejim) {
      setTanlangan((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; });
    } else setKarta(b);
  };
  const xona = (k: number) => setFiltr((f) => ({ ...f, xonalar: f.xonalar.includes(k) ? f.xonalar.filter((x) => x !== k) : [...f.xonalar, k] }));
  const holatF = (h: BirlikHolat) => setFiltr((f) => ({ ...f, holatlar: f.holatlar.includes(h) ? f.holatlar.filter((x) => x !== h) : [...f.holatlar, h] }));

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Maydon nom={t('Bino')} cl="min-w-[200px]">
          <select className={kirit} value={obyektId ?? ''} onChange={(e) => { setObyektId(Number(e.target.value) || null); setTanlangan(new Set()); }} aria-label={t('Bino')}>
            <option value="">{t('— tanlang —')}</option>
            {binolar.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
        </Maydon>
        <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => sh.refetch()} disabled={!obyektId} aria-label={t('Yangilash')}><RefreshCw size={14} aria-hidden="true" /></button>
        {obyektId && yozish && (
          <button type="button" className="fz-btn fz-btn--sm" onClick={() => setDialog('generator')}><Plus size={14} aria-hidden="true" />{t('Birliklar yaratish')}</button>
        )}
        {obyektId && ruxsat.narx && birliklar.length > 0 && (
          <button type="button" className={`fz-btn fz-btn--sm ${tanlashRejim ? 'fz-btn--primary' : ''}`} aria-pressed={tanlashRejim}
            onClick={() => { setTanlashRejim((x) => !x); setTanlangan(new Set()); }}><CheckSquare size={14} aria-hidden="true" />{t('Tanlash')}</button>
        )}
        {tanlashRejim && tanlangan.size > 0 && (
          <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" onClick={() => setDialog('narx')}><Tag size={14} aria-hidden="true" />{t('Narxni o‘zgartirish ({n})', { n: tanlangan.size })}</button>
        )}
      </div>

      {!obyektId && <p className="fz-note fz-note--info">{t('Shaxmatkani ko‘rish uchun binoni tanlang.')}</p>}
      {obyektId && sh.isLoading && <p className="text-text-mute">{t('Yuklanmoqda…')}</p>}
      {obyektId && sh.error && <p className="fz-note fz-note--danger">{t((sh.error as Error).message)}</p>}

      {hisob && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-border bg-surface px-3 py-2 text-[12.5px]" aria-label={t('Xulosa')}>
          <span>{t('Jami')}: <b className="tabular-nums">{hisob.jami}</b></span>
          {HOLATLAR.map((h) => (
            <span key={h} className="inline-flex items-center gap-1"><i className={`inline-block h-2.5 w-2.5 rounded-sm ${HOLAT_NUQTA[h]}`} />{HOLAT_NOMI[h]()}: <b className="tabular-nums">{hisob[h]}</b></span>
          ))}
          <span>{t('Bo‘sh maydon')}: <b className="tabular-nums">{hisob.maydon_bosh}</b> {t('m²')}</span>
          <span>{t('Bo‘sh qiymati')}: <b><Ixcham val={hisob.qiymat_bosh} /></b></span>
          {hisob.narxsiz_soni > 0 && <span className="text-warn">{t('Narxsiz: {n}', { n: hisob.narxsiz_soni })}</span>}
        </div>
      )}

      {birliklar.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 text-[12px]" aria-label={t('Filtrlar')}>
          <div className="flex items-center gap-1">
            <span className="text-text-mute">{t('Xonalar')}:</span>
            {[1, 2, 3, 4].map((k) => (
              <button key={k} type="button" aria-pressed={filtr.xonalar.includes(k)} onClick={() => xona(k)}
                className={`fz-chip ${filtr.xonalar.includes(k) ? 'fz-chip--accent' : ''}`}>{k === 4 ? '4+' : k}</button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {HOLATLAR.map((h) => (
              <button key={h} type="button" aria-pressed={filtr.holatlar.includes(h)} onClick={() => holatF(h)}
                className={`fz-chip ${filtr.holatlar.includes(h) ? 'fz-chip--accent' : ''}`}>{HOLAT_NOMI[h]()}</button>
            ))}
          </div>
          <OraliqKirit nom={t('Maydon, m²')} dan={filtr.maydonDan} gacha={filtr.maydonGacha} set={(d, g) => setFiltr((f) => ({ ...f, maydonDan: d, maydonGacha: g }))} />
          <OraliqKirit nom={t('Narx')} dan={filtr.narxDan} gacha={filtr.narxGacha} set={(d, g) => setFiltr((f) => ({ ...f, narxDan: d, narxGacha: g }))} />
          {filtrBormi(filtr) && <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => setFiltr(BOSH_FILTR)}><X size={13} aria-hidden="true" />{t('Filtrni tozalash')}</button>}
        </div>
      )}

      {obyektId && sh.data && birliklar.length === 0 && (
        <div className="fz-note fz-note--info">
          <p>{t('Bu binoda hali birliklar yo‘q.')}</p>
          {yozish && <button type="button" className="fz-btn fz-btn--primary fz-btn--sm mt-2" onClick={() => setDialog('generator')}>{t('Birliklar yaratish')}</button>}
        </div>
      )}

      {birliklar.length > 0 && (
        <div className="overflow-x-auto pb-2" role="grid" aria-label={t('Shaxmatka')}>
          <div className="flex gap-4">
            {tuz.podyezdlar.map((p) => (
              <div key={p.podyezd} className="shrink-0">
                <div className="mb-1 text-center text-[11px] font-medium uppercase tracking-wide text-text-mute">{t('Podyezd {n}', { n: p.podyezd })}</div>
                <div className="flex flex-col gap-1">
                  {tuz.qavatlar.map((q) => {
                    const qator = p.qavatlar.get(q) ?? [];
                    return (
                      <div key={q} className="flex items-stretch gap-1" role="row">
                        <span className="flex w-6 shrink-0 items-center justify-end pr-1 text-[10.5px] tabular-nums text-text-mute" title={t('Qavat')}>{q}</span>
                        {Array.from({ length: p.ustunlar }, (_, i) => {
                          const b = qator[i];
                          if (!b) return <span key={i} className="w-[88px] shrink-0" />;
                          const xira = !mos.has(b.id);
                          const tan = tanlangan.has(b.id);
                          return (
                            <button key={b.id} type="button" role="gridcell" onClick={() => bos(b)} aria-selected={tanlashRejim ? tan : undefined}
                              aria-label={`${b.raqam} · ${HOLAT_NOMI[b.holat]()}`}
                              className={`w-[88px] shrink-0 rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition ${HOLAT_RANG[b.holat]} ${xira ? 'opacity-25' : ''} ${tan ? 'ring-2 ring-accent' : ''}`}>
                              <span className="flex justify-between font-semibold tabular-nums"><span>{b.raqam}</span><span>{b.xona_soni != null ? `${b.xona_soni}x` : ''}</span></span>
                              <span className="block tabular-nums text-text-dim">{b.maydon ?? '—'} {t('m²')}</span>
                              <span className="block"><Ixcham val={b.narx_jami} /></span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {karta && (
        <BirlikKarta b={karta} ruxsat={ruxsat} yozish={yozish} yop={() => setKarta(null)}
          bron={() => { setDialog({ bron: karta }); setKarta(null); }}
          holat={() => { setDialog({ holat: karta }); setKarta(null); }}
          narx={() => { setTanlangan(new Set([karta.id])); setDialog('narx'); setKarta(null); }}
          bitim={(id) => { setKarta(null); bitimOch(id); }} />
      )}
      {dialog === 'narx' && <NarxDialog kid={kid} birliklar={birliklar} tanlangan={tanlangan} yop={() => setDialog(null)} tayyor={() => { setDialog(null); setTanlangan(new Set()); setTanlashRejim(false); }} />}
      {dialog === 'generator' && obyektId && <BirlikGenerator kid={kid} obyektId={obyektId} yop={() => setDialog(null)} tayyor={() => setDialog(null)} />}
      {dialog && typeof dialog === 'object' && 'holat' in dialog && <HolatDialog kid={kid} birlik={dialog.holat} yop={() => setDialog(null)} tayyor={() => setDialog(null)} />}
      {dialog && typeof dialog === 'object' && 'bron' in dialog && (
        <BronDialog kid={kid} birlik={dialog.bron} binolar={binolar} yop={() => setDialog(null)} tayyor={(id) => { setDialog(null); bitimOch(id); }} />
      )}
    </div>
  );
}

function OraliqKirit({ nom, dan, gacha, set }: { nom: string; dan: number | null; gacha: number | null; set: (d: number | null, g: number | null) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-text-mute">{nom}:</span>
      <input className={`${kirit} w-20`} inputMode="decimal" placeholder={t('dan')} value={dan ?? ''} onChange={(e) => set(sonOl(e.target.value), gacha)} aria-label={`${nom} ${t('dan')}`} />
      <input className={`${kirit} w-20`} inputMode="decimal" placeholder={t('gacha')} value={gacha ?? ''} onChange={(e) => set(dan, sonOl(e.target.value))} aria-label={`${nom} ${t('gacha')}`} />
    </div>
  );
}

function BirlikKarta({ b, ruxsat, yozish, yop, bron, holat, narx, bitim }: {
  b: Birlik; ruxsat: SotuvRuxsat; yozish: boolean; yop: () => void; bron: () => void; holat: () => void; narx: () => void; bitim: (id: number) => void;
}) {
  const qoldi = bronQoldi(b.bron_tugaydi);
  const qator = (nom: string, v: ReactNode) => <div className="flex justify-between gap-3 border-b border-border/50 py-1"><span className="text-text-mute">{nom}</span><span className="text-right">{v}</span></div>;
  return (
    <ModalOyna sarlavha={t('Birlik {raqam}', { raqam: b.raqam })} yop={yop} kenglik={440}>
      <div className="text-[13px]">
        <p className="mb-2 inline-flex items-center gap-1.5"><i className={`inline-block h-2.5 w-2.5 rounded-sm ${HOLAT_NUQTA[b.holat]}`} />{HOLAT_NOMI[b.holat]()}</p>
        {qator(t('Podyezd / qavat'), `${b.podyezd ?? '—'} / ${b.qavat ?? '—'}`)}
        {qator(t('Xonalar'), b.xona_soni ?? '—')}
        {qator(t('Maydon, m²'), b.maydon ?? '—')}
        {b.maydon_yashash != null && qator(t('Yashash maydoni, m²'), b.maydon_yashash)}
        {b.pardoz && qator(t('Pardoz'), b.pardoz)}
        {qator(t('m² narxi'), <Pul val={b.narx_m2} valyuta={b.valyuta} />)}
        {qator(t('Narx (jami)'), <b><Pul val={b.narx_jami} valyuta={b.valyuta} /></b>)}
        {b.holat === 'bron' && qator(t('Bron tugaydi'), <span><Sana v={b.bron_tugaydi} />{qoldi && !qoldi.otdi ? ` · ${t('{s} soat {d} daqiqa qoldi', { s: qoldi.soat, d: qoldi.daqiqa })}` : ''}</span>)}
        {b.mijoz && qator(t('Mijoz'), b.mijoz)}
        <div className="mt-3 flex flex-wrap gap-2">
          {yozish && b.holat === 'bosh' && <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" onClick={bron} disabled={b.narx_m2 == null} title={b.narx_m2 == null ? t('Birlikka narx qo‘yilmagan — avval narx belgilang.') : undefined}>{t('Bron qilish')}</button>}
          {b.bitim_id != null && <button type="button" className="fz-btn fz-btn--sm" onClick={() => bitim(b.bitim_id!)}>{t('Bitimni ochish')}</button>}
          {ruxsat.narx && b.holat !== 'bron' && b.holat !== 'sotilgan' && <button type="button" className="fz-btn fz-btn--sm" onClick={narx}>{t('Narxni o‘zgartirish')}</button>}
          {ruxsat.narx && b.holat !== 'bron' && b.holat !== 'sotilgan' && <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={holat}>{t('Holatni o‘zgartirish')}</button>}
        </div>
      </div>
    </ModalOyna>
  );
}
