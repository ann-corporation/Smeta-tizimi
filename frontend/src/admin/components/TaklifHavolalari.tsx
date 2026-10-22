/**
 * Taklif havolalari («Telegram modeli», egasi 2026-10-22): rahbar havola yaratadi (rol, muddat, necha kishi) —
 * odam havolani ochib, tasdiqsiz qo'shiladi. Havola/kod faqat yaratilganda BIR MARTA ko'rsatiladi (bazada xeshi).
 */
import { useEffect, useState } from 'react';
import { Copy, Link2, Loader2, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { ROLE_LABELS } from '../../lib/company-authorization/permission-labels';
import { TAKLIF_ROLLARI, ishJoyiXato, taklifBekor, taklifHavolasi, taklifYarat, takliflar, type Taklif, type TaklifRoli } from '../../api/t2-ish-joyi';

const HOLAT: Record<Taklif['holat'], string> = { faol: 'Faol', bekor: 'Bekor qilingan', muddati_otgan: 'Muddati tugagan', toldi: 'Joylar tugagan' };
const MUDDATLAR: ReadonlyArray<readonly [number, string]> = [[24, '1 kun'], [72, '3 kun'], [168, '7 kun'], [720, '30 kun']];

export function TaklifHavolalari({ kompaniyaId, isDirector }: { kompaniyaId: number; isDirector: boolean }) {
  const [royxat, setRoyxat] = useState<Taklif[] | null>(null);
  const [xato, setXato] = useState('');
  const [band, setBand] = useState(false);
  const [rol, setRol] = useState<TaklifRoli>('pto');
  const [muddat, setMuddat] = useState(72);
  const [soni, setSoni] = useState(1);
  const [yangi, setYangi] = useState<string | null>(null);
  const [nusxa, setNusxa] = useState(false);

  async function yukla() {
    try { setRoyxat(await takliflar(kompaniyaId)); setXato(''); } catch (e) { setXato(e instanceof Error ? e.message : t('Takliflar o‘qilmadi')); }
  }
  useEffect(() => { if (isDirector) void yukla(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kompaniyaId, isDirector]);

  if (!isDirector) return null;
  async function yarat() {
    setBand(true); setXato(''); setYangi(null); setNusxa(false);
    const r = await taklifYarat({ kompaniyaId, rol, muddatSoat: muddat, maxSoni: soni });
    setBand(false);
    if (!r.ok || !r.kod) { setXato(ishJoyiXato(r)); return; }
    setYangi(taklifHavolasi(r.kod));
    void yukla();
  }
  async function bekor(id: number) {
    if (!window.confirm(t('Havola bekor qilinsinmi? U orqali endi hech kim qo‘shila olmaydi (qo‘shilganlar qoladi).'))) return;
    const r = await taklifBekor(kompaniyaId, id);
    if (!r.ok) { setXato(ishJoyiXato(r)); return; }
    void yukla();
  }
  async function nusxala() {
    if (!yangi) return;
    try { await navigator.clipboard.writeText(yangi); setNusxa(true); } catch { setNusxa(false); }
  }

  return (
    <div className="karta mt-3 space-y-3 p-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Link2 size={14} /> {t('Taklif havolalari')}</h3>
        <p className="text-xs text-text-dim">{t('Havola yuboring — odam uni ochib, tasdiqsiz shu ish joyiga tanlangan rol bilan qo‘shiladi. Rahbar (boss) va admin havola orqali berilmaydi.')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-[12px]">
        <label className="grid gap-0.5">{t('Rol')}
          <select className="input h-8" value={rol} onChange={(e) => setRol(e.target.value as TaklifRoli)}>
            {TAKLIF_ROLLARI.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
          </select></label>
        <label className="grid gap-0.5">{t('Muddat')}
          <select className="input h-8" value={muddat} onChange={(e) => setMuddat(Number(e.target.value))}>
            {MUDDATLAR.map(([s, n]) => <option key={s} value={s}>{t(n)}</option>)}
          </select></label>
        <label className="grid gap-0.5">{t('Necha kishi')}
          <input className="input h-8 w-20" type="number" min={1} max={500} value={soni} onChange={(e) => setSoni(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} /></label>
        <button type="button" className="tugma tugma-asosiy h-8" disabled={band} onClick={() => void yarat()}>
          {band ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} {t('Havola yaratish')}</button>
      </div>
      {yangi && <div role="status" className="rounded border border-accent/40 bg-accent/10 p-2 text-[12px]">
        <p className="font-semibold">{t('Havola tayyor — hozir nusxalang, keyin qayta ko‘rsatilmaydi:')}</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all">{yangi}</code>
          <button type="button" className="tugma h-7" onClick={() => void nusxala()}><Copy size={12} /> {nusxa ? t('Nusxalandi') : t('Nusxalash')}</button>
        </div>
      </div>}
      {xato && <p role="alert" className="text-[12px] text-rose-300">{xato}</p>}
      {royxat && royxat.length > 0 && <ul className="divide-y divide-border/60 text-[12px]">
        {royxat.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2 py-1.5">
          <span className="font-medium">{ROLE_LABELS[x.rol] ?? x.rol}</span>
          <span className="text-text-dim">{x.foydalanildi}/{x.max_soni} {t('kishi')}</span>
          <span className="text-text-mute">{t('muddat')}: {new Date(x.muddat).toLocaleString('ru-RU')}</span>
          <span className={x.holat === 'faol' ? 'text-emerald-400' : 'text-text-mute'}>{t(HOLAT[x.holat])}</span>
          {x.holat === 'faol' && <button type="button" className="ml-auto text-text-mute hover:text-danger" aria-label={`${t('Bekor qilish')}: #${x.id}`} onClick={() => void bekor(x.id)}><X size={13} /></button>}
        </li>)}
      </ul>}
    </div>
  );
}
