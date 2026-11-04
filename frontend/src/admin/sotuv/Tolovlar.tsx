/** Bitim to'lovlari: ro'yxat, «To'lov qo'shish» va bekor qilish (sababi bilan) — faqat sales.payment; ipoteka kalkulyatori. */
import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { ModalOyna } from '../../components/pto-workspace/ModalOyna';
import { yangiOperationId } from '../../api/supabase';
import { tolovBekor, tolovYoz, type SotuvTolov, type TolovUsul, type Valyuta } from '../../api/t2-sotuv';
import { ipoteka } from '../../lib/sotuv/hisob';
import { bugun } from '../../lib/sotuv/bitim-korinish';
import { Maydon, Pul, Sana } from './umumiy';
import { USUL_NOMI, kirit, sonOl, useSotuvYangila, xatoMatn } from './sotuv-umumiy';

const TUR_NOMI: Record<SotuvTolov['tur'], () => string> = { tolov: () => t('To‘lov'), bron: () => t('Bron to‘lovi'), qaytarim: () => t('Qaytarim') };

export function Tolovlar({ kid, bitimId, tolovlar, valyuta, tolovRuxsat, shartnomadan }: {
  kid: number; bitimId: number; tolovlar: readonly SotuvTolov[]; valyuta: Valyuta; tolovRuxsat: boolean; shartnomadan: boolean;
}) {
  const [qosh, setQosh] = useState(false);
  const [bekor, setBekor] = useState<SotuvTolov | null>(null);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-text-mute">{t('To‘lovlar')}</h4>
        {tolovRuxsat && <button type="button" className="fz-btn fz-btn--sm" onClick={() => setQosh(true)}><Plus size={14} aria-hidden="true" />{t('To‘lov qo‘shish')}</button>}
      </div>
      {!tolovlar.length ? <p className="text-[12px] text-text-mute">{t('To‘lov yo‘q')}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-left text-text-mute"><tr><th className="px-1">{t('Sana')}</th><th className="px-1">{t('Tur')}</th><th className="px-1">{t('Usul')}</th><th className="px-1">{t('Hujjat')}</th><th className="px-1 text-right">{t('Summa')}</th><th /></tr></thead>
            <tbody>
              {tolovlar.map((p) => (
                <tr key={p.id} className={`border-t border-border/50 ${p.holat === 'bekor' ? 'text-text-mute line-through' : ''}`}>
                  <td className="px-1"><Sana v={p.sana} /></td><td className="px-1">{TUR_NOMI[p.tur]?.() ?? p.tur}</td><td className="px-1">{USUL_NOMI[p.usul]?.() ?? p.usul}</td>
                  <td className="px-1">{p.hujjat ?? (p as unknown as { hujjat_raqam?: string }).hujjat_raqam ?? '—'}</td>
                  <td className="px-1 text-right"><Pul val={p.tur === 'qaytarim' ? -p.summa : p.summa} valyuta={valyuta} /></td>
                  <td className="px-1 text-right">{tolovRuxsat && p.holat !== 'bekor' && (
                    <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" onClick={() => setBekor(p)} aria-label={t('To‘lovni bekor qilish')}><X size={13} aria-hidden="true" /></button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {qosh && <TolovQosh kid={kid} bitimId={bitimId} valyuta={valyuta} shartnomadan={shartnomadan} yop={() => setQosh(false)} />}
      {bekor && <TolovBekorDialog kid={kid} tolov={bekor} valyuta={valyuta} yop={() => setBekor(null)} />}
    </div>
  );
}

function TolovQosh({ kid, bitimId, valyuta, shartnomadan, yop }: { kid: number; bitimId: number; valyuta: Valyuta; shartnomadan: boolean; yop: () => void }) {
  const [sana, setSana] = useState(bugun());
  const [summa, setSumma] = useState('');
  const [tur, setTur] = useState<SotuvTolov['tur']>(shartnomadan ? 'tolov' : 'bron');
  const [usul, setUsul] = useState<TolovUsul>('bank');
  const [hujjat, setHujjat] = useState('');
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  const op = useRef(yangiOperationId());
  const yangila = useSotuvYangila();
  const s = sonOl(summa);
  const ok = s != null && s > 0 && /^\d{4}-\d{2}-\d{2}$/.test(sana) && (tur !== 'tolov' || shartnomadan);
  const saqla = async () => {
    if (s == null) return;
    setBand(true);
    const r = await tolovYoz(kid, { bitimId, sana, summa: s, tur, usul, hujjat: hujjat.trim() || undefined, izoh: izoh.trim() || undefined, operationId: op.current });
    setBand(false);
    if (!r.ok) { toast(xatoMatn(r), 'danger'); return; }
    toast(t('To‘lov yozildi')); yangila(); yop();
  };
  return (
    <ModalOyna sarlavha={t('To‘lov qo‘shish')} yop={yop} kenglik={460}>
      <div className="space-y-3 text-[13px]">
        <div className="grid grid-cols-2 gap-2">
          <Maydon nom={t('Sana')}><input type="date" className={kirit} value={sana} max={bugun()} onChange={(e) => setSana(e.target.value)} aria-label={t('Sana')} /></Maydon>
          <Maydon nom={t('Summa')}><MoneyInput className={kirit} value={summa} onValueChange={setSumma} aria-label={t('Summa')} autoFocus /></Maydon>
          <Maydon nom={t('Tur')}>
            <select className={kirit} value={tur} onChange={(e) => setTur(e.target.value as SotuvTolov['tur'])}>
              {(['tolov', 'bron', 'qaytarim'] as const).map((x) => <option key={x} value={x}>{TUR_NOMI[x]()}</option>)}
            </select>
          </Maydon>
          <Maydon nom={t('Usul')}>
            <select className={kirit} value={usul} onChange={(e) => setUsul(e.target.value as TolovUsul)}>
              {(Object.keys(USUL_NOMI) as TolovUsul[]).map((x) => <option key={x} value={x}>{USUL_NOMI[x]()}</option>)}
            </select>
          </Maydon>
          <Maydon nom={t('Hujjat raqami')} cl="col-span-2"><input className={kirit} value={hujjat} onChange={(e) => setHujjat(e.target.value)} aria-label={t('Hujjat raqami')} /></Maydon>
          <Maydon nom={t('Izoh')} cl="col-span-2"><input className={kirit} value={izoh} onChange={(e) => setIzoh(e.target.value)} aria-label={t('Izoh')} /></Maydon>
        </div>
        {tur === 'tolov' && !shartnomadan && <p className="fz-note fz-note--warn">{t('To‘lov faqat shartnomadan keyin yoziladi.')}</p>}
        {s != null && s > 0 && <p className="text-text-dim">{t('Summa')}: <Pul val={s} valyuta={valyuta} /></p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={yop}>{t('Bekor qilish')}</button>
          <button type="button" className="fz-btn fz-btn--primary" disabled={!ok || band} onClick={saqla}>{t('Saqlash')}</button>
        </div>
      </div>
    </ModalOyna>
  );
}

function TolovBekorDialog({ kid, tolov, valyuta, yop }: { kid: number; tolov: SotuvTolov; valyuta: Valyuta; yop: () => void }) {
  const [sabab, setSabab] = useState('');
  const [band, setBand] = useState(false);
  const yangila = useSotuvYangila();
  const saqla = async () => {
    setBand(true);
    const r = await tolovBekor(kid, tolov.id, sabab.trim());
    setBand(false);
    if (!r.ok) { toast(xatoMatn(r), 'danger'); return; }
    toast(t('To‘lov bekor qilindi')); yangila(); yop();
  };
  return (
    <ModalOyna sarlavha={t('To‘lovni bekor qilish')} yop={yop} kenglik={420}>
      <div className="space-y-3 text-[13px]">
        <p className="text-text-dim"><Sana v={tolov.sana} /> · <Pul val={tolov.summa} valyuta={valyuta} /></p>
        <Maydon nom={t('Sabab (kamida 3 harf)')}><input className={kirit} value={sabab} onChange={(e) => setSabab(e.target.value)} aria-label={t('Sabab')} autoFocus /></Maydon>
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={yop}>{t('Yopish')}</button>
          <button type="button" className="fz-btn fz-btn--danger" disabled={sabab.trim().length < 3 || band} onClick={saqla}>{t('Bekor qilish')}</button>
        </div>
      </div>
    </ModalOyna>
  );
}

/** Ipoteka kalkulyatori (xaridor uchun ko'rsatma; yozmaydi). */
export function IpotekaKalk({ narx, valyuta, subsidiya }: { narx: number; valyuta: Valyuta; subsidiya: number | null }) {
  const [bosh, setBosh] = useState(String(Math.trunc(narx * 0.2)));
  const [foiz, setFoiz] = useState('17');
  const [yil, setYil] = useState('15');
  const [sub, setSub] = useState(subsidiya != null ? String(subsidiya) : '');
  const n = ipoteka({ narx, boshlangich: sonOl(bosh) ?? 0, yillikFoiz: sonOl(foiz) ?? 0, yillar: sonOl(yil) ?? 0, subsidiya: sonOl(sub) ?? 0 });
  return (
    <div className="rounded-md border border-border p-2">
      <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-mute">{t('Ipoteka kalkulyatori')}</h4>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Maydon nom={t('Boshlang‘ich to‘lov')}><MoneyInput className={kirit} value={bosh} onValueChange={setBosh} aria-label={t('Boshlang‘ich to‘lov')} /></Maydon>
        <Maydon nom={t('Yillik foiz, %')}><input className={kirit} inputMode="decimal" value={foiz} onChange={(e) => setFoiz(e.target.value)} aria-label={t('Yillik foiz')} /></Maydon>
        <Maydon nom={t('Muddat, yil')}><input className={kirit} inputMode="numeric" value={yil} onChange={(e) => setYil(e.target.value)} aria-label={t('Muddat, yil')} /></Maydon>
        <Maydon nom={t('Subsidiya')}><MoneyInput className={kirit} value={sub} onValueChange={setSub} aria-label={t('Subsidiya')} /></Maydon>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px] sm:grid-cols-4">
        <div><dt className="text-text-mute">{t('Kredit')}</dt><dd><Pul val={n.kredit} valyuta={valyuta} /></dd></div>
        <div><dt className="text-text-mute">{t('Oylik to‘lov')}</dt><dd><b><Pul val={n.oylik} valyuta={valyuta} /></b></dd></div>
        <div><dt className="text-text-mute">{t('Jami to‘lov')}</dt><dd><Pul val={n.jamiTolov} valyuta={valyuta} /></dd></div>
        <div><dt className="text-text-mute">{t('Jami foiz')}</dt><dd><Pul val={n.jamiFoiz} valyuta={valyuta} /></dd></div>
      </dl>
      <p className="mt-1 text-[11.5px] text-text-mute">{t('Boshlang‘ich to‘lov ulushi: {f}%', { f: n.boshlangichFoiz })}</p>
    </div>
  );
}
