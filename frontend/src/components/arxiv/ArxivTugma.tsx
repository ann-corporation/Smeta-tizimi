import { useState } from 'react';
import { Archive } from 'lucide-react';
import { arxivlashJarayoni, type ArxivTur } from '../../api/t2-arxiv';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { mindmapTahrirRuxsati } from '../../lib/mindmap-ruxsat';
import { t } from '../../i18n/til';

/**
 * «Korzinkaga» tugmasi — bitta umumiy komponent (loyiha, obyekt, shartnoma, kontragent, АОСР va F2 qoralama).
 * Tasdiq so'raydi, server rol va «tasdiqlangan hujjat bor» blokini tekshiradi va aniq sabab qaytaradi.
 * Ruxsati yo'q foydalanuvchiga tugma ko'rsatilmaydi (server baribir yakuniy to'siq).
 */
export function ArxivTugma({ tur, id, nom, onDone, kichik = true, matn, ikonFaqat = false }: {
  tur: ArxivTur; id: number; nom: string; onDone?: () => void; kichik?: boolean; matn?: string; ikonFaqat?: boolean;
}) {
  const { joriy } = useKompaniya();
  const [band, setBand] = useState(false);
  if (!mindmapTahrirRuxsati({ joriy: joriy ? { id: joriy.id, rol: joriy.rol, membershipRole: joriy.membershipRole, permissions: joriy.permissions } : null }).mumkin) return null;
  const bos = async () => {
    if (band) return;
    setBand(true);
    try { if (await arxivlashJarayoni(tur, id, nom)) onDone?.(); }
    finally { setBand(false); }
  };
  return (
    <button type="button" disabled={band} onClick={(e) => { e.stopPropagation(); void bos(); }} aria-label={`${t('Korzinkaga')}: ${nom}`} title={t('Korzinkaga yuborish (keyin tiklash mumkin)')}
      className={`fz-btn fz-btn--ghost ${ikonFaqat ? 'fz-btn--icon' : ''} ${kichik ? 'fz-btn--sm' : ''} text-text-dim hover:text-danger`} data-testid={`arxiv-${tur}-${id}`}>
      <Archive size={14} aria-hidden="true" />{ikonFaqat ? null : (matn ?? t('Korzinkaga'))}
    </button>
  );
}
