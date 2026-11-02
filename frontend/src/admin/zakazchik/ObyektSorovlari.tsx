/**
 * ObyektSorovlari.tsx - buyurtmachining obyekt bo'yicha so'rovlari: o'zgartirish / qo'shimcha ish so'rovi va hujjat so'rovi.
 * Yangi mexanizm YO'Q: mavjud murojaat primitivi (t2_tomon_murojaat) - pudratchi javob + dalil beradi, buyurtmachi yopadi.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '../../umumiy/ui/Toast';
import { murojaatYarat, murojaatlarOl, type MurojaatQisqa } from '../../api/t2-tomon';
import { t } from '../../i18n/til';
import { Bolim } from './tomon-ui';
import { inp, sana, tugma, tugmaAsosiy } from './tomon-yordam';

const SOROV_TURLARI = ['ozgartirish_sorovi', 'hujjat_sorovi'] as const;
const TUR_NOMI: Record<string, string> = { ozgartirish_sorovi: 'O‘zgartirish / qo‘shimcha ish so‘rovi', hujjat_sorovi: 'Hujjat so‘rovi' };
const HOLAT_NOMI: Record<string, string> = { ochiq: 'Ochiq', bajarildi: 'Bajarildi (tasdiqlang)', yopildi: 'Yopildi', bekor: 'Bekor qilingan' };

export default function ObyektSorovlari({ kompaniyaId, aloqaId, obyektId, obyektNom }: { kompaniyaId: number; aloqaId: number; obyektId: number; obyektNom: string }) {
  const [royxat, setRoyxat] = useState<MurojaatQisqa[]>([]);
  const [ochiq, setOchiq] = useState(false);
  const [turi, setTuri] = useState<(typeof SOROV_TURLARI)[number]>('ozgartirish_sorovi');
  const [sarlavha, setSarlavha] = useState('');
  const [matn, setMatn] = useState('');
  const [band, setBand] = useState(false);

  const yukla = useCallback(async () => {
    const r = await murojaatlarOl(kompaniyaId, { yonalish: 'mendan', aloqaId });
    if (r.ok) setRoyxat(r.natija.filter((x) => (SOROV_TURLARI as readonly string[]).includes(x.turi) && x.obyekt_nom === obyektNom));
  }, [kompaniyaId, aloqaId, obyektNom]);
  useEffect(() => { void yukla(); }, [yukla]);

  const yubor = async () => {
    if (sarlavha.trim().length < 3) { toast(t('Sarlavha kamida 3 belgi bo‘lsin'), 'danger'); return; }
    setBand(true);
    const r = await murojaatYarat(kompaniyaId, { aloqaId, turi, sarlavha, matn, obyektId });
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('So‘rov pudratchiga yuborildi'), 'ok'); setSarlavha(''); setMatn(''); setOchiq(false); void yukla();
  };

  return (
    <Bolim sarlavha="So‘rovlar" amal={<div className="flex items-center gap-3">
      <Link to="/admin/murojaatlar" className="text-xs text-accent underline">{t('Hammasi')}</Link>
      <button type="button" className={tugmaAsosiy} onClick={() => setOchiq((v) => !v)}>{t('Yangi so‘rov')}</button></div>}>
      {ochiq && (
        <div className="mb-3 space-y-2 rounded border border-border p-2">
          <div className="flex flex-wrap gap-2">
            {SOROV_TURLARI.map((k) => (
              <label key={k} className="flex items-center gap-1 text-xs"><input type="radio" name="sorov-turi" checked={turi === k} onChange={() => setTuri(k)} />{t(TUR_NOMI[k])}</label>))}
          </div>
          <input className={`${inp} w-full`} value={sarlavha} maxLength={200} onChange={(e) => setSarlavha(e.target.value)} placeholder={t('Qisqa sarlavha')} aria-label={t('Qisqa sarlavha')} />
          <textarea className={`${inp} h-20 w-full`} value={matn} maxLength={4000} onChange={(e) => setMatn(e.target.value)} placeholder={t('Tafsilot: nimani o‘zgartirish yoki qaysi hujjat kerak')} aria-label={t('Tafsilot')} />
          <div className="flex gap-2"><button type="button" className={tugmaAsosiy} disabled={band} onClick={() => void yubor()}>{t('Yuborish')}</button>
            <button type="button" className={tugma} onClick={() => setOchiq(false)}>{t('Bekor qilish')}</button></div>
        </div>)}
      {royxat.length === 0 ? <p className="text-sm text-text-dim">{t('Bu obyekt bo‘yicha so‘rov yo‘q')}</p> : (
        <ul className="space-y-1">{royxat.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-2 text-sm"><b>{x.sarlavha}</b><span className="text-text-dim">{t(TUR_NOMI[x.turi] ?? x.turi)}</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px]">{t(HOLAT_NOMI[x.holat] ?? x.holat)}</span><span className="ml-auto text-xs text-text-dim">{sana(x.yaratildi)}</span></li>))}</ul>)}
    </Bolim>
  );
}
