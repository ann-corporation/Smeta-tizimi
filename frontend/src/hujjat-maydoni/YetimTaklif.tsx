/**
 * YetimTaklif.tsx - Disk «Biriktirilmagan» papkasi: har fayl uchun «Qaysi obyekt/loyihaga?» taklifi (Disk A4).
 * Taklif serverdan keladi: avval deterministik (registry metadata, fayl nomi <-> obyekt/loyiha nomlari, lotin/kirill), noaniq qolganini
 * foydalanuvchi bosganda AI hal qiladi (token yechiladi). Ko'chirish - bir bosish; «Hammasini» - tasdiq dialogi bilan.
 * Ko'chirish serverda (t2_disk_yetim_kochir_v1): ruxsat, tizim papkalari, kalit qoidasi, versiyalar saqlanadi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from '../umumiy/ui/Toast';
import { tasdiqSora } from '../umumiy/ui/Tasdiq';
import { t } from '../i18n/til';
import { hmHajm, hmYetim, hmYetimAi, hmYetimKochir, type HmYetim, type HmYetimFayl, type HmYetimTaklif } from '../api/t2-hujjat-maydoni';

/** Tanlangan (qo'lda) maqsad: o:ID (obyekt) yoki l:ID (loyiha); bo'sh - taklif bo'yicha. */
type Qolda = Record<number, string>;
type Maqsad = { loyihaId: number | null; obyektId: number | null };

const MANBA_NOMI: Record<string, string> = { metadata: 'hujjat ma‘lumoti', nom: 'nom bo‘yicha', ai: 'AI taklifi' };
const maqsadMatni = (tk: HmYetimTaklif | undefined) => (tk && tk.daraja !== 'yoq' ? [tk.loyihaNom, tk.obyektNom].filter(Boolean).join(' › ') : '');

export function YetimTaklif({ kompId, papkaId, onOzgardi }: { kompId: number; papkaId: number | null; onOzgardi: () => unknown }) {
  const [d, setD] = useState<HmYetim | null>(null);
  const [yuk, setYuk] = useState(false);
  const [aiYuk, setAiYuk] = useState(false);
  const [band, setBand] = useState<number | 'hammasi' | null>(null);
  const [ai, setAi] = useState<Record<number, HmYetimTaklif>>({});
  const [qolda, setQolda] = useState<Qolda>({});
  const [xato, setXato] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    setYuk(true); setXato(null);
    try { const r = await hmYetim(kompId); if (r.ok) setD(r); else setXato(r.xato ?? t('Amal bajarilmadi.')); } finally { setYuk(false); }
  }, [kompId]);
  useEffect(() => { void yukla(); }, [yukla]);

  const yozaOladi = (d?.daraja ?? 0) >= 3;
  /** Amaldagi taklif: qo'lda tanlov > AI > deterministik. */
  const maqsad = useCallback((f: HmYetimFayl): { m: Maqsad; tk: HmYetimTaklif | undefined; qoldami: boolean } => {
    const q = qolda[f.id];
    if (q) {
      const [tur, id] = q.split(':'); const n = Number(id);
      if (tur === 'o') { const o = d?.obyektlar.find((x) => x.id === n); if (o) return { m: { loyihaId: o.loyiha_id, obyektId: o.id }, tk: undefined, qoldami: true }; }
      if (tur === 'l') return { m: { loyihaId: n, obyektId: null }, tk: undefined, qoldami: true };
    }
    const tk = ai[f.id] ?? f.taklif;
    return { m: tk.daraja === 'yoq' ? { loyihaId: null, obyektId: null } : { loyihaId: tk.loyihaId, obyektId: tk.obyektId }, tk, qoldami: false };
  }, [qolda, ai, d]);
  const maqsadNomi = useCallback((m: Maqsad) => {
    if (!d) return '';
    const o = m.obyektId != null ? d.obyektlar.find((x) => x.id === m.obyektId) : undefined;
    const l = d.loyihalar.find((x) => x.id === m.loyihaId);
    return [l?.nom ?? o?.loyiha_nom, o?.nom].filter(Boolean).join(' › ');
  }, [d]);

  const taklifli = useMemo(() => (d?.fayllar ?? []).filter((f) => maqsad(f).m.loyihaId != null), [d, maqsad]);
  const taklifsiz = useMemo(() => (d?.fayllar ?? []).filter((f) => maqsad(f).m.loyihaId == null && f.taklif.daraja === 'yoq' && !ai[f.id]), [d, maqsad, ai]);

  const kochir = async (f: HmYetimFayl): Promise<boolean> => {
    const { m } = maqsad(f);
    if (m.loyihaId == null) return false;
    const r = await hmYetimKochir(kompId, f.id, m.loyihaId, m.obyektId);
    if (!r.ok) { toast(t(r.xato ?? 'Amal bajarilmadi.'), 'danger'); return false; }
    return true;
  };
  const birini = async (f: HmYetimFayl) => {
    setBand(f.id);
    try { if (await kochir(f)) { toast(t('Ko‘chirildi: {nom}', { nom: f.nom }), 'ok'); await yukla(); await onOzgardi(); } } finally { setBand(null); }
  };
  const hammasini = async () => {
    if (!taklifli.length) return;
    if (!(await tasdiqSora({ matn: t('{n} ta fayl taklif bo‘yicha obyekt papkalariga ko‘chirilsinmi? Versiyalar saqlanadi; keyin yana ko‘chirish mumkin.', { n: taklifli.length }) }))) return;
    setBand('hammasi');
    let ok = 0;
    try { for (const f of taklifli) { if (await kochir(f)) ok++; } } finally { setBand(null); }
    toast(t('Ko‘chirildi: {ok} / {n}', { ok, n: taklifli.length }), ok === taklifli.length ? 'ok' : 'warn');
    await yukla(); await onOzgardi();
  };
  const aiBilan = async () => {
    if (!taklifsiz.length) return;
    if (!(await tasdiqSora({ matn: t('AI {n} ta faylni obyektlar bilan solishtiradi. Bu AI tokenlaridan sarflaydi. Davom etilsinmi?', { n: Math.min(taklifsiz.length, 15) }) }))) return;
    setAiYuk(true);
    try {
      const r = await hmYetimAi(kompId, taklifsiz.slice(0, 15).map((f) => f.id));
      if (!r.ok) { toast(t(r.xato ?? 'Amal bajarilmadi.'), 'danger'); return; }
      setAi((o) => ({ ...o, ...Object.fromEntries(r.takliflar.map((x) => [x.faylId, x])) }));
      toast(r.takliflar.length ? t('AI {n} ta taklif topdi', { n: r.takliflar.length }) : t('AI ishonchli taklif topa olmadi: obyektni qo‘lda tanlang'), r.takliflar.length ? 'ok' : 'warn');
    } finally { setAiYuk(false); }
  };

  if (d && d.papka_id !== papkaId) return null; // faqat tizimning «Biriktirilmagan» papkasi (foydalanuvchi shu nomli papka ochsa chiqmaydi)
  if (!d && xato) return <p className="mb-2 text-[13px] text-text" role="alert">{xato}</p>;
  if (!d && yuk) return <div className="skel mb-3 h-16 rounded-lg" role="status" aria-label={t('Yuklanmoqda…')} />;
  if (!d || !d.fayllar.length) return null;

  return (
    <section className="mb-3 rounded-lg border border-border bg-surface p-3" aria-label={t('Biriktirilmagan hujjatlar')} data-testid="yetim-taklif">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold text-text">{t('Qaysi obyekt yoki loyihaga tegishli?')}</h3>
        <span className="text-[12px] text-text-mute">{t('{n} ta fayl biriktirilmagan', { n: d.fayllar.length })}</span>
        {yozaOladi && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="fz-btn" disabled={aiYuk || !taklifsiz.length || band != null} onClick={() => void aiBilan()}><Sparkles size={13} /> {aiYuk ? t('AI o‘ylamoqda…') : t('AI bilan aniqlash')}</button>
            <button type="button" className="fz-btn fz-btn--primary" disabled={!taklifli.length || band != null} onClick={() => void hammasini()}>{t('Hammasini taklif bo‘yicha ko‘chirish')} ({taklifli.length})</button>
          </div>)}
      </div>
      <table className="fz-table mt-2"><tbody>
        {d.fayllar.map((f) => {
          const { m, tk, qoldami } = maqsad(f);
          const nom = qoldami ? maqsadNomi(m) : maqsadMatni(tk);
          const qiymat = qolda[f.id] ?? '';
          return (
            <tr key={f.id} data-yetim-fayl={f.id}>
              <td className="max-w-[260px]"><span className="block truncate" title={f.nom}>{f.nom}</span><span className="text-[11px] text-text-mute">{hmHajm(f.bayt)}</span></td>
              <td className="text-[12px]">
                {nom
                  ? <span data-testid="yetim-taklif-matn"><b className="text-text">{nom}</b> <span className="fz-stamp">{qoldami ? t('tanlandi') : t(MANBA_NOMI[tk?.manba ?? 'nom'] ?? 'nom bo‘yicha')}{!qoldami && tk && tk.daraja === 'taxminiy' ? ` · ${t('tekshiring')}` : ''}</span></span>
                  : <span className="text-text-mute" data-testid="yetim-taklif-yoq">{t('Taklif topilmadi')}</span>}
              </td>
              <td className="whitespace-nowrap text-right">
                {yozaOladi && <>
                  <select className="input h-8 max-w-[170px] text-[12px]" aria-label={t('Boshqa obyekt yoki loyihani tanlash')} value={qiymat} onChange={(e) => setQolda((o) => ({ ...o, [f.id]: e.target.value }))}>
                    <option value="">{nom ? t('Taklif bo‘yicha') : t('Tanlang…')}</option>
                    {d.obyektlar.map((o) => <option key={'o' + o.id} value={`o:${o.id}`}>{[o.loyiha_nom, o.nom].filter(Boolean).join(' › ')}</option>)}
                    {d.loyihalar.map((l) => <option key={'l' + l.id} value={`l:${l.id}`}>{l.nom}</option>)}
                  </select>{' '}
                  <button type="button" className="fz-btn" disabled={m.loyihaId == null || band != null} onClick={() => void birini(f)}>{band === f.id ? t('Ko‘chirilmoqda…') : t('Ko‘chirish')}</button>
                </>}
              </td>
            </tr>
          );
        })}
      </tbody></table>
    </section>
  );
}
