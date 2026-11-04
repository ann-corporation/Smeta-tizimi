/**
 * Shaxmatka generatori: podyezd × qavat × namuna (xonalar, m², m² narx) → birliklar ro'yxati (lib/sotuv/hisob.birliklarYasa),
 * oldindan ko'rish, keyin bitta yozuv (birliklarSaqla — raqam bo'yicha upsert; bron/sotilganga tegmaydi).
 */
import { useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { ModalOyna } from '../../components/pto-workspace/ModalOyna';
import { yangiOperationId } from '../../api/supabase';
import { birliklarSaqla, type Valyuta } from '../../api/t2-sotuv';
import { birliklarYasa } from '../../lib/sotuv/hisob';
import { Maydon, Pul } from './umumiy';
import { kirit, sonOl, useSotuvYangila, xatoMatn } from './sotuv-umumiy';

type Namuna = { xona: string; maydon: string; narx: string };
const CHEGARA = 3000;

export function BirlikGenerator({ kid, obyektId, yop, tayyor }: { kid: number; obyektId: number; yop: () => void; tayyor: () => void }) {
  const [podyezdlar, setPodyezdlar] = useState('1');
  const [qavatlar, setQavatlar] = useState('9');
  const [boshQavat, setBoshQavat] = useState('1');
  const [raqamlash, setRaqamlash] = useState<'ketma' | 'kod'>('ketma');
  const [qavatQoshimcha, setQavatQoshimcha] = useState('');
  const [tijoratQavat, setTijoratQavat] = useState('');
  const [valyuta, setValyuta] = useState<Valyuta>('UZS');
  const [namunalar, setNamunalar] = useState<Namuna[]>([{ xona: '1', maydon: '40', narx: '' }, { xona: '2', maydon: '60', narx: '' }, { xona: '3', maydon: '80', narx: '' }]);
  const [band, setBand] = useState(false);
  const op = useRef(yangiOperationId());
  const yangila = useSotuvYangila();

  const qatorlar = useMemo(() => {
    const p = sonOl(podyezdlar) ?? 0; const q = sonOl(qavatlar) ?? 0;
    const nm = namunalar.map((n) => ({ xona_soni: sonOl(n.xona) ?? 0, maydon: sonOl(n.maydon) ?? 0, narx_m2: sonOl(n.narx) }))
      .filter((n) => n.maydon > 0);
    if (!(p >= 1 && p <= 99 && q >= 1 && q <= 150) || !nm.length) return [];
    if (p * q * nm.length > CHEGARA) return null;
    return birliklarYasa({ podyezdlar: p, qavatlar: q, boshQavat: sonOl(boshQavat) ?? 1, namunalar: nm, raqamlash,
      qavatQoshimcha: sonOl(qavatQoshimcha) ?? undefined, tijoratQavat: sonOl(tijoratQavat) ?? undefined });
  }, [podyezdlar, qavatlar, boshQavat, namunalar, raqamlash, qavatQoshimcha, tijoratQavat]);

  const jamiMaydon = (qatorlar ?? []).reduce((s, q) => s + q.maydon, 0);
  const narxlilar = (qatorlar ?? []).filter((q) => q.narx_m2 != null);
  const jamiQiymat = narxlilar.reduce((s, q) => s + q.maydon * (q.narx_m2 ?? 0), 0);

  const ozgart = (i: number, k: keyof Namuna, v: string) => setNamunalar((n) => n.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const saqla = async () => {
    if (!qatorlar?.length) return;
    setBand(true);
    const r = await birliklarSaqla(kid, obyektId, qatorlar.map((q) => ({ ...q, valyuta })), op.current);
    setBand(false);
    if (!r.ok) { toast(xatoMatn(r), 'danger'); return; }
    toast(t('Birliklar saqlandi: yangi {y}, yangilandi {u}, o‘tkazildi {o}', { y: r.yangi ?? 0, u: r.yangilandi ?? 0, o: r.otkazildi ?? 0 }));
    yangila(); tayyor();
  };

  return (
    <ModalOyna sarlavha={t('Birliklar yaratish')} yop={yop} kenglik={760}>
      <div className="space-y-3 text-[13px]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Maydon nom={t('Podyezdlar')}><input className={kirit} inputMode="numeric" value={podyezdlar} onChange={(e) => setPodyezdlar(e.target.value)} aria-label={t('Podyezdlar')} /></Maydon>
          <Maydon nom={t('Qavatlar')}><input className={kirit} inputMode="numeric" value={qavatlar} onChange={(e) => setQavatlar(e.target.value)} aria-label={t('Qavatlar')} /></Maydon>
          <Maydon nom={t('Birinchi qavat')}><input className={kirit} inputMode="numeric" value={boshQavat} onChange={(e) => setBoshQavat(e.target.value)} aria-label={t('Birinchi qavat')} /></Maydon>
          <Maydon nom={t('Raqamlash')}>
            <select className={kirit} value={raqamlash} onChange={(e) => setRaqamlash(e.target.value as 'ketma' | 'kod')}>
              <option value="ketma">{t('Ketma-ket (1, 2, 3 …)')}</option>
              <option value="kod">{t('Podyezd-qavat-№ (2-05-3)')}</option>
            </select>
          </Maydon>
          <Maydon nom={t('Qavat ustamasi, % (har qavatga)')}><input className={kirit} inputMode="decimal" value={qavatQoshimcha} onChange={(e) => setQavatQoshimcha(e.target.value)} aria-label={t('Qavat ustamasi')} /></Maydon>
          <Maydon nom={t('Tijorat qavati (shu qavatgacha)')}><input className={kirit} inputMode="numeric" value={tijoratQavat} onChange={(e) => setTijoratQavat(e.target.value)} aria-label={t('Tijorat qavati')} /></Maydon>
          <Maydon nom={t('Valyuta')}>
            <select className={kirit} value={valyuta} onChange={(e) => setValyuta(e.target.value as Valyuta)}>
              <option value="UZS">{'UZS'}</option><option value="USD">{'USD'}</option>
            </select>
          </Maydon>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[12px] font-medium text-text-dim">{t('Qavatdagi xonadonlar (chapdan o‘ngga)')}</span>
            <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => setNamunalar((n) => [...n, { xona: '2', maydon: '', narx: '' }])}><Plus size={14} aria-hidden="true" />{t('Namuna qo‘shish')}</button>
          </div>
          <div className="space-y-1.5">
            {namunalar.map((n, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto] items-end gap-2">
                <Maydon nom={t('Xonalar')}><input className={kirit} inputMode="numeric" value={n.xona} onChange={(e) => ozgart(i, 'xona', e.target.value)} aria-label={t('Xonalar')} /></Maydon>
                <Maydon nom={t('Maydon, m²')}><input className={kirit} inputMode="decimal" value={n.maydon} onChange={(e) => ozgart(i, 'maydon', e.target.value)} aria-label={t('Maydon, m²')} /></Maydon>
                <Maydon nom={t('m² narxi (bo‘sh — narxsiz)')}><MoneyInput className={kirit} value={n.narx} onValueChange={(v) => ozgart(i, 'narx', v)} aria-label={t('m² narxi')} /></Maydon>
                <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm mb-0.5" disabled={namunalar.length <= 1} onClick={() => setNamunalar((x) => x.filter((_, j) => j !== i))} aria-label={t('O‘chirish')}><Trash2 size={14} aria-hidden="true" /></button>
              </div>
            ))}
          </div>
        </div>

        {qatorlar === null ? (
          <p className="fz-note fz-note--danger">{t('Juda ko‘p birlik (chegara {n}). Binoni qismlarga bo‘lib yarating.', { n: CHEGARA })}</p>
        ) : (
          <div className="rounded-md border border-border p-2">
            <p className="mb-2 text-text-dim">
              {t('Oldindan ko‘rish: {n} ta birlik, jami {m} m²', { n: qatorlar.length, m: Number(jamiMaydon.toFixed(2)) })}
              {narxlilar.length > 0 && <> · {t('Qiymat')}: <Pul val={jamiQiymat} valyuta={valyuta} /></>}
              {narxlilar.length < qatorlar.length && <> · {t('Narxsiz: {n}', { n: qatorlar.length - narxlilar.length })}</>}
            </p>
            <div className="max-h-56 overflow-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-surface text-left text-text-mute">
                  <tr><th className="px-1">{t('Raqam')}</th><th className="px-1">{t('Podyezd')}</th><th className="px-1">{t('Qavat')}</th><th className="px-1">{t('Xonalar')}</th><th className="px-1">{t('m²')}</th><th className="px-1">{t('m² narxi')}</th><th className="px-1">{t('Tur')}</th></tr>
                </thead>
                <tbody>
                  {qatorlar.slice(0, 200).map((q) => (
                    <tr key={q.raqam} className="border-t border-border/50">
                      <td className="px-1 tabular-nums">{q.raqam}</td><td className="px-1">{q.podyezd}</td><td className="px-1">{q.qavat}</td><td className="px-1">{q.xona_soni}</td>
                      <td className="px-1 tabular-nums">{q.maydon}</td><td className="px-1"><Pul val={q.narx_m2} valyuta={valyuta} /></td>
                      <td className="px-1">{q.tur === 'tijorat' ? t('Tijorat') : t('Xonadon')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {qatorlar.length > 200 && <p className="mt-1 text-text-mute">{t('… yana {n} ta', { n: qatorlar.length - 200 })}</p>}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={yop}>{t('Bekor qilish')}</button>
          <button type="button" className="fz-btn fz-btn--primary" disabled={!qatorlar?.length || band} onClick={saqla}>{t('Saqlash')}</button>
        </div>
      </div>
    </ModalOyna>
  );
}
