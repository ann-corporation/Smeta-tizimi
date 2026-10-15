/**
 * Studio narxlash bosqichida KP / prays-list yuklash (egasi 2026-10-15: "KP tashlansa AI o'zi o'qib oladigan darajada").
 * Excel — ustunlar smeta anatomiyasi bilan aniqlanadi (topilmasa jadval matni AI ga); PDF/rasm — AI o'qiydi.
 * Foydalanuvchi yetkazuvchi, sana va QQS holatini TASDIQLAYDI (QQS noma'lum bo'lsa saqlanmaydi), keyin manba faqat
 * shu kompaniyaga saqlanadi va narx nomzodlari orasida birinchi bo'lib chiqadi (obosnovaniya: «Коммерческое предложение»).
 */
import { useState } from 'react';
import { t } from '../../i18n/til';
import { smetachiKpOqi } from '../../api/smeta-ai';
import { narxManbaniYukla, type NarxManbaQatorKirish } from '../../api/t2-narx-dalil';
import { yangiOperationId } from '../../api/supabase';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';
import { katalogniOqi } from '../../lib/narx-dalil/katalog-oqish';
import { qqsHolatiniAniqla } from '../../lib/smeta-studio/kompaniya-manbalari';
import { docxMatni } from '../../lib/narx-dalil/docx-matn';

type Nds = 'nds_bilan' | 'nds_siz' | 'nomalum';
type Oqilgan = { tur: 'kp' | 'katalog'; yetkazuvchi: string; inn: string; raqam: string; sana: string; nds: Nds; ndsDalil: string; qatorlar: NarxManbaQatorKirish[]; usul: string };
const MAX_FAYL = 7 * 1024 * 1024;
const cell = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

async function base64(f: File): Promise<string> {
  const b = new Uint8Array(await f.arrayBuffer());
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function StudioKpYuklash({ kompaniyaId, onSaqlandi }: { kompaniyaId: number | null; onSaqlandi: () => void }) {
  const [ochiq, setOchiq] = useState(false);
  const [band, setBand] = useState('');
  const [xato, setXato] = useState('');
  const [k, setK] = useState<Oqilgan | null>(null);

  async function oqi(f: File | undefined) {
    if (!f || kompaniyaId == null) return;
    setXato(''); setK(null);
    if (f.size > MAX_FAYL) { setXato(t('Fayl juda katta (7 MB gacha).')); return; }
    setBand(t('Hujjat o‘qilmoqda...'));
    try {
      const nom = f.name.toLowerCase();
      if (/\.(xlsx|xls|xlsm)$/.test(nom)) {
        const wb = await readXlsxFonda(await f.arrayBuffer());
        const varaq = wb.sheets[0];
        const rows = varaq?.rows ?? [];
        const matn = rows.slice(0, 400).map(r => r.map(cell).filter(Boolean).join(' | ')).filter(Boolean).join('\n');
        const det = rows.length ? katalogniOqi(varaq.name, rows) : null;
        const narxli = det?.qatorlar.filter(q => q.narx != null) ?? [];
        if (narxli.length) {
          // Columns found deterministically (large price lists too); the VAT state comes from the document's own words.
          setK({ tur: narxli.length > 200 ? 'katalog' : 'kp', yetkazuvchi: '', inn: '', raqam: '', sana: '', nds: qqsHolatiniAniqla(matn), ndsDalil: '', qatorlar: narxli,
            usul: t('Excel ustunlari aniqlandi: {n} pozitsiya', { n: narxli.length }) });
          return;
        }
        const r = await smetachiKpOqi(kompaniyaId, { matn: matn.slice(0, 110_000) });
        if (!r.ok) { setXato(t('AI hujjatni o‘qiy olmadi. Qayta urinib ko‘ring.')); return; }
        setK(dan(r.kp, t('AI jadvalni o‘qidi')));
      } else if (nom.endsWith('.docx')) {
        const matn = docxMatni(new Uint8Array(await f.arrayBuffer()));
        if (!matn.trim()) { setXato(t('Word hujjatida matn topilmadi.')); return; }
        const r = await smetachiKpOqi(kompaniyaId, { matn: matn.slice(0, 110_000) });
        if (!r.ok) { setXato(t('AI hujjatni o‘qiy olmadi. Qayta urinib ko‘ring.')); return; }
        setK(dan(r.kp, t('AI Word hujjatini o‘qidi')));
      } else if (/\.(pdf|png|jpe?g|webp)$/.test(nom)) {
        const mimeType = nom.endsWith('.pdf') ? 'application/pdf' : nom.endsWith('.png') ? 'image/png' : nom.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        const r = await smetachiKpOqi(kompaniyaId, { fayl: { mimeType, data: await base64(f) } });
        if (!r.ok) { setXato(t('AI hujjatni o‘qiy olmadi. Qayta urinib ko‘ring.')); return; }
        setK(dan(r.kp, t('AI hujjatni o‘qidi')));
      } else setXato(t('Excel, Word (.docx), PDF yoki rasm yuklang.'));
    } catch { setXato(t('Fayl o‘qilmadi.')); } finally { setBand(''); }
  }
  const dan = (kp: { yetkazuvchi: string | null; inn: string | null; raqam: string | null; sana: string | null; nds_holati: Nds; nds_dalil: string | null; qatorlar: Array<{ nom: string; birlik: string | null; narx: number | null }> }, usul: string): Oqilgan => ({
    tur: 'kp', yetkazuvchi: kp.yetkazuvchi ?? '', inn: kp.inn ?? '', raqam: kp.raqam ?? '', sana: kp.sana ?? '', nds: kp.nds_holati, ndsDalil: kp.nds_dalil ?? '',
    qatorlar: kp.qatorlar.filter(q => q.narx != null).map(q => ({ nom: q.nom, birlik: q.birlik, narx: q.narx })), usul: `${usul}: ${kp.qatorlar.length}` });

  async function saqla() {
    if (!k || kompaniyaId == null || k.nds === 'nomalum' || !k.qatorlar.length) return;
    setBand(t('Saqlanmoqda...'));
    try {
      const sana = /^\d{4}-\d{2}-\d{2}$/.test(k.sana) ? k.sana : null;
      const r = await narxManbaniYukla(kompaniyaId, {
        tur: k.tur, nom: [k.tur === 'kp' ? 'КП' : 'Прайс-лист', k.yetkazuvchi, k.raqam ? `№ ${k.raqam}` : null].filter(Boolean).join(' ').slice(0, 200) || 'КП',
        raqam: k.raqam || null, sana, yetkazuvchi: k.yetkazuvchi || null, yetkazuvchi_inn: k.inn || null, nds_holati: k.nds,
        yil: sana ? Number(sana.slice(0, 4)) : null, kvartal: sana ? Math.ceil(Number(sana.slice(5, 7)) / 3) : null,
        izoh: k.ndsDalil ? `QQS: ${k.ndsDalil}` : null }, k.qatorlar, yangiOperationId());
      if (!r.ok) { setXato(t('Saqlanmadi: {e}', { e: String(r.error ?? r.sabab ?? '') })); return; }
      setK(null); setOchiq(false); onSaqlandi();
    } finally { setBand(''); }
  }

  if (kompaniyaId == null) return null;
  return <section aria-label={t('KP va prays-list')} className="karta space-y-2 p-2 text-[12.5px]">
    <div className="flex flex-wrap items-center gap-2">
      <strong className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t('Yetkazuvchi KP / prays-list')}</strong>
      <span className="text-xs text-text-mute">{t('Haqiqiy yetkazuvchi narxi — nomzodlar ichida birinchi; faqat kompaniyangiz uchun.')}</span>
      <span className="flex-1" />
      <button type="button" className="tugma h-7 px-2 text-[11.5px]" onClick={() => setOchiq(!ochiq)}>{ochiq ? t('Yopish') : t('KP yuklash')}</button>
    </div>
    {ochiq && <div className="space-y-2">
      <input aria-label={t('KP fayli')} type="file" accept=".xlsx,.xls,.xlsm,.docx,.pdf,.png,.jpg,.jpeg,.webp" disabled={!!band} onChange={e => void oqi(e.target.files?.[0])} />
      {band && <p role="status" className="text-xs text-accent">{band}</p>}
      {xato && <p role="alert" className="text-xs text-danger">{xato}</p>}
      {k && <div className="space-y-2">
        <p className="text-xs text-text-dim">{k.usul}</p>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs">{t('Yetkazuvchi')}<input aria-label={t('Yetkazuvchi')} className="input mt-0.5 block h-7 w-56" value={k.yetkazuvchi} onChange={e => setK({ ...k, yetkazuvchi: e.target.value })} /></label>
          <label className="text-xs">{t('INN')}<input aria-label={t('INN')} className="input mt-0.5 block h-7 w-28" value={k.inn} onChange={e => setK({ ...k, inn: e.target.value })} /></label>
          <label className="text-xs">{t('Hujjat raqami')}<input aria-label={t('Hujjat raqami')} className="input mt-0.5 block h-7 w-24" value={k.raqam} onChange={e => setK({ ...k, raqam: e.target.value })} /></label>
          <label className="text-xs">{t('Sana')}<input aria-label={t('Hujjat sanasi')} type="date" className="input mt-0.5 block h-7" value={k.sana} onChange={e => setK({ ...k, sana: e.target.value })} /></label>
          <label className="text-xs">{t('Narxlar QQS')}
            <select aria-label={t('Narxlar QQS')} className="input mt-0.5 block h-7" value={k.nds} onChange={e => setK({ ...k, nds: e.target.value as Nds })}>
              <option value="nomalum">{t('— aniqlang —')}</option><option value="nds_bilan">{t('QQS bilan (÷ 1,12 bilan QQSsizga o‘tkaziladi)')}</option><option value="nds_siz">{t('QQS siz')}</option>
            </select></label>
        </div>
        {k.ndsDalil && <p className="text-[11px] text-text-mute">{t('Hujjatda')}: «{k.ndsDalil}»</p>}
        {k.nds === 'nomalum' && <p className="text-[11px] text-warn">{t('Smeta narxi QQSsiz bo‘lishi shart — hujjatdagi narx QQS bilanmi, QQSsizmi, tanlang.')}</p>}
        <div className="max-h-48 overflow-auto"><table className="w-full text-[11.5px]"><thead className="text-text-mute"><tr>
          <th className="text-left">{t('Nomi')}</th><th className="text-left">{t('Birlik')}</th><th className="text-right">{t('Narx')}</th></tr></thead>
          <tbody>{k.qatorlar.slice(0, 30).map((q, i) => <tr key={i} className="border-t border-border/50"><td>{q.nom}</td><td>{q.birlik ?? '—'}</td><td className="text-right tabular-nums">{q.narx?.toLocaleString('ru-RU')}</td></tr>)}</tbody>
        </table></div>
        <button type="button" className="tugma tugma-asosiy h-8 px-3 text-[12px]" disabled={!!band || k.nds === 'nomalum' || !k.qatorlar.length} onClick={() => void saqla()}>
          {t('Saqlash va narxlashda ishlatish ({n})', { n: k.qatorlar.length })}</button>
      </div>}
    </div>}
  </section>;
}
