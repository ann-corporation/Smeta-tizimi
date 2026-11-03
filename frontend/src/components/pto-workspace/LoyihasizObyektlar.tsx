import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { useIxtiyoriyQueryClient } from '../../api/t2-obyektlar-kesh';
import { t } from '../../i18n/til';
import { sbObyektLoyihagaBiriktir } from '../../api/t2-loyiha';
import { toast } from '../../umumiy/ui/Toast';

type Qator = { id: number; nom: string };
type LoyihaTanlov = { id: number; nom: string };

/**
 * «Loyihasiz obyektlar» guruhi: egasi qoidasi — loyihasi yo'q obyekt yashirilmaydi. Har qatorda loyiha tanlanadi
 * va «Loyihaga biriktirish» bitta bosish bilan `t2_obyekt_loyihaga_biriktir` RPC'sini chaqiradi.
 */
export function LoyihasizObyektlar({ companyId, obyektlar, loyihalar, boshlangichLoyihaId = null, onOpen, onChanged }: {
  companyId: number; obyektlar: readonly Qator[]; loyihalar: readonly LoyihaTanlov[]; boshlangichLoyihaId?: number | null;
  onOpen?: (id: number) => void; onChanged?: () => void;
}) {
  const qc = useIxtiyoriyQueryClient();
  const [tanlov, setTanlov] = useState<Record<number, string>>({});
  const [band, setBand] = useState<number | null>(null);
  if (!obyektlar.length) return null;
  const tanlangan = (id: number) => tanlov[id] ?? (boshlangichLoyihaId != null ? String(boshlangichLoyihaId) : loyihalar.length === 1 ? String(loyihalar[0].id) : '');
  const biriktir = async (o: Qator) => {
    const loyihaId = Number(tanlangan(o.id));
    if (!loyihaId) return;
    setBand(o.id);
    try {
      const r = await sbObyektLoyihagaBiriktir(o.id, loyihaId);
      if (!r.ok) { toast(r.error || r.xabar || t('Loyihaga biriktirilmadi'), 'danger'); return; }
      toast(t('Obyekt loyihaga biriktirildi.'), 'ok');
      void qc?.invalidateQueries({ queryKey: ['obyektlar'] });
      void qc?.invalidateQueries({ queryKey: ['pto-company-lineage', companyId] });
      onChanged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Loyihaga biriktirilmadi'), 'danger');
    } finally { setBand(null); }
  };
  return (
    <section className="fz-note fz-note--warn flex-col items-stretch gap-2" aria-label={t('Loyihasiz obyektlar')} data-testid="loyihasiz-obyektlar">
      <div>
        <b>{t('Loyihasiz obyektlar')} ({obyektlar.length})</b>
        <p className="text-[12px] text-text-dim">{t('Bu obyektlar hech bir loyihaga biriktirilmagan, lekin yashirilmaydi. Loyihaga biriktirsangiz, shartnoma va hisobotlarda to‘g‘ri guruhlanadi.')}</p>
      </div>
      <ul className="space-y-1.5">
        {obyektlar.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-2" data-testid={`loyihasiz-${o.id}`}>
            {onOpen
              ? <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold hover:underline" onClick={() => onOpen(o.id)}>{o.nom}</button>
              : <span className="min-w-0 flex-1 truncate font-semibold">{o.nom}</span>}
            <select aria-label={`${t('Loyiha')}: ${o.nom}`} value={tanlangan(o.id)} onChange={(e) => setTanlov((p) => ({ ...p, [o.id]: e.target.value }))}
              className="h-8 max-w-[220px] rounded-md border border-[var(--border-strong)] bg-bg px-2 text-[13px]">
              <option value="">{t('Loyihani tanlang')}</option>
              {loyihalar.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
            <button type="button" className="fz-btn fz-btn--sm" disabled={!tanlangan(o.id) || band === o.id} onClick={() => void biriktir(o)}>
              <Link2 size={13} aria-hidden="true" /> {t('Loyihaga biriktirish')}
            </button>
          </li>
        ))}
      </ul>
      {!loyihalar.length && <p className="text-[12px] text-text-dim">{t('Hali loyiha yo‘q.')} <a href="/admin/loyiha" className="text-[var(--accent-text)] underline">{t('Loyiha yaratish')}</a></p>}
    </section>
  );
}
