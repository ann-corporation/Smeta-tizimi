/**
 * MENING XIZMATLARIM — mutaxassis sahifasi (T6, egasi 2026-10-22: «PTO bo'lib qaysidir kompaniyaga xizmatlarimni taklif qilish
 * darajasidagi kuch kerak»).
 *   1) Profil — kasb, hudud, tajriba, xizmatlar; yonida kompaniyalar ko'radigan karta (tizim tasdiqlagan F2 tajribasi bilan).
 *   2) Xizmat taklif qilish — kompaniyani nom (ochiq profilli) yoki STIR bo'yicha topib, rol va xabar bilan taklif.
 *   3) Yuborilgan takliflar — holat (kutilmoqda / qabul / rad), bekor qilish. Qabul qilinsa — o'sha kompaniya «Ish joylarim» da.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Loader2, Search, Send, X } from 'lucide-react';
import { MutaxassisKartasi } from '../../components/mutaxassis/MutaxassisKartasi';
import { KASB_NOMI, kompaniyaQidir, mutaxassisXato, profilOl, profilSaqla, taklifBekorQil, taklifYubor, takliflarim,
  type Kasb, type MutaxassisKarta, type Statistika, type TopilganKompaniya, type XizmatRoli, type YuborilganTaklif } from '../../api/t2-mutaxassis';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { ROLE_LABELS } from '../../lib/company-authorization/permission-labels';
import { t } from '../../i18n/til';

const KASBLAR = Object.keys(KASB_NOMI) as Kasb[];
const ROLLAR: XizmatRoli[] = ['pto', 'prorab', 'bugalter', 'kuzatuvchi'];
const HOLAT: Record<YuborilganTaklif['holat'], { nom: string; cls: string }> = {
  yuborildi: { nom: 'Javob kutilmoqda', cls: 'text-warn' }, qabul: { nom: 'Qabul qilindi', cls: 'text-emerald-400' },
  rad: { nom: 'Rad etildi', cls: 'text-rose-400' }, bekor: { nom: 'Bekor qilingan', cls: 'text-text-mute' },
};

export default function Mutaxassis() {
  const k = useKompaniya();
  const navigate = useNavigate();
  const [stat, setStat] = useState<Statistika | null>(null);
  const [f, setF] = useState({ ochiq: true, kasb: 'pto' as Kasb, hudud: '', tajriba: '', xizmatlar: '', haqida: '', statistika: true });
  const [saqlandi, setSaqlandi] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  const [q, setQ] = useState('');
  const [topildi, setTopildi] = useState<TopilganKompaniya[] | null>(null);
  const [tanlangan, setTanlangan] = useState<TopilganKompaniya | null>(null);
  const [rol, setRol] = useState<XizmatRoli>('pto');
  const [xabar, setXabar] = useState('');
  const [yuborilgan, setYuborilgan] = useState<YuborilganTaklif[]>([]);

  async function yukla() {
    try {
      const d = await profilOl();
      setStat(d.statistika);
      const p = d.profil;
      if (p) setF({ ochiq: !!p.ochiq, kasb: p.kasb ?? 'pto', hudud: p.hudud ?? '', tajriba: p.tajriba_yil == null ? '' : String(p.tajriba_yil),
        xizmatlar: (p.xizmatlar ?? []).join(', '), haqida: p.haqida ?? '', statistika: p.statistika_korsat !== false });
      setYuborilgan(await takliflarim());
    } catch (e) { setXato(e instanceof Error ? e.message : t('Ma’lumot o‘qilmadi')); }
  }
  useEffect(() => { void yukla(); }, []);

  const karta: MutaxassisKarta = { foydalanuvchi_id: k.foydalanuvchi?.id ?? 1, ism: k.foydalanuvchi?.ism || k.foydalanuvchi?.login || t('Siz'), kasb: f.kasb,
    hudud: f.hudud || null, tajriba_yil: f.tajriba === '' ? null : Number(f.tajriba), xizmatlar: f.xizmatlar.split(',').map((x) => x.trim()).filter(Boolean),
    haqida: f.haqida || null, statistika: f.statistika ? stat : null };

  async function saqla() {
    setBand(true); setXato(''); setSaqlandi('');
    const r = await profilSaqla({ ochiq: f.ochiq, kasb: f.kasb, hudud: f.hudud, tajriba_yil: f.tajriba === '' ? null : Number(f.tajriba),
      xizmatlar: karta.xizmatlar ?? [], haqida: f.haqida, statistika_korsat: f.statistika });
    setBand(false);
    if (!r.ok) { setXato(mutaxassisXato(r)); return; }
    setSaqlandi(f.ochiq ? t('Saqlandi. Profilingiz kompaniyalarga ko‘rinadi.') : t('Saqlandi. Profilingiz yopiq — faqat siz taklif yuborgan kompaniya ko‘radi.'));
  }
  async function qidir() {
    setXato(''); setTanlangan(null);
    try { setTopildi(await kompaniyaQidir(q)); } catch (e) { setXato(e instanceof Error ? e.message : t('Qidirib bo‘lmadi')); }
  }
  async function yubor() {
    if (!tanlangan) return;
    setBand(true); setXato('');
    const r = await taklifYubor(tanlangan.kompaniya_id, rol, xabar);
    setBand(false);
    if (!r.ok) { setXato(mutaxassisXato(r)); return; }
    setTanlangan(null); setXabar(''); setTopildi(null); setQ('');
    setYuborilgan(await takliflarim());
  }
  async function bekor(id: number) {
    const r = await taklifBekorQil(id);
    if (!r.ok) { setXato(mutaxassisXato(r)); return; }
    setYuborilgan(await takliflarim());
  }

  const inp = 'input h-8 w-full text-[12.5px]';
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold text-text">{t('Mening xizmatlarim')}</h1>
        <p className="text-[12px] text-text-dim">{t('Profilingizni to‘ldiring va istalgan kompaniyaga xizmatingizni taklif qiling. Tizimdagi haqiqiy ishingiz — eng kuchli tavsiyanoma.')}</p>
      </header>
      {xato && <p role="alert" className="text-[13px] text-rose-400">{xato}</p>}

      <section aria-label={t('Profil')} className="grid gap-4 lg:grid-cols-2">
        <div className="karta space-y-2 p-4 text-[12.5px]">
          <h2 className="text-[14px] font-semibold">{t('Profilim')}</h2>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.ochiq} onChange={(e) => setF({ ...f, ochiq: e.target.checked })} />
            {t('Profilim ochiq — kompaniyalar meni «Mutaxassis qidirish» da topadi')}</label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-0.5">{t('Kasb')}<select className={inp} value={f.kasb} onChange={(e) => setF({ ...f, kasb: e.target.value as Kasb })}>
              {KASBLAR.map((x) => <option key={x} value={x}>{t(KASB_NOMI[x])}</option>)}</select></label>
            <label className="grid gap-0.5">{t('Tajriba (yil)')}<input className={inp} type="number" min={0} max={60} value={f.tajriba} onChange={(e) => setF({ ...f, tajriba: e.target.value })} /></label>
          </div>
          <label className="grid gap-0.5">{t('Hudud')}<input className={inp} value={f.hudud} maxLength={80} placeholder={t('masalan: Toshkent')} onChange={(e) => setF({ ...f, hudud: e.target.value })} /></label>
          <label className="grid gap-0.5">{t('Xizmatlar (vergul bilan)')}<input className={inp} value={f.xizmatlar} placeholder={t('F2 tayyorlash, smeta tuzish, Nakopitelniy, M-29')} onChange={(e) => setF({ ...f, xizmatlar: e.target.value })} /></label>
          <label className="grid gap-0.5">{t('O‘zim haqimda')}<textarea className="input min-h-20 w-full text-[12.5px]" maxLength={1500} value={f.haqida} onChange={(e) => setF({ ...f, haqida: e.target.value })} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.statistika} onChange={(e) => setF({ ...f, statistika: e.target.checked })} />
            {t('Tizim tasdiqlagan tajribamni ko‘rsatish (F2 soni, obyektlar, summa)')}</label>
          <div className="flex items-center gap-2">
            <button type="button" className="tugma tugma-asosiy h-8" disabled={band} onClick={() => void saqla()}>{band ? <Loader2 size={13} className="animate-spin" /> : null} {t('Saqlash')}</button>
            {saqlandi && <span role="status" className="text-[12px] text-emerald-400">{saqlandi}</span>}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-text-mute">{t('Kompaniyalar sizni shunday ko‘radi')}</p>
          <MutaxassisKartasi m={karta} />
        </div>
      </section>

      <section aria-label={t('Xizmat taklif qilish')} className="karta space-y-3 p-4">
        <h2 className="text-[14px] font-semibold">{t('Xizmat taklif qilish')}</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void qidir(); }}>
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-mute" />
            <input className="input h-8 w-full pl-7 text-[12.5px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Kompaniya nomi yoki STIR (9 raqam)')} aria-label={t('Kompaniyani qidirish')} />
          </div>
          <button type="submit" className="tugma h-8" disabled={q.trim().length < 3}>{t('Qidirish')}</button>
        </form>
        <p className="text-[11px] text-text-mute">{t('Nom bo‘yicha faqat xizmat takliflarini qabul qiladigan kompaniyalar chiqadi; STIR bo‘yicha — istalgan tashkilot.')}</p>
        {topildi && !topildi.length && <p className="text-[12px] text-text-mute">{t('Topilmadi.')}</p>}
        {topildi && topildi.length > 0 && <ul className="divide-y divide-border/50">
          {topildi.map((c) => <li key={c.kompaniya_id} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
            <Building2 size={14} className="text-text-mute" />
            <span className="min-w-0 flex-1"><b>{c.nom}</b>{c.manzil && <span className="text-text-mute"> · {c.manzil}</span>}</span>
            {c.azo && <span className="text-text-mute">{t('Siz bu yerda ishlaysiz')}</span>}
            {!c.azo && c.kutilmoqda && <span className="text-warn">{t('Javob kutilmoqda')}</span>}
            {!c.azo && !c.kutilmoqda && <button type="button" className="tugma h-7" onClick={() => setTanlangan(c)}><Send size={12} /> {t('Taklif qilish')}</button>}
          </li>)}
        </ul>}
        {tanlangan && <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 text-[12.5px] space-y-2">
          <p className="font-semibold">«{tanlangan.nom}» {t('ga xizmat taklifi')}</p>
          <label className="grid gap-0.5 max-w-xs">{t('Qaysi rolda ishlamoqchisiz')}
            <select className={inp} value={rol} onChange={(e) => setRol(e.target.value as XizmatRoli)}>{ROLLAR.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}</select></label>
          <label className="grid gap-0.5">{t('Xabar (qisqacha: nima qila olasiz, shartlar)')}
            <textarea className="input min-h-16 w-full text-[12.5px]" maxLength={1000} value={xabar} onChange={(e) => setXabar(e.target.value)} /></label>
          <p className="text-[11px] text-text-mute">{t('Kompaniya rahbari sizning kartangizni (profil va tasdiqlangan tajriba) ko‘radi. Qabul qilsa — siz shu rol bilan qo‘shilasiz.')}</p>
          <div className="flex gap-2">
            <button type="button" className="tugma tugma-asosiy h-8" disabled={band} onClick={() => void yubor()}><Send size={13} /> {t('Yuborish')}</button>
            <button type="button" className="tugma h-8" onClick={() => setTanlangan(null)}>{t('Bekor qilish')}</button>
          </div>
        </div>}
      </section>

      <section aria-label={t('Yuborilgan takliflar')} className="karta space-y-2 p-4">
        <h2 className="text-[14px] font-semibold">{t('Yuborilgan takliflar')}</h2>
        {!yuborilgan.length && <p className="text-[12px] text-text-mute">{t('Hali taklif yubormagansiz.')}</p>}
        <ul className="divide-y divide-border/50">{yuborilgan.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
          <span className="min-w-0 flex-1"><b>{x.kompaniya_nom}</b> · {ROLE_LABELS[x.rol] ?? x.rol}
            {x.javob_izoh && <span className="block text-[11px] text-text-mute">«{x.javob_izoh}»</span>}</span>
          <span className={HOLAT[x.holat].cls}>{t(HOLAT[x.holat].nom)}</span>
          {x.holat === 'qabul' && <button type="button" className="tugma h-7" onClick={() => { k.qayta(); k.tanla(x.kompaniya_id); navigate('/admin/ish-joylarim'); }}>{t('Ish joyiga o‘tish')}</button>}
          {x.holat === 'yuborildi' && <button type="button" className="text-text-mute hover:text-danger" aria-label={`${t('Bekor qilish')}: ${x.kompaniya_nom}`} onClick={() => void bekor(x.id)}><X size={13} /></button>}
        </li>)}</ul>
      </section>
    </div>
  );
}
