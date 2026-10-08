/**
 * AgentModelSiyosati.tsx — kompaniya admini/boss/direktori: a'zolar AI modelini o'zi tanlay olsinmi (xarajat nazorati).
 * Cheklansa, hamma uchun admin belgilagan (yoki platforma) model ishlaydi; shaxsiy tanlovlar saqlanadi, lekin e'tiborga olinmaydi.
 */
import { useCallback, useEffect, useState } from 'react';
import { modelSiyosatOl, modelSiyosatSaqla, type ModelSiyosati } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

export function AgentModelSiyosati({ kompaniyaId }: { kompaniyaId: number }) {
  const [s, setS] = useState<ModelSiyosati | null>(null);
  const yukla = useCallback(async () => { const r = await modelSiyosatOl(kompaniyaId); setS(r.ok ? r.natija : null); }, [kompaniyaId]);
  useEffect(() => { void yukla(); }, [yukla]);
  if (!s) return null;
  const ozgartir = async (erkin: boolean) => {
    const r = await modelSiyosatSaqla(kompaniyaId, erkin);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(erkin ? t('A’zolar AI modelini o‘zi tanlay oladi') : t('Endi hamma uchun kompaniya/platforma modeli ishlaydi'), 'ok'); void yukla();
  };
  return (
    <div className="karta p-3">
      <label className="flex items-start gap-2 text-[13px]">
        <input type="checkbox" disabled={!s.tahrir_mumkin} checked={s.model_erkin} onChange={(e) => void ozgartir(e.target.checked)} className="mt-0.5" />
        <span><b className="text-text">{t('A’zolar AI modelini o‘zi tanlay olsin')}</b><br />
          <span className="text-[12px] text-text-mute">{t('O‘chirsangiz, hamma uchun admin belgilagan (yoki platforma) model ishlaydi — qimmat model tanlanishi oldi olinadi. Shaxsiy tanlovlar saqlanadi, lekin hisobga olinmaydi.')}</span></span>
      </label>
    </div>
  );
}
