/**
 * Kompaniya tomoni (T6): kelgan xizmat takliflari (mutaxassis kartasi + tasdiqlangan tajriba) — qabul / rad;
 * ochiq profilli mutaxassislarni qidirish; «xizmat takliflarini qabul qilaman» (nom bo'yicha topilish) sozlamasi.
 */
import { useEffect, useState } from 'react';
import { Check, Inbox, Loader2, Search, UserSearch, X } from 'lucide-react';
import { MutaxassisKartasi } from '../../components/mutaxassis/MutaxassisKartasi';
import { KASB_NOMI, kelganTakliflar, mutaxassislarQidir, mutaxassisXato, ochiqProfil, taklifJavob,
  type Kasb, type KelganTaklif, type MutaxassisKarta } from '../../api/t2-mutaxassis';
import { ROLE_LABELS } from '../../lib/company-authorization/permission-labels';
import { t } from '../../i18n/til';

export function XizmatTakliflari({ kompaniyaId, isDirector }: { kompaniyaId: number; isDirector: boolean }) {
  const [kelgan, setKelgan] = useState<KelganTaklif[] | null>(null);
  const [xato, setXato] = useState('');
  const [band, setBand] = useState<number | null>(null);
  const [ochiq, setOchiq] = useState(false);
  const [kasb, setKasb] = useState('');
  const [matn, setMatn] = useState('');
  const [topildi, setTopildi] = useState<MutaxassisKarta[] | null>(null);

  async function yukla() {
    try { const d = await kelganTakliflar(kompaniyaId); setKelgan(d.takliflar); setOchiq(d.ochiqProfil); setXato(''); }
    catch (e) { setXato(e instanceof Error ? e.message : t('Takliflar o‘qilmadi')); }
  }
  useEffect(() => { if (isDirector) void yukla(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kompaniyaId, isDirector]);
  if (!isDirector) return null;

  async function javob(x: KelganTaklif, qabul: boolean) {
    const izoh = qabul ? '' : (window.prompt(t('Rad etish sababi (mutaxassisga ko‘rinadi, ixtiyoriy):'), '') ?? null);
    if (izoh === null) return;
    setBand(x.id);
    const r = await taklifJavob(kompaniyaId, x.id, qabul, izoh || undefined);
    setBand(null);
    if (!r.ok) { setXato(mutaxassisXato(r)); return; }
    void yukla();
  }
  async function ochiqAlmash(v: boolean) {
    const r = await ochiqProfil(kompaniyaId, v);
    if (!r.ok) { setXato(mutaxassisXato(r)); return; }
    setOchiq(v);
  }
  async function qidir() {
    try { setTopildi(await mutaxassislarQidir(kompaniyaId, kasb, matn)); setXato(''); } catch (e) { setXato(e instanceof Error ? e.message : t('Qidirib bo‘lmadi')); }
  }
  const kutilmoqda = (kelgan ?? []).filter((x) => x.holat === 'yuborildi');
  const javobBerilgan = (kelgan ?? []).filter((x) => x.holat !== 'yuborildi');

  return (
    <div className="karta mt-3 space-y-4 p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Inbox size={14} /> {t('Xizmat takliflari')}
          {kutilmoqda.length > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] text-white">{kutilmoqda.length}</span>}</h3>
        <label className="mt-1 flex items-center gap-2 text-[12px] text-text-dim">
          <input type="checkbox" checked={ochiq} onChange={(e) => void ochiqAlmash(e.target.checked)} />
          {t('Xizmat takliflarini qabul qilaman — mutaxassislar kompaniyamizni nomi bo‘yicha topadi (STIR bo‘yicha har doim topiladi)')}
        </label>
      </div>
      {xato && <p role="alert" className="text-[12px] text-rose-300">{xato}</p>}
      {kelgan && !kutilmoqda.length && <p className="text-[12px] text-text-mute">{t('Yangi taklif yo‘q.')}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {kutilmoqda.map((x) => <MutaxassisKartasi key={x.id} m={x.mutaxassis}>
          <span className="w-full text-[12px] text-text-dim"><b>{ROLE_LABELS[x.rol] ?? x.rol}</b> {t('rolida ishlashni taklif qilmoqda')}{x.xabar && <>: «{x.xabar}»</>}</span>
          <button type="button" className="tugma tugma-asosiy h-7" disabled={band === x.id} onClick={() => void javob(x, true)}>
            {band === x.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {t('Qabul qilish')}</button>
          <button type="button" className="tugma h-7" disabled={band === x.id} onClick={() => void javob(x, false)}><X size={12} /> {t('Rad etish')}</button>
        </MutaxassisKartasi>)}
      </div>
      {javobBerilgan.length > 0 && <details className="text-[12px]">
        <summary className="cursor-pointer text-text-mute">{t('Javob berilganlar')} ({javobBerilgan.length})</summary>
        <ul className="mt-1 divide-y divide-border/50">{javobBerilgan.map((x) => <li key={x.id} className="py-1">
          {x.mutaxassis.ism} · {ROLE_LABELS[x.rol] ?? x.rol} · <span className={x.holat === 'qabul' ? 'text-emerald-400' : 'text-text-mute'}>
            {x.holat === 'qabul' ? t('Qabul qilindi') : x.holat === 'rad' ? t('Rad etildi') : t('Bekor qilingan')}</span></li>)}</ul>
      </details>}

      <div className="space-y-2 border-t border-border pt-3">
        <h4 className="flex items-center gap-2 text-[13px] font-semibold"><UserSearch size={14} /> {t('Mutaxassis qidirish')}</h4>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void qidir(); }}>
          <select className="input h-8 text-[12.5px]" value={kasb} onChange={(e) => setKasb(e.target.value)} aria-label={t('Kasb')}>
            <option value="">{t('Barcha kasblar')}</option>
            {(Object.keys(KASB_NOMI) as Kasb[]).map((x) => <option key={x} value={x}>{t(KASB_NOMI[x])}</option>)}
          </select>
          <div className="relative min-w-[200px] flex-1">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-mute" />
            <input className="input h-8 w-full pl-7 text-[12.5px]" value={matn} onChange={(e) => setMatn(e.target.value)} placeholder={t('hudud, xizmat yoki ism…')} aria-label={t('Mutaxassis qidirish')} />
          </div>
          <button type="submit" className="tugma h-8">{t('Qidirish')}</button>
        </form>
        {topildi && !topildi.length && <p className="text-[12px] text-text-mute">{t('Ochiq profilli mutaxassis topilmadi.')}</p>}
        <div className="grid gap-3 md:grid-cols-2">{(topildi ?? []).map((m) => <MutaxassisKartasi key={m.foydalanuvchi_id} m={m}>
          <span className="text-[11px] text-text-mute">{t('Taklif havolasini yuboring yoki mutaxassis sizga taklif yuborishini kuting.')}</span>
        </MutaxassisKartasi>)}</div>
      </div>
    </div>
  );
}
