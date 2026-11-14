/**
 * Karta qatlamlari: (1) chiziq tortilganda TASDIQ KARTASI — nima bo‘lishini oddiy o‘zbekcha aytadi va kerak bo‘lsa rol/ruxsat
 * so‘raydi; (2) tugundan AMALLAR menyusi — jadvaldagi (pult) bilan bir xil amallar va modallar. Mantiq `lib/mindmap-boglanish*` da.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import type { MindmapGraf } from '../api/t2-mindmap';
import { resurslarOl, type TomonResurs } from '../api/t2-tomon';
import type { VazifaBoshqaruv } from '../components/mindmap/AmalMenyu';
import { useTugunAmallar, type MaxsusAmal, type PultBoshqaruvKichik } from '../components/mindmap/useTugunAmallar';
import type { MasulBoshqaruv } from '../components/mindmap/XaritaJamoa';
import { daraxtQur } from '../lib/mindmap-korinish';
import { tugunNishoni, type AmalKorish, type AmalNishon } from '../lib/mindmap-amallar';
import { TOMON_ROLLARI, type Qoida } from '../lib/mindmap-boglanish';
import { qoidaniBajar, type BajarDeps, type Kirish } from '../lib/mindmap-boglanish-bajar';
import { t } from '../i18n/til';

type Ishlaydi = Extract<Qoida, { holat: 'ishlaydi' }>;

/** Chiziq tortildi → tasdiq kartasi. Tasdiqlansagina yoziladi. */
export function BoglanishTasdiq({ qoida, kompaniyaId, deps, rollar, onYop, onTugadi, onYol }: {
  qoida: Ishlaydi; kompaniyaId: number; deps: BajarDeps; rollar: { kalit: string; nom: string }[]; onYop: () => void; onTugadi: (xabar: string) => void;
  /** sub_topshir: mavjud topshirish sahifasiga o‘tish. */ onYol?: (yol: string) => void;
}) {
  const rolKerak = qoida.amal === 'qatnashchi' || qoida.amal === 'tomon_taklif';
  const rolRoyxat = qoida.amal === 'tomon_taklif' ? TOMON_ROLLARI : rollar;
  const [rol, setRol] = useState('');
  const [inn, setInn] = useState('');
  const [resurslar, setResurslar] = useState<TomonResurs[] | null>(null);
  const [tanlov, setTanlov] = useState<Record<string, string[]>>({});
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState('');
  useEffect(() => {
    if (qoida.amal !== 'tomon_grant') return;
    let bekor = false;
    void resurslarOl(kompaniyaId).then((r) => { if (!bekor) { if (r.ok) setResurslar(r.natija.filter((x) => x.amallar.length)); else setXato(r.error); } });
    return () => { bekor = true; };
  }, [qoida.amal, kompaniyaId]);
  const bajar = async () => {
    if (band) return;
    if (qoida.amal === 'sub_topshir' && qoida.yol) { onYol?.(qoida.yol); return; }
    setBand(true); setXato('');
    const kirish: Kirish = { rol: rol || undefined, inn: inn || undefined, grantlar: Object.entries(tanlov).map(([resurs, amallar]) => ({ resurs, amallar })) };
    const r = await qoidaniBajar(qoida, kirish, deps);
    setBand(false);
    if (r.ok) onTugadi(r.xabar); else setXato(r.error);
  };
  const almashtir = (resurs: string, amal: string) => setTanlov((o) => {
    const joriy = o[resurs] ?? [];
    return { ...o, [resurs]: joriy.includes(amal) ? joriy.filter((a) => a !== amal) : [...joriy, amal] };
  });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] p-3" onClick={onYop}>
      <div role="dialog" aria-modal="true" aria-label={t('Bog‘lanishni tasdiqlash')} data-testid="karta-tasdiq" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-xl border border-border bg-surface p-4 shadow-2xl">
        <div className="text-[10px] uppercase tracking-wider text-[var(--info)]">{t('Chiziq = haqiqiy bog‘lanish')}</div>
        <h2 className="mt-1 text-[15px] font-semibold">{qoida.sarlavha}</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-text" data-testid="karta-tasdiq-matn">{qoida.tavsif}</p>
        {rolKerak && (
          <label className="mt-3 block text-[12px]">
            <span className="text-text-dim">{t('Rol')}</span>
            <select value={rol} onChange={(e) => setRol(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-2 py-2 text-[12px]" data-testid="karta-rol">
              <option value="">{t('Rolni tanlang…')}</option>
              {rolRoyxat.map((r) => <option key={r.kalit} value={r.kalit}>{r.nom}</option>)}
            </select>
          </label>
        )}
        {qoida.amal === 'tomon_taklif' && qoida.innKerak && (
          <label className="mt-3 block text-[12px]">
            <span className="text-text-dim">{t('Kompaniya STIRi (9 raqam)')}</span>
            <input value={inn} onChange={(e) => setInn(e.target.value)} inputMode="numeric" maxLength={11} data-testid="karta-inn" className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-2 py-2 text-[12px]" />
          </label>
        )}
        {qoida.amal === 'tomon_grant' && (
          <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto text-[12px]" data-testid="karta-grant">
            <div className="text-text-dim">{t('Nimani ko‘ra oladi?')}</div>
            {!resurslar && !xato && <div className="text-text-mute">{t('Yuklanmoqda…')}</div>}
            {resurslar?.map((r) => (
              <div key={r.kalit} className="rounded-lg border border-border p-2">
                <div className="font-medium">{r.nom}</div>
                <div className="mt-1 flex flex-wrap gap-3">
                  {r.amallar.map((a) => (
                    <label key={a} className="inline-flex items-center gap-1"><input type="checkbox" checked={(tanlov[r.kalit] ?? []).includes(a)} onChange={() => almashtir(r.kalit, a)} />{a}</label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {xato && <p role="alert" className="mt-2 text-[12px] text-[var(--danger)]">{xato}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--sm" onClick={onYop}>{t('Bekor qilish')}</button>
          <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={band || (rolKerak && !rol) || (!!qoida.innKerak && inn.replace(/\D/g, '').length < 9)} onClick={() => void bajar()} data-testid="karta-tasdiq-tugma">{band ? t('Bajarilmoqda…') : qoida.amal === 'sub_topshir' ? t('Topshirish sahifasini ochish') : t('Tasdiqlash')}</button>
        </div>
      </div>
    </div>
  );
}

export type AmalQatlamiRef = { ochish: (id: string, x: number, y: number, faqatYaratish?: boolean) => void; amalSoni: (id: string) => number; yaratishBor: (id: string) => boolean };
type AmalProps = {
  graf: MindmapGraf; pult?: PultBoshqaruvKichik; amalKorish: AmalKorish; masul: MasulBoshqaruv; vazifa: VazifaBoshqaruv; onTanla: (id: string) => void;
  /** Tomon tugunlarining amallari (kabinet, huquqlar, aloqani tugatish). */
  maxsusOl?: (id: string) => { nom: string; amallar: MaxsusAmal[] } | null;
};

/** Karta kanvasidagi tugun amallari: `MindmapXarita` bilan BIR XIL hook (`useTugunAmallar`) — takror mantiq yo‘q. */
export const AmalQatlami = forwardRef<AmalQatlamiRef, AmalProps>(function AmalQatlami({ graf, pult, amalKorish, masul, vazifa, onTanla, maxsusOl }, ref) {
  const daraxt = useMemo(() => daraxtQur(graf), [graf]);
  const nishonOl = useCallback((id: string): AmalNishon | null => {
    const tg = daraxt.tugunlar.get(id);
    if (tg) return tugunNishoni(tg, !!daraxt.jamoa);
    if (id.startsWith('shartnoma:')) {
      const n = Number(id.split(':')[1]);
      return { tur: 'shartnoma', id, entityId: Number.isSafeInteger(n) && n > 0 ? n : null, nom: graf.tugunlar.find((g) => g.id === id)?.nom ?? '', obyektId: null };
    }
    return null;
  }, [daraxt, graf.tugunlar]);
  const h = useTugunAmallar({ graf, daraxt, pult, amalKorish, masul, vazifa, nishonOl, maxsusOl, onPanel: (n) => onTanla(n.id) });
  useImperativeHandle(ref, () => ({ ochish: h.menyuOchId, amalSoni: h.amalSoni, yaratishBor: h.yaratishBor }), [h.menyuOchId, h.amalSoni, h.yaratishBor]);
  return <>{h.qatlam}</>;
});