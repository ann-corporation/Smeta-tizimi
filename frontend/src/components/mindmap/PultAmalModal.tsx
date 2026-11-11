/**
 * Pult amali modali: forma → OLDINDAN KO‘RISH → tasdiq. Hech narsa «Tasdiqlash» bosilmaguncha yozilmaydi.
 * Mantiq `lib/mindmap-pult` da (bu yerda faqat chizish); yozuv — `PultKontekst.yozuvchi` (mavjud buyruqlar, ruxsat serverda).
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft } from 'lucide-react';
import { t } from '../../i18n/til';
import type { MindmapGraf } from '../../api/t2-mindmap';
import { PULT_AMALLAR, pultNishon, pultTayyorla, type PultKontekst, type PultNatija, type PultReja, type PultYamoq } from '../../lib/mindmap-pult';
import { ModalOyna } from '../pto-workspace/ModalOyna';

const maydonSinf = 'h-8 w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-surface px-2 text-[12.5px]';

export type PultTugatdi = { yangiTugunId?: string; yamoq?: PultYamoq };

export function PultAmalModal({ graf, nishonId, amalKalit, kontekst, onYop, onTugadi }: {
  graf: MindmapGraf; nishonId: string; amalKalit: string; kontekst: PultKontekst; onYop: () => void;
  /** Muvaffaqiyatli yozuvdan keyin (modal ochiq qoladi — natija ko‘rsatiladi; ekran yamoq bilan yangilanadi). */
  onTugadi: (t: PultTugatdi) => void;
}) {
  const tarif = PULT_AMALLAR.find((a) => a.kalit === amalKalit) ?? null;
  const nishon = useMemo(() => pultNishon(graf, nishonId), [graf, nishonId]);
  const [q, setQ] = useState<Record<string, string>>({});
  // Maydonsiz amal (masalan, «shartnomadan ajratish») — to‘g‘ridan-to‘g‘ri oldindan ko‘rish.
  const [boshlang] = useState(() => (tarif && nishon && tarif.maydonlar.length === 0 ? pultTayyorla(graf, nishonId, amalKalit, {}, kontekst) : null));
  const [reja, setReja] = useState<PultReja | null>(boshlang?.ok ? boshlang.reja : null);
  const [xato, setXato] = useState(boshlang && !boshlang.ok ? boshlang.xato : '');
  const [ish, setIsh] = useState(false);
  const [natija, setNatija] = useState<(PultNatija & { ogoh?: string }) | null>(null);
  if (!tarif || !nishon) return null;

  const koshish = (qiym: Record<string, string>) => {
    const r = pultTayyorla(graf, nishonId, amalKalit, qiym, kontekst);
    if (r.ok) { setReja(r.reja); setXato(''); } else { setReja(null); setXato(r.xato); }
  };
  const tasdiqla = async () => {
    if (!reja || ish) return;
    setIsh(true); setXato('');
    try {
      const r = await reja.bajar();
      if (r.ok) { setNatija(r); onTugadi({ yangiTugunId: r.yangiTugunId, yamoq: reja.yamoq }); }
      else setXato(r.error || t('Amal bajarilmadi.'));
    } catch (e) {
      setXato(e instanceof Error ? e.message : String(e));
    } finally { setIsh(false); }
  };

  return (
    <ModalOyna sarlavha={tarif.nom()} yop={onYop} kenglik={480}>
      <div className="space-y-3" data-testid="pult-modal" data-amal={amalKalit}>
        <p className="text-[12.5px] text-text-dim break-words">{nishon.nom || t('Kompaniya')}</p>

        {natija && (
          <div className="space-y-3" data-testid="pult-natija">
            <div className="fz-note fz-note--info" role="status"><CheckCircle2 aria-hidden /><span>{t('Bajarildi. Xarita yangilanmoqda.')}</span></div>
            {natija.ogoh && <div className="fz-note fz-note--warn" role="alert"><AlertTriangle aria-hidden /><span>{natija.ogoh}</span></div>}
            <div className="flex justify-end"><button type="button" className="fz-btn fz-btn--sm fz-btn--primary" onClick={onYop}>{t('Yopish')}</button></div>
          </div>
        )}
        {!natija && reja && (
          <div className="space-y-3" data-testid="pult-korish">
            <section className="fz-panel space-y-1.5">
              <div className="fz-panel__h"><span>{reja.sarlavha}</span><span>{t('oldindan ko‘rish')}</span></div>
              <ul className="space-y-1 text-[12.5px] text-text">
                {reja.oqibat.map((s, i) => <li key={i} className="break-words">• {s}</li>)}
              </ul>
              {reja.ogoh.map((s, i) => <div key={i} className="fz-note fz-note--warn"><AlertTriangle aria-hidden /><span>{s}</span></div>)}
              <p className="text-[11.5px] text-text-mute">{t('Buyruq: {b}. Ruxsat va audit serverda tekshiriladi.', { b: reja.buyruqlar.join(' → ') })}</p>
            </section>
            {xato && <div className="fz-note fz-note--danger" role="alert"><AlertTriangle aria-hidden /><span>{xato}</span></div>}
            <div className="flex justify-between gap-2">
              {tarif.maydonlar.length > 0
                ? <button type="button" className="fz-btn fz-btn--sm" onClick={() => { setReja(null); setXato(''); }}><ChevronLeft aria-hidden />{t('Orqaga')}</button>
                : <button type="button" className="fz-btn fz-btn--sm" onClick={onYop}>{t('Bekor qilish')}</button>}
              <button type="button" className="fz-btn fz-btn--sm fz-btn--primary" disabled={ish} onClick={() => void tasdiqla()} data-testid="pult-tasdiq">{reja.tasdiq}</button>
            </div>
          </div>
        )}
        {!natija && !reja && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); koshish(q); }} data-testid="pult-forma">
            {tarif.maydonlar.map((m, i) => {
              const variantlar = m.tur === 'tanlov' ? m.tanlovlar?.(graf, nishon) ?? [] : [];
              return (
                <label key={m.kalit} className="block space-y-1 text-[12px] text-text-dim">
                  <span>{m.nom()}{m.majburiy ? ' *' : ''}</span>
                  {m.tur === 'tanlov' ? (
                    <select autoFocus={i === 0} value={q[m.kalit] ?? ''} onChange={(e) => setQ((s) => ({ ...s, [m.kalit]: e.target.value }))} className={maydonSinf} data-maydon={m.kalit}>
                      <option value="">{t('Tanlang…')}</option>
                      {variantlar.map((v) => <option key={v.qiymat} value={v.qiymat}>{v.nom}</option>)}
                    </select>
                  ) : (
                    <input autoFocus={i === 0} value={q[m.kalit] ?? ''} maxLength={200} onChange={(e) => setQ((s) => ({ ...s, [m.kalit]: e.target.value }))} className={maydonSinf} data-maydon={m.kalit} />
                  )}
                </label>
              );
            })}
            {xato && <div className="fz-note fz-note--danger" role="alert"><AlertTriangle aria-hidden /><span>{xato}</span></div>}
            <div className="flex justify-end gap-2">
              <button type="button" className="fz-btn fz-btn--sm" onClick={onYop}>{t('Bekor qilish')}</button>
              <button type="submit" className="fz-btn fz-btn--sm fz-btn--primary" data-testid="pult-korish-tugma">{t('Oldindan ko‘rish')}</button>
            </div>
          </form>
        )}
      </div>
    </ModalOyna>
  );
}
