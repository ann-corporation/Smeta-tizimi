/**
 * Platforma narx indeksi — tizim boshqaruvchisi uchun (egasi 2026-10-15). Hozirgi indeksning nashrlari (katalog, asosiy
 * materiallar, birja, ishlab chiqaruvchi prays-listlari) ko'rinadi; yangi nashr fayllari qo'shiladi yoki eski nashr olib
 * tashlanadi → brauzerda yangi reviziya quriladi → server (faqat superadmin) R2 ga yozadi va faollashtiradi. Barcha
 * kompaniyalar Studio'da shu indeksdan narxlaydi. Narx doim QQSsiz; QQS holati noma'lum prays-list qabul qilinmaydi.
 */
import { useEffect, useMemo, useState } from 'react';
import { t } from '../../i18n/til';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';
import { katalogniOqi } from '../../lib/narx-dalil/katalog-oqish';
import { docxMatni } from '../../lib/narx-dalil/docx-matn';
import { narxKatalogi, type PriceCatalog } from '../../lib/narx-katalog/price-remote';
import { manbaTuriniAniqla, nashrniOqi, nashrSarlavhasi, type Nashr } from '../../lib/narx-katalog/manba-xls';
import { indeksdanNashrlar, nashrlarniBirlashtir, reviziyaQur } from '../../lib/narx-katalog/nashr-birlashtir';
import { praysNashri, reviziyaniNashrQil } from '../../lib/narx-katalog/nashr-yuklash';
import { qqsHolatiniAniqla } from '../../lib/smeta-studio/kompaniya-manbalari';
import { smetachiKpOqi } from '../../api/smeta-ai';
import type { NarxManbaQatorKirish } from '../../api/t2-narx-dalil';

type Prays = { fayl: string; yetkazuvchi: string; sana: string; nds: 'nds_bilan' | 'nds_siz' | 'nomalum'; qatorlar: NarxManbaQatorKirish[] };
const TUR_NOMI: Record<string, string> = { katalog: 'Katalog', asosiy_material: 'Asosiy materiallar', birja: 'Birja (UzRTSB)', prays: 'Prays-list' };

export default function NarxIndeksPaneli() {
  const { superadmin, joriyId } = useKompaniya();
  const [cat, setCat] = useState<PriceCatalog | null>(null);
  const [yangi, setYangi] = useState<Nashr[]>([]);
  const [olib, setOlib] = useState<Set<number>>(new Set());
  const [prays, setPrays] = useState<Prays | null>(null);
  const [band, setBand] = useState(''); const [xabar, setXabar] = useState(''); const [xato, setXato] = useState('');
  useEffect(() => { let alive = true; narxKatalogi().then(c => { if (alive) setCat(c); }).catch(() => { if (alive) setXato(t('Joriy narx indeksi ochilmadi.')); }); return () => { alive = false; }; }, []);
  const nashrlar = useMemo(() => {
    if (!cat) return [];
    const manbalar = cat.dict.manbalar ?? [cat.dict.manba];
    const soni = new Map<number, number>();
    for (const r of cat.rows) soni.set(r[14] ?? manbalar.length - 1, (soni.get(r[14] ?? manbalar.length - 1) ?? 0) + 1);
    return manbalar.map((m, i) => ({ i, m, soni: soni.get(i) ?? 0 }));
  }, [cat]);
  if (!superadmin) return null;

  async function fayllar(list: FileList | null) {
    if (!list?.length) return;
    setXato(''); setXabar('');
    for (const f of [...list]) {
      setBand(t('{f} o‘qilmoqda...', { f: f.name }));
      try {
        const nom = f.name.toLowerCase();
        if (/\.(xlsx|xls|xlsm)$/.test(nom)) {
          const wb = await readXlsxFonda(await f.arrayBuffer());
          const sheets = wb.sheets.map(s => ({ nom: s.name, rows: s.rows as unknown[][] }));
          if (manbaTuriniAniqla(sheets)) { const n = nashrniOqi(f.name, sheets); setYangi(x => [...x, n]); continue; }
          // A manufacturer's own layout: columns from the shared reader; the admin confirms supplier, date and VAT.
          const s0 = wb.sheets[0];
          const det = s0 ? katalogniOqi(s0.name, s0.rows) : null;
          const matn = (s0?.rows ?? []).slice(0, 60).map(r => r.join(' ')).join('\n');
          setPrays({ fayl: f.name, yetkazuvchi: '', sana: '', nds: qqsHolatiniAniqla(matn), qatorlar: det?.qatorlar.filter(q => q.narx != null) ?? [] });
        } else if (/\.(docx|pdf|png|jpe?g|webp)$/.test(nom)) {
          if (joriyId == null) { setXato(t('AI o‘qishi uchun yuqorida kompaniyani tanlang.')); continue; }
          const r = nom.endsWith('.docx') ? await smetachiKpOqi(joriyId, { matn: docxMatni(new Uint8Array(await f.arrayBuffer())).slice(0, 110_000) })
            : await smetachiKpOqi(joriyId, { fayl: { mimeType: nom.endsWith('.pdf') ? 'application/pdf' : nom.endsWith('.png') ? 'image/png' : 'image/jpeg', data: await b64(f) } });
          if (!r.ok) { setXato(t('AI hujjatni o‘qiy olmadi: {f}', { f: f.name })); continue; }
          setPrays({ fayl: f.name, yetkazuvchi: r.kp.yetkazuvchi ?? '', sana: r.kp.sana ?? '', nds: r.kp.nds_holati, qatorlar: r.kp.qatorlar.filter(q => q.narx != null).map(q => ({ nom: q.nom, birlik: q.birlik, narx: q.narx })) });
        } else setXato(t('Qo‘llab-quvvatlanmaydigan fayl: {f}', { f: f.name }));
      } catch { setXato(t('Fayl o‘qilmadi: {f}', { f: f.name })); }
    }
    setBand('');
  }
  async function qur() {
    if (!cat) return;
    setXato(''); setXabar('');
    setBand(t('Indeks qurilmoqda...'));
    try {
      const eski = indeksdanNashrlar(cat.dict, cat.rows).filter((_, i) => !olib.has(i));
      const hammasi = [...eski, ...yangi];
      const b = nashrlarniBirlashtir(hammasi);
      const rev = await reviziyaQur(b, hammasi.map(({ qatorlar: _q, ...m }) => ({ ...m, sha256: null })), new Date().toISOString());
      if (rev.revision === cat.manifest.revision) { setXabar(t('O‘zgarish yo‘q — indeks avvalgidek.')); return; }
      const r = await reviziyaniNashrQil(rev, (a, j) => setBand(t('Yuklanmoqda: {a} / {j} fayl', { a, j })));
      if (!r.ok) { setXato(t('Faollashtirilmadi: {c}', { c: r.code ?? '' })); return; }
      setXabar(t('Yangi narx indeksi faol: {r} ({n} qator, {m} nashr). Oldingisi: {p}.', { r: rev.revision, n: b.rows.length.toLocaleString('ru-RU'), m: hammasi.length, p: r.previous ?? '—' }));
      setYangi([]); setOlib(new Set());
    } catch (e) { setXato(t('Indeks qurilmadi: {e}', { e: e instanceof Error ? e.message : String(e) })); } finally { setBand(''); }
  }

  return <section aria-label={t('Platforma narx indeksi')} className="space-y-3 rounded border border-border p-3 text-sm">
    <h3 className="font-semibold">{t('Platforma narx indeksi (barcha kompaniyalar narxlashi)')}</h3>
    <p className="text-text-dim">{t('Katalog, asosiy materiallar, birja kotirovkalari va ishlab chiqaruvchi prays-listlari. Bir mahsulot bir necha nashrda bo‘lsa eng yangisi ishlaydi; bir nashr ichida eng qimmat oy narxi. Narx doim QQSsiz.')}</p>
    {cat && <p className="text-xs text-text-mute">{t('Joriy reviziya')}: <span className="font-mono">{cat.manifest.revision}</span> · {cat.rows.length.toLocaleString('ru-RU')} {t('qator')}</p>}
    <ul className="space-y-1">{nashrlar.map(({ i, m, soni }) => <li key={i} className="flex flex-wrap items-center gap-2">
      <input type="checkbox" aria-label={t('Olib tashlash')} checked={olib.has(i)} onChange={e => setOlib(s => { const x = new Set(s); if (e.target.checked) x.add(i); else x.delete(i); return x; })} />
      <span className={olib.has(i) ? 'line-through text-text-mute' : ''}>{TUR_NOMI[m.tur] ? t(TUR_NOMI[m.tur]) : m.tur} · {m.nom}</span>
      <span className="text-xs text-text-mute">{soni.toLocaleString('ru-RU')} {t('qator')}{m.raqam ? ` · ${m.raqam}` : ''}</span>
    </li>)}</ul>
    <label className="block">{t('Yangi nashr fayllari (Excel, Word, PDF)')}
      <input aria-label={t('Yangi nashr fayllari')} className="mt-1 block" type="file" multiple accept=".xls,.xlsx,.xlsm,.docx,.pdf,.png,.jpg,.jpeg,.webp" disabled={!!band} onChange={e => void fayllar(e.target.files)} /></label>
    {prays && <div className="space-y-2 rounded border border-warn/50 p-2">
      <p className="font-medium">{t('Prays-list')}: {prays.fayl} · {t('{n} narx', { n: prays.qatorlar.length })}</p>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs">{t('Ishlab chiqaruvchi / yetkazuvchi')}<input aria-label={t('Ishlab chiqaruvchi')} className="input mt-0.5 block h-7 w-60" value={prays.yetkazuvchi} onChange={e => setPrays({ ...prays, yetkazuvchi: e.target.value })} /></label>
        <label className="text-xs">{t('Sana')}<input aria-label={t('Prays sanasi')} type="date" className="input mt-0.5 block h-7" value={prays.sana} onChange={e => setPrays({ ...prays, sana: e.target.value })} /></label>
        <label className="text-xs">{t('Narxlar QQS')}<select aria-label={t('Narxlar QQS')} className="input mt-0.5 block h-7" value={prays.nds} onChange={e => setPrays({ ...prays, nds: e.target.value as Prays['nds'] })}>
          <option value="nomalum">{t('— aniqlang —')}</option><option value="nds_bilan">{t('QQS bilan (÷ 1,12)')}</option><option value="nds_siz">{t('QQS siz')}</option></select></label>
      </div>
      <button type="button" className="tugma h-8 px-3" disabled={prays.nds === 'nomalum' || !prays.yetkazuvchi.trim() || !prays.qatorlar.length} onClick={() => {
        setYangi(x => [...x, praysNashri({ nom: prays.fayl, yetkazuvchi: prays.yetkazuvchi.trim(), sana: /^\d{4}-\d{2}-\d{2}$/.test(prays.sana) ? prays.sana : null, nds: prays.nds as 'nds_bilan' | 'nds_siz', hudud: null, qatorlar: prays.qatorlar })]);
        setPrays(null);
      }}>{t('Nashr sifatida qo‘shish')}</button>
    </div>}
    {yangi.length > 0 && <ul className="space-y-1">{yangi.map((n, i) => <li key={i} className="flex flex-wrap items-center gap-2 text-ok">
      <span>+ {t(TUR_NOMI[n.tur] ?? n.tur)} · {nashrSarlavhasi(n)} · {n.nom}</span>
      <span className="text-xs text-text-mute">{n.qatorlar.length.toLocaleString('ru-RU')} {t('qator')}{n.hisob.hisoblanganQqs ? ` · ${t('QQS chiqarilgan: {n}', { n: n.hisob.hisoblanganQqs })}` : ''}</span>
      <button type="button" className="text-xs underline" onClick={() => setYangi(x => x.filter((_, j) => j !== i))}>{t('Olib tashlash')}</button>
    </li>)}</ul>}
    {band && <p role="status" className="text-xs text-accent">{band}</p>}
    {xabar && <p role="status" className="text-xs text-ok">{xabar}</p>}
    {xato && <p role="alert" className="text-xs text-danger">{xato}</p>}
    <button type="button" className="tugma tugma-asosiy h-9 px-4" disabled={!!band || !cat || (!yangi.length && !olib.size)} onClick={() => void qur()}>{t('Yangi indeksni qurish va faollashtirish')}</button>
  </section>;
}

async function b64(f: File): Promise<string> {
  const b = new Uint8Array(await f.arrayBuffer());
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
