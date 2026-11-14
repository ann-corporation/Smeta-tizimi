import { useMemo, useRef, useState } from 'react';
import { FileUp, Undo2 } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { buxSaldoBekor, buxSaldoImport, buxTolovOl, buxXato, type SaldoNatija } from '../../api/t2-bux-hisob';
import { csvGrid } from '../../lib/buxgalteriya/bank';
import { SALDO_MAYDONLAR, saldoQatorlar, saldoUstunTaxmin, type SaldoMap, type SaldoMaydon } from '../../lib/buxgalteriya/saldo';
import { readWorkbookGrids, type Grid } from '../../lib/qarzdorlik/parse';
import { Izoh, Son, XatoQator } from './umumiy';
import { bugun, kirit, td, th, yorliq } from './yordamchi';

const MAYDON_NOM: Record<SaldoMaydon, () => string> = {
  hisob: () => t('Hisob (счёт)'), kontragent: () => t('Kontragent'), shartnoma: () => t('Shartnoma'), dt: () => t('Debet'), kt: () => t('Kredit'), saldo: () => t('Saldo (ishorali)'),
};

/** Boshlang'ich qoldiq (1C dan o'tish): Excel/CSV ОСВ eksporti → ustun moslash → ko'rik (xato, Dt = Kt) → bitta idempotent partiya. */
export function Saldo({ kid, onOzgardi, tasdiqlaydi }: { kid: number; onOzgardi: () => void; tasdiqlaydi: boolean }) {
  const [fayl, setFayl] = useState<{ nom: string; grid: Grid } | null>(null);
  const [map, setMap] = useState<SaldoMap | null>(null);
  const [boshQator, setBoshQator] = useState(0);
  const [sana, setSana] = useState(bugun());
  const [qarshi, setQarshi] = useState('8810');
  const [koruv, setKoruv] = useState<SaldoNatija | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const [moslik, setMoslik] = useState<{ kontragentlar: Array<{ id: number; nom: string; inn: string | null }>; shartnomalar: Array<{ id: number; raqam: string; kontragent_id: number | null }> }>({ kontragentlar: [], shartnomalar: [] });
  const op = useRef(yangiOperationId());

  const parse = useMemo(() => (fayl && map ? saldoQatorlar(fayl.grid, map, boshQator, moslik) : null), [fayl, map, boshQator, moslik]);

  const faylTanla = async (f: File | undefined) => {
    if (!f) return;
    try {
      const grid = /\.csv$|\.txt$/i.test(f.name) ? csvGrid(await f.text()) : ((await readWorkbookGrids(await f.arrayBuffer()))[0]?.grid ?? []);
      const tax = saldoUstunTaxmin(grid);
      setFayl({ nom: f.name, grid }); setMap(tax.map); setBoshQator(tax.boshQator); setKoruv(null); setXato(null); op.current = yangiOperationId();
      const r = await buxTolovOl(kid, {});
      if (r.ok) {
        const k = new Map<number, { id: number; nom: string; inn: string | null }>();
        for (const s of r.natija.shartnomalar) if (s.kontragent_id != null && s.kontragent) k.set(s.kontragent_id, { id: s.kontragent_id, nom: s.kontragent, inn: s.inn });
        setMoslik({ kontragentlar: [...k.values()], shartnomalar: r.natija.shartnomalar.map((s) => ({ id: s.id, raqam: s.raqam, kontragent_id: s.kontragent_id })) });
      }
    } catch { setXato(t('Faylni o‘qib bo‘lmadi. CSV yoki Excel (.xlsx) yuklang.')); }
  };

  const yubor = async (dry: boolean) => {
    if (!parse) return;
    setBand(true);
    const r = await buxSaldoImport({ kompaniyaId: kid, sana, qarshi, qatorlar: parse.qatorlar, dry, operationId: dry ? yangiOperationId() : op.current });
    setBand(false);
    setKoruv(r);
    if (dry) { setXato(r.ok ? null : (r.xatolar?.length ? null : buxXato(r))); return; }
    if (!r.ok) { setXato(buxXato(r)); op.current = yangiOperationId(); return; }
    toast(t('Boshlang‘ich qoldiq yozildi: {n} ta provodka', { n: r.yozildi ?? 0 }), 'ok'); onOzgardi();
  };
  const bekor = async () => {
    setBand(true);
    const r = await buxSaldoBekor(kid, yangiOperationId());
    setBand(false);
    if (!r.ok) { setXato(buxXato(r)); return; }
    toast(t('Boshlang‘ich qoldiq bekor qilindi (storno)'), 'ok'); setKoruv(null); onOzgardi();
  };

  return (
    <div className="space-y-3">
      <XatoQator xato={xato} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{t('Boshlang‘ich qoldiq (начальные остатки)')}</span>
        <Izoh matn={t('1C dagi «оборотно-сальдовая ведомость» (Excel/CSV) ni yuklang. Ustunlarni moslang, ko‘rikda xatolar va Debet = Kredit tekshiriladi, keyin bitta partiya bilan yoziladi. Faqat bir marta; xato bo‘lsa bekor qilib qayta yuklang.')} />
        <label className="fz-btn cursor-pointer"><FileUp size={14} /> {t('Fayl tanlash')}<input type="file" className="hidden" accept=".csv,.txt,.xlsx,.xls" aria-label={t('Boshlang‘ich qoldiq fayli')} onChange={(e) => void faylTanla(e.target.files?.[0])} /></label>
        {fayl && <span className="text-[12px] text-text-mute">{fayl.nom}</span>}
      </div>
      {fayl && map && (
        <div className="fz-panel space-y-2" role="group" aria-label={t('Ustunlarni moslash')}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {SALDO_MAYDONLAR.map((f) => (
              <div key={f}><span className={yorliq}>{MAYDON_NOM[f]()}</span>
                <select aria-label={MAYDON_NOM[f]()} className={kirit} value={map[f] ?? ''} onChange={(e) => { setMap({ ...map, [f]: e.target.value === '' ? null : Number(e.target.value) }); setKoruv(null); }}>
                  <option value="">—</option>
                  {(fayl.grid[Math.max(boshQator - 1, 0)] ?? []).map((c, i) => <option key={i} value={i}>{i + 1}. {String(c ?? '').slice(0, 24) || '…'}</option>)}
                </select></div>
            ))}
            <div><span className={yorliq}>{t('Ma‘lumot boshlanadigan qator')}</span><input type="number" min={0} className={kirit} aria-label={t('Boshlanish qatori')} value={boshQator} onChange={(e) => { setBoshQator(Math.max(0, Number(e.target.value) || 0)); setKoruv(null); }} /></div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div><span className={yorliq}>{t('Qoldiq sanasi')}</span><input type="date" className={`${kirit} w-36`} aria-label={t('Qoldiq sanasi')} value={sana} onChange={(e) => { setSana(e.target.value); setKoruv(null); }} /></div>
            <div><span className={yorliq}>{t('Muvozanat hisobi')}</span><input className={`${kirit} w-24`} maxLength={4} aria-label={t('Muvozanat hisobi')} value={qarshi} onChange={(e) => { setQarshi(e.target.value.replace(/\D/g, '')); setKoruv(null); }} /></div>
            <button type="button" className="fz-btn" disabled={band || !parse || parse.qatorlar.length === 0} onClick={() => void yubor(true)}>{t('Ko‘rik (tekshirish)')}</button>
            {tasdiqlaydi && <button type="button" className="fz-btn" disabled={band || !koruv?.ok || !koruv.dry} onClick={() => void yubor(false)}>{t('Yozish')}</button>}
            {tasdiqlaydi && <button type="button" className="fz-btn" disabled={band} title={t('Hamma boshlang‘ich qoldiq provodkalarini storno qiladi')} onClick={() => void bekor()}><Undo2 size={13} /> {t('Bekor qilish')}</button>}
          </div>
          {parse && <p className="text-[12px] text-text-mute">{t('O‘qildi: {n} qator; o‘tkazildi (hisobsiz/jami): {s}; kontragent moslanmadi: {m}.', { n: parse.qatorlar.length, s: parse.otkazildi, m: parse.moslanmadi })}</p>}
        </div>
      )}
      {koruv && (
        <div className="fz-panel space-y-1 text-[12.5px]" role="status" aria-label={t('Ko‘rik natijasi')}>
          <p>{t('Yoziladigan qator')}: <b>{koruv.yozilishi ?? 0}</b> · {t('Jami Debet')}: <Son v={koruv.jami_dt ?? 0} /> · {t('jami Kredit')}: <Son v={koruv.jami_kt ?? 0} /> · {t('Farq')}: <Son v={koruv.farq ?? 0} /></p>
          {koruv.ok && koruv.dry && <p className="text-ok">{t('Tekshiruv o‘tdi: «Yozish» tugmasini bosing.')}</p>}
          {koruv.code === 'MUVOZANAT_YOQ' && <p className="text-danger">{t('Jami Debet jami Kreditga teng emas — fayl yoki ustunlarni tekshiring.')}</p>}
          {(koruv.xatolar?.length ?? 0) > 0 && (
            <table className="w-full max-w-md text-[12px]" aria-label={t('Xatolar')}>
              <thead><tr className="text-left text-text-mute"><th className={th}>{t('Qator')}</th><th className={th}>{t('Xato')}</th></tr></thead>
              <tbody>{koruv.xatolar?.map((x, i) => <tr key={i} className="border-t border-border/50"><td className={td}>{x.qator}</td><td className={td}>{x.kod}{x.hisob ? ` (${x.hisob})` : ''}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
