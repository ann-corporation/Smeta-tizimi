import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, ShieldAlert } from 'lucide-react';
import { F2Oyna } from './F2Oyna';
import { F2StornoOyna, type F2StornoAkt } from './F2StornoOyna';
import { FmtN } from '../../lib/format';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { stornoNomzodAktlar, type StornoFaktRejim, type StornoYukQator } from '../../lib/f2-storno';
import { t, tilLocale } from '../../i18n/til';
import { sbT2AktReestrOl, type T2AktReestr } from '../../api/supabase';

/** Reestr holati: lifecycle bo‘lsa shu, bo‘lmasa eski `holat` (qoralama / tasdiqlangan). */
function holatMatni(a: T2AktReestr): string {
  switch (a.lifecycle_status) {
    case 'draft': return t('Qoralama');
    case 'submitted': return t('Yuborilgan');
    case 'checked': return t('Tekshirilgan');
    case 'approved': return t('Tasdiqlangan');
    default: return a.holat === 'tasdiqlangan' ? t('Tasdiqlangan') : t('Qoralama');
  }
}

/**
 * F2 tayyorlash oynasidan «Eski F2 ni storno qilish (pereraschet)»: obyektning FAQAT tasdiqlangan F2 aktlari ro‘yxati (qoralama/bekor — yo‘q).
 * Bitta aktni «Tanlash» yoki BIR NECHTA aktni «Birga» bilan belgilab davom etish (egasi 2026-11-03) → `F2StornoOyna`.
 * Har eski F2 hujjatda alohida blok bo‘ladi (o‘z podvali bilan). Qoralama yaratilgach `onYaratildi(aktId)` chaqiriladi.
 */
export function F2StornoTanlov(p: {
  obyektId: number; onYop: () => void; onYaratildi: (aktId: number) => void;
  /** F2 tayyorlashdan: sukut «Faktni o'zgartirma» (audit M8). */
  faktRejimSukut?: StornoFaktRejim;
  /** Ochiq qoralama bo'lsa — storno shu qoralamaga qo'shiladi (yangi qoralama yaratilmaydi, kiritmalar yo'qolmaydi). */
  qoralamaga?: { aktId: number; onQosh: (qatorlar: StornoYukQator[], ogoh?: string) => void };
}) {
  const [reestr, setReestr] = useState<T2AktReestr[] | null>(null);
  const [xato, setXato] = useState('');
  const [tanlangan, setTanlangan] = useState<F2StornoAkt | null>(null);
  /** Birga storno qilinadigan eski F2 lar (id). */
  const [belgi, setBelgi] = useState<ReadonlySet<number>>(new Set());
  const [birga, setBirga] = useState<F2StornoAkt[] | null>(null);
  /** Barqaror (audit M6): har renderda yangi massiv — oyna qayta yuklanib, belgilar tiklanib ketardi. */
  const birgaQolgan = useMemo(() => birga?.slice(1) ?? [], [birga]);

  useEffect(() => {
    let jonli = true;
    void (async () => {
      try {
        const r = await sbT2AktReestrOl(p.obyektId);
        if (!jonli) return;
        if (!r.ok) { setXato(t('F2 reestri o‘qilmadi. Qayta urinib ko‘ring.')); return; }
        setReestr(((r.qatorlar ?? []) as T2AktReestr[]).filter((a) => a.tur === 'f2'));
      } catch { if (jonli) setXato(t('F2 reestri o‘qilmadi. Qayta urinib ko‘ring.')); }
    })();
    return () => { jonli = false; };
  }, [p.obyektId]);

  if (birga && birga.length > 0 && reestr) {
    return <F2StornoOyna obyektId={p.obyektId} akt={birga[0]} qoshimcha={birgaQolgan} reestr={reestr} onYop={p.onYop} onYaratildi={p.onYaratildi} faktRejimSukut={p.faktRejimSukut} qoralamaga={p.qoralamaga} />;
  }
  if (tanlangan && reestr) {
    return <F2StornoOyna obyektId={p.obyektId} akt={tanlangan} reestr={reestr} onYop={p.onYop} onYaratildi={p.onYaratildi} faktRejimSukut={p.faktRejimSukut} qoralamaga={p.qoralamaga} />;
  }

  const nomzod = reestr ? stornoNomzodAktlar(reestr) : [];
  const belgila = (id: number, on: boolean) => setBelgi((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  return (
    <F2Oyna label={t('Eski F2 ni storno qilish (pereraschet)')} onYop={p.onYop} kenglik={760}>
      <div className="fz-card__head" style={{ padding: '10px 16px' }}><h3 className="fz-card__title"><RotateCcw size={15} aria-hidden="true" /> {t('Eski F2 ni storno qilish (pereraschet)')}</h3></div>
      <div className="space-y-3 p-4 text-[13px]">
        <p className="text-text-dim">{t('Storno qilinadigan F2 ni tanlang: uning qatorlari minus qilib yangi qoralamaga yoziladi, asl F2 o‘zgarmaydi. Keyin shu oynada yangi smeta qatorlarini qo‘shasiz.')}</p>
        <p className="text-text-dim">{t('Bir nechta eski F2 ni «Birga» bilan belgilang: ularning qatorlari bitta hujjatda alohida bloklar bo‘lib tepada turadi, har biri o‘z podvali bilan.')}</p>
        {xato && <p role="alert" className="fz-note fz-note--danger"><ShieldAlert />{xato}</p>}
        {!xato && !reestr && <div className="skel min-h-[120px] rounded-xl" />}
        {reestr && nomzod.length === 0 && <p data-testid="storno-tanlov-bosh" className="text-text-dim">{t('Bu obyektda tasdiqlangan F2 yo‘q — storno qilinadigan hujjat yo‘q.')}</p>}
        {nomzod.length > 0 && (
          <div className="max-h-[50dvh] overflow-auto rounded border border-border/60">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-surface-2 text-left text-text-dim"><tr><th className="p-1.5">№</th><th>{t('Davr')}</th><th>{t('Holat')}</th><th className="text-right">{t('Qatorlar')}</th><th className="text-right">{t('Summa')}</th><th className="p-1.5" /></tr></thead>
              <tbody>
                {nomzod.map((a) => (
                  <tr key={a.id} data-testid="storno-tanlov-akt" className="border-t border-border/40">
                    <td className="p-1.5 font-medium">{a.raqam || a.id}</td>
                    <td>{davrNomi(a.oy ?? '', tilLocale()) || '—'}</td>
                    <td>{holatMatni(a)}</td>
                    <td className="text-right tabular-nums">{a.qator_soni ?? '—'}</td>
                    <td className="text-right tabular-nums">{a.hujjat_jami == null ? <span className="text-warn">{t('noma‘lum')}</span> : <FmtN val={a.hujjat_jami} />}</td>
                    <td className="p-1.5 text-right">
                      <button type="button" className="fz-btn fz-btn--sm" onClick={() => setTanlangan({ id: a.id, raqam: a.raqam, oy: a.oy, hujjat_jami: a.hujjat_jami })}>{t('Tanlash')}</button>
                      <label className="ml-2 inline-flex items-center gap-1 text-text-dim">
                        <input type="checkbox" data-testid="storno-tanlov-belgi" checked={belgi.has(a.id)} onChange={(e) => belgila(a.id, e.target.checked)} aria-label={t('Birga storno: F2 №{r}', { r: a.raqam || String(a.id) })} />{t('Birga')}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2">
          {belgi.size > 0 && (
            <button type="button" data-testid="storno-tanlov-davom" className="fz-btn fz-btn--primary"
              onClick={() => setBirga(nomzod.filter((a) => belgi.has(a.id)).sort((x, y) => (x.oy ?? '').localeCompare(y.oy ?? '') || x.id - y.id).map((a) => ({ id: a.id, raqam: a.raqam, oy: a.oy, hujjat_jami: a.hujjat_jami })))}>
              {t('Belgilangan F2 lar bilan davom etish ({n})', { n: belgi.size })}
            </button>
          )}
          <button type="button" className="fz-btn fz-btn--ghost" onClick={p.onYop}>{t('Yopish')}</button>
        </div>
      </div>
    </F2Oyna>
  );
}

export default F2StornoTanlov;
