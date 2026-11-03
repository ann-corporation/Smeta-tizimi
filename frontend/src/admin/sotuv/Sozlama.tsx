/**
 * Loyiha sotuv sozlamasi (sales.price): reyestr raqami/sanasi, eskrou bank/hisob, topshirish sanasi, tavsif, bron muddati,
 * «Sotuvda» belgisi. Qoida (PP-4732): reklama va sotuv — faqat reyestrga kiritilgandan keyin (server ham REYESTR_KERAK qaytaradi).
 * Diqqat: server barcha maydonlarni birga yozadi — panel bermaydigan maydonlar (reyestr sanasi, eskrou bank, tavsif) qayta kiritiladi.
 */
import { useRef, useState } from 'react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { loyihaSaqla, type SotuvPanel } from '../../api/t2-sotuv';
import { Maydon } from './umumiy';
import { kirit, sonOl, useSotuvYangila, xatoMatn } from './sotuv-umumiy';

type Loyiha = SotuvPanel['loyihalar'][number];

export function Sozlama({ kid, loyihalar }: { kid: number; loyihalar: readonly Loyiha[] }) {
  const [id, setId] = useState<number | null>(loyihalar[0]?.loyiha_id ?? null);
  const l = loyihalar.find((x) => x.loyiha_id === id) ?? null;
  if (!loyihalar.length) return <p className="fz-note fz-note--info">{t('Kompaniyada loyiha yo‘q. Avval «Loyihalar» bo‘limida loyiha yarating.')}</p>;
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <Maydon nom={t('Loyiha')} cl="max-w-sm">
        <select className={kirit} value={id ?? ''} onChange={(e) => setId(Number(e.target.value) || null)}>
          {loyihalar.map((x) => <option key={x.loyiha_id} value={x.loyiha_id}>{x.nom}</option>)}
        </select>
      </Maydon>
      {l && <LoyihaForma key={l.loyiha_id} kid={kid} l={l} />}
    </div>
  );
}

function LoyihaForma({ kid, l }: { kid: number; l: Loyiha }) {
  const [f, setF] = useState({
    reyestr_raqam: l.reyestr_raqam ?? '', reyestr_sana: '', eskrou_bank: '', eskrou_hisob: l.eskrou_hisob ?? '',
    topshirish_sana: l.topshirish_sana?.slice(0, 10) ?? '', tavsif: '', bron_soat: String(l.bron_soat ?? 72), sotuvda: l.sotuvda,
  });
  const [band, setBand] = useState(false);
  const op = useRef(yangiOperationId());
  const yangila = useSotuvYangila();
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const reyestrYoq = !f.reyestr_raqam.trim();
  const soat = sonOl(f.bron_soat);
  const ok = soat != null && soat >= 1 && soat <= 720 && !(f.sotuvda && reyestrYoq);

  const saqla = async () => {
    setBand(true);
    const r = await loyihaSaqla(kid, l.loyiha_id, {
      reyestr_raqam: f.reyestr_raqam.trim() || null, reyestr_sana: f.reyestr_sana || null, eskrou_bank: f.eskrou_bank.trim() || null,
      eskrou_hisob: f.eskrou_hisob.trim() || null, topshirish_sana: f.topshirish_sana || null, tavsif: f.tavsif.trim() || null,
      sotuvda: f.sotuvda, bron_soat: Math.trunc(soat ?? 72),
    }, op.current);
    setBand(false);
    op.current = yangiOperationId();
    if (!r.ok) { toast(xatoMatn(r), 'danger'); return; }
    toast(t('Saqlandi')); yangila();
  };
  const txt = (k: Exclude<keyof typeof f, 'sotuvda'>, nom: string, tur = 'text') => (
    <Maydon nom={nom}><input type={tur} className={kirit} value={f[k]} onChange={(e) => set(k, e.target.value)} aria-label={nom} /></Maydon>
  );
  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-3 text-[13px]">
      <p className="fz-note fz-note--info">{t('PP-4732: uy-joy reklamasi va sotuvi faqat loyiha reyestrga kiritilgandan keyin. Reyestr raqamisiz «Sotuvda» yoqilmaydi.')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {txt('reyestr_raqam', t('Reyestr raqami'))}
        {txt('reyestr_sana', t('Reyestr sanasi'), 'date')}
        {txt('eskrou_bank', t('Eskrou banki'))}
        {txt('eskrou_hisob', t('Eskrou hisobi'))}
        {txt('topshirish_sana', t('Topshirish sanasi'), 'date')}
        {txt('bron_soat', t('Bron muddati, soat (1–720)'))}
      </div>
      <Maydon nom={t('Tavsif')}><textarea className={kirit} rows={3} value={f.tavsif} onChange={(e) => set('tavsif', e.target.value)} aria-label={t('Tavsif')} /></Maydon>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={f.sotuvda} disabled={reyestrYoq && !f.sotuvda} onChange={(e) => set('sotuvda', e.target.checked)} />
        {t('Sotuvda (reklama va bron ochiq)')}
      </label>
      {f.sotuvda && reyestrYoq && <p className="fz-note fz-note--danger">{t('Sotuvga chiqarish uchun reyestr raqami kerak (PP-4732).')}</p>}
      <p className="text-[11.5px] text-text-mute">{t('Saqlashda reyestr sanasi, eskrou banki va tavsif ham yoziladi — bo‘sh qoldirilsa tozalanadi.')}</p>
      <div className="flex justify-end"><button type="button" className="fz-btn fz-btn--primary" disabled={!ok || band} onClick={saqla}>{t('Saqlash')}</button></div>
    </div>
  );
}
