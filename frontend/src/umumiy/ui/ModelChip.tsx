import { useEffect, useState } from 'react';
import { modelShaxsiyOl, modelShaxsiyTanla, modellarOl, type ModelKatalogi } from '../../api/t2-agent-ish';
import { ModelTanlagich } from '../../admin/ai-markaz/ModelTanlagich';
import { t } from '../../i18n/til';
import { toast } from './Toast';

/**
 * AI ishlatiladigan HAR JOYDA ko'rinadigan ixcham model tanlagich. Foydalanuvchi shu funksiya (profil) uchun o'z modelini tanlaydi:
 * tavsiya, «mos emas» ogohlantirishi va narx — ModelTanlagich beradi. Faqat superadmin tasdiqlagan katalogdan; tanlanmasa — admin belgilagan standart.
 * Migratsiya/server hali tayyor bo'lmasa chip jim yashirinadi (AI ishlayveradi).
 */
export function ModelChip({ profil, kompaniyaId, yorliq }: { profil: string; kompaniyaId: number | null; yorliq?: string }) {
  const [katalog, setKatalog] = useState<ModelKatalogi[] | null>(null);
  const [tanlov, setTanlov] = useState<string | null>(null);
  const [standart, setStandart] = useState<string | null>(null);

  useEffect(() => {
    let tirik = true;
    setKatalog(null);
    if (kompaniyaId == null) return undefined;
    void Promise.all([modellarOl(kompaniyaId), modelShaxsiyOl()]).then(([m, s]) => {
      if (!tirik || !m.ok || !s.ok) return;
      setKatalog(m.natija.katalog);
      setTanlov(s.natija.tanlovlar.find((x) => x.profil === profil)?.model_id ?? null);
      setStandart(m.natija.agentlar.find((a) => a.kod === profil)?.model_id ?? null);
    });
    return () => { tirik = false; };
  }, [kompaniyaId, profil]);

  if (!katalog || !katalog.length) return null;
  const tanla = async (id: string | null) => {
    const r = await modelShaxsiyTanla(profil, id);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    setTanlov(id);
    toast(id ? t('Model tanlandi — keyingi javoblar shu model bilan') : t('Standart modelga qaytildi'), 'ok');
  };
  const nom = (id: string | null) => katalog.find((k) => k.id === id)?.nom ?? id;
  return (
    <div className="border-b border-border bg-surface px-3 py-2" data-testid="model-chip">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-text-mute">
        <span>{t('AI modeli')}</span>
        <span className="normal-case">{tanlov ? t('sizning tanlovingiz') : standart ? `${t('standart')}: ${nom(standart)}` : t('server standarti')}</span>
      </div>
      <ModelTanlagich profil={profil} qiymat={tanlov} katalog={katalog} rejim="kompaniya" onTanla={(id) => void tanla(id)} yorliq={yorliq ?? t('Shu funksiya uchun AI modelini tanlash')} />
    </div>
  );
}
