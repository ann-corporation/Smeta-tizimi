/** Shaxmatka dialoglari: ommaviy narx o'zgartirish, birlik holati, bron qilish (mavjud yoki yangi bitim bilan). */
import { useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { ModalOyna } from '../../components/pto-workspace/ModalOyna';
import { yangiOperationId } from '../../api/supabase';
import { birlikHolat, bitimSaqla, bronQil, narxOzgartir, type Birlik } from '../../api/t2-sotuv';
import { tanlovXulosa, yangiNarxM2 } from '../../lib/sotuv/shaxmatka-korinish';
import { MANBALAR, OCHIQ_BOSQICH, telefonKorinish, type Manba } from '../../lib/sotuv/bitim-korinish';
import { telefonNorm } from '../../lib/sotuv/hisob';
import { Ixcham, Maydon, Pul } from './umumiy';
import { HOLAT_NOMI, MANBA_NOMI, kirit, sonOl, useSotuvYangila, xatoMatn } from './sotuv-umumiy';
import { useBitimlar, useShaxmatka } from './sorovlar';

type Usul = 'foiz' | 'summa_m2' | 'yangi_m2';

export function NarxDialog({ kid, birliklar, tanlangan, yop, tayyor }: {
  kid: number; birliklar: readonly Birlik[]; tanlangan: ReadonlySet<number>; yop: () => void; tayyor: () => void;
}) {
  const [usul, setUsul] = useState<Usul>('foiz');
  const [qiymat, setQiymat] = useState('');
  const [sabab, setSabab] = useState('');
  const [band, setBand] = useState(false);
  const op = useRef(yangiOperationId());
  const yangila = useSotuvYangila();
  const x = tanlovXulosa(birliklar, tanlangan);
  const q = sonOl(qiymat);
  const namuna = birliklar.find((b) => x.ids.includes(b.id) && b.narx_m2 != null);
  const sababOk = sabab.trim().length >= 3;
  const ok = q != null && sababOk && x.ozgaradi > 0 && (usul !== 'yangi_m2' || q > 0);

  const saqla = async () => {
    if (!ok || q == null) return;
    setBand(true);
    const r = await narxOzgartir(kid, { birlikIds: x.ids, usul, qiymat: q, sabab: sabab.trim(), operationId: op.current });
    setBand(false);
    if (!r.ok) { toast(xatoMatn(r), 'danger'); return; }
    toast(t('Narx o‘zgardi: {n} ta birlik', { n: r.ozgardi ?? 0 }));
    yangila(); tayyor();
  };

  return (
    <ModalOyna sarlavha={t('Narxni ommaviy o‘zgartirish')} yop={yop}>
      <div className="space-y-3 text-[13px]">
        <p className="text-text-dim">{t('Tanlangan: {n}; narxi o‘zgaradi: {m}; bron/sotilgan (o‘tkaziladi): {k}', { n: x.soni, m: x.ozgaradi, k: x.otkaziladi })}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Usul')}>
          {([['foiz', t('Foizga (±%)')], ['summa_m2', t('m² ga summa (±)')], ['yangi_m2', t('Yangi m² narx')]] as const).map(([k, nom]) => (
            <label key={k} className={`fz-chip cursor-pointer ${usul === k ? 'fz-chip--accent' : ''}`}>
              <input type="radio" className="sr-only" checked={usul === k} onChange={() => setUsul(k)} />{nom}
            </label>
          ))}
        </div>
        <Maydon nom={usul === 'foiz' ? t('Foiz') : t('Qiymat')}>
          <MoneyInput className={kirit} value={qiymat} onValueChange={setQiymat} aria-label={t('Qiymat')} />
        </Maydon>
        {usul !== 'yangi_m2' && x.narxsiz > 0 && <p className="fz-note fz-note--warn">{t('Narxsiz birliklar ({n}) — faqat «Yangi m² narx» bilan narxlanadi.', { n: x.narxsiz })}</p>}
        {namuna && q != null && (
          <p className="text-text-dim">{t('Namuna: {raqam}', { raqam: namuna.raqam })} — <Pul val={namuna.narx_m2} valyuta={namuna.valyuta} /> → <Pul val={yangiNarxM2(namuna.narx_m2, usul, q)} valyuta={namuna.valyuta} /> {t('/ m²')}</p>
        )}
        <Maydon nom={t('Sabab (kamida 3 harf)')}>
          <input className={kirit} value={sabab} onChange={(e) => setSabab(e.target.value)} aria-label={t('Sabab')} />
        </Maydon>
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={yop}>{t('Bekor qilish')}</button>
          <button type="button" className="fz-btn fz-btn--primary" disabled={!ok || band} onClick={saqla}>{t('Narxni o‘zgartirish')}</button>
        </div>
      </div>
    </ModalOyna>
  );
}

export function HolatDialog({ kid, birlik, yop, tayyor }: { kid: number; birlik: Birlik; yop: () => void; tayyor: () => void }) {
  const [holat, setHolat] = useState<'bosh' | 'sotuvda_emas' | 'zaxira'>(birlik.holat === 'bosh' ? 'zaxira' : 'bosh');
  const [sabab, setSabab] = useState('');
  const [band, setBand] = useState(false);
  const yangila = useSotuvYangila();
  const ok = sabab.trim().length >= 3 && holat !== birlik.holat;
  const saqla = async () => {
    setBand(true);
    const r = await birlikHolat(kid, birlik.id, holat, sabab.trim(), birlik.versiya);
    setBand(false);
    if (!r.ok) { toast(xatoMatn(r), 'danger'); if (r.code === 'VERSIYA') yangila(); return; }
    toast(t('Holat o‘zgardi')); yangila(); tayyor();
  };
  return (
    <ModalOyna sarlavha={t('Birlik holati')} yop={yop} kenglik={420}>
      <div className="space-y-3 text-[13px]">
        <p className="text-text-dim">{t('Birlik {raqam}: hozir «{holat}»', { raqam: birlik.raqam, holat: HOLAT_NOMI[birlik.holat]() })}</p>
        <Maydon nom={t('Yangi holat')}>
          <select className={kirit} value={holat} onChange={(e) => setHolat(e.target.value as typeof holat)}>
            {(['bosh', 'zaxira', 'sotuvda_emas'] as const).map((h) => <option key={h} value={h}>{HOLAT_NOMI[h]()}</option>)}
          </select>
        </Maydon>
        <Maydon nom={t('Sabab (kamida 3 harf)')}>
          <input className={kirit} value={sabab} onChange={(e) => setSabab(e.target.value)} aria-label={t('Sabab')} />
        </Maydon>
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={yop}>{t('Bekor qilish')}</button>
          <button type="button" className="fz-btn fz-btn--primary" disabled={!ok || band} onClick={saqla}>{t('Saqlash')}</button>
        </div>
      </div>
    </ModalOyna>
  );
}

/**
 * Bron: birlik (shaxmatkadan) yoki bitim (kanbandan) oldindan ma'lum bo'lishi mumkin; yetishmaganini shu yerda tanlaydi.
 * Yangi mijoz — avval lid (bitimSaqla), keyin bron (bronQil). Har bosqich o'z operation_id si bilan (qayta bosish xavfsiz).
 */
export function BronDialog({ kid, birlik, bitim, binolar, yop, tayyor }: {
  kid: number; birlik?: Birlik | null; bitim?: { id: number; mijoz: string } | null;
  binolar: ReadonlyArray<{ id: number; nom: string }>; yop: () => void; tayyor: (bitimId: number) => void;
}) {
  const [obyektId, setObyektId] = useState<number | null>(binolar[0]?.id ?? null);
  const sh = useShaxmatka(kid, birlik ? null : obyektId);
  const [birlikId, setBirlikId] = useState<number | null>(birlik?.id ?? null);
  const [rejim, setRejim] = useState<'mavjud' | 'yangi'>('mavjud');
  const [bitimId, setBitimId] = useState<number | null>(bitim?.id ?? null);
  const bitimlar = useBitimlar(kid, {}, !!bitim);
  const ochiqlar = useMemo(() => (bitimlar.data ?? []).filter((b) => (OCHIQ_BOSQICH as readonly string[]).includes(b.bosqich)), [bitimlar.data]);
  const [fio, setFio] = useState('');
  const [tel, setTel] = useState('');
  const [manba, setManba] = useState<Manba>('ofis');
  const [rozilik, setRozilik] = useState(false);
  const [soat, setSoat] = useState('');
  const [bronTolov, setBronTolov] = useState('');
  const [band, setBand] = useState(false);
  const opLid = useRef(yangiOperationId());
  const opBron = useRef(yangiOperationId());
  const yangila = useSotuvYangila();
  const boshlar = (sh.data?.birliklar ?? []).filter((b) => b.holat === 'bosh' && b.narx_m2 != null);
  const tanlanganBirlik = birlik ?? boshlar.find((b) => b.id === birlikId) ?? null;
  const yangiOk = fio.trim().length > 0 && telefonNorm(tel).length >= 9;
  const ok = !!tanlanganBirlik && (bitim ? true : rejim === 'mavjud' ? bitimId != null : yangiOk);

  const saqla = async () => {
    if (!tanlanganBirlik) return;
    setBand(true);
    let id = bitim?.id ?? (rejim === 'mavjud' ? bitimId : null);
    if (id == null) {
      const r = await bitimSaqla(kid, { mijoz: { fio: fio.trim(), telefon: tel.trim(), manba, rozilik }, manba }, opLid.current);
      if (!r.ok || !r.id) { setBand(false); toast(xatoMatn(r), 'danger'); return; }
      id = r.id;
    }
    const r = await bronQil(kid, { bitimId: id, birlikId: tanlanganBirlik.id, soat: sonOl(soat), tolovSumma: sonOl(bronTolov), operationId: opBron.current });
    setBand(false);
    if (!r.ok) { toast(xatoMatn(r), 'danger'); yangila(); return; }
    toast(t('Bron qilindi')); yangila(); tayyor(id);
  };

  return (
    <ModalOyna sarlavha={t('Bron qilish')} yop={yop} kenglik={560}>
      <div className="space-y-3 text-[13px]">
        {birlik ? (
          <p className="text-text-dim">{t('Birlik {raqam}', { raqam: birlik.raqam })} · <Pul val={birlik.narx_jami} valyuta={birlik.valyuta} /></p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Maydon nom={t('Bino')}>
              <select className={kirit} value={obyektId ?? ''} onChange={(e) => { setObyektId(Number(e.target.value) || null); setBirlikId(null); }}>
                {binolar.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </Maydon>
            <Maydon nom={t('Bo‘sh birlik')}>
              <select className={kirit} value={birlikId ?? ''} onChange={(e) => setBirlikId(Number(e.target.value) || null)}>
                <option value="">{t('— tanlang —')}</option>
                {boshlar.map((b) => <option key={b.id} value={b.id}>{`${b.raqam} · ${b.xona_soni ?? '—'}x · ${b.maydon ?? '—'} m²`}</option>)}
              </select>
            </Maydon>
            {tanlanganBirlik && <p className="text-text-dim sm:col-span-2">{t('Narx')}: <Ixcham val={tanlanganBirlik.narx_jami} /></p>}
          </div>
        )}

        {bitim ? (
          <p>{t('Mijoz')}: <b>{bitim.mijoz}</b></p>
        ) : (
          <>
            <div className="flex gap-2" role="radiogroup" aria-label={t('Mijoz')}>
              <label className={`fz-chip cursor-pointer ${rejim === 'mavjud' ? 'fz-chip--accent' : ''}`}><input type="radio" className="sr-only" checked={rejim === 'mavjud'} onChange={() => setRejim('mavjud')} />{t('Mavjud bitim')}</label>
              <label className={`fz-chip cursor-pointer ${rejim === 'yangi' ? 'fz-chip--accent' : ''}`}><input type="radio" className="sr-only" checked={rejim === 'yangi'} onChange={() => setRejim('yangi')} />{t('Yangi mijoz')}</label>
            </div>
            {rejim === 'mavjud' ? (
              <Maydon nom={t('Bitim')}>
                <select className={kirit} value={bitimId ?? ''} onChange={(e) => setBitimId(Number(e.target.value) || null)}>
                  <option value="">{t('— tanlang —')}</option>
                  {ochiqlar.map((b) => <option key={b.id} value={b.id}>{`${b.mijoz} · ${telefonKorinish(b.telefon)}`}</option>)}
                </select>
              </Maydon>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <Maydon nom={t('F.I.O.')}><input className={kirit} value={fio} onChange={(e) => setFio(e.target.value)} aria-label={t('F.I.O.')} /></Maydon>
                <Maydon nom={t('Telefon')}><input className={kirit} value={tel} inputMode="tel" onChange={(e) => setTel(e.target.value)} aria-label={t('Telefon')} /></Maydon>
                <Maydon nom={t('Manba')}>
                  <select className={kirit} value={manba} onChange={(e) => setManba(e.target.value as Manba)}>
                    {MANBALAR.map((m) => <option key={m} value={m}>{MANBA_NOMI[m]()}</option>)}
                  </select>
                </Maydon>
                <label className="flex items-center gap-2 self-end pb-1.5"><input type="checkbox" checked={rozilik} onChange={(e) => setRozilik(e.target.checked)} />{t('Shaxsiy ma’lumotga rozilik')}</label>
              </div>
            )}
          </>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Maydon nom={t('Muddat (soat; bo‘sh — loyiha sozlamasi)')}><input className={kirit} value={soat} inputMode="numeric" onChange={(e) => setSoat(e.target.value)} aria-label={t('Muddat (soat)')} /></Maydon>
          <Maydon nom={t('Bron to‘lovi (ixtiyoriy)')}><MoneyInput className={kirit} value={bronTolov} onValueChange={setBronTolov} aria-label={t('Bron to‘lovi')} /></Maydon>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={yop}>{t('Bekor qilish')}</button>
          <button type="button" className="fz-btn fz-btn--primary" disabled={!ok || band} onClick={saqla}>{t('Bron qilish')}</button>
        </div>
      </div>
    </ModalOyna>
  );
}
