import { t } from '../i18n/til';
import { XATO_MATN } from './hooks';

/** Server xato kodi → tushunarli matn (tarjimali). */
export function xatoMatn(e: unknown): string {
  const kod = e instanceof Error ? e.message : String(e ?? '');
  const m = XATO_MATN[kod];
  return m ? t(m) : kod === 'NETWORK' ? t('Tarmoq xatosi. Qayta urinib ko‘ring.') : t('Amal bajarilmadi: {kod}', { kod });
}
