import { f2Tasdiq } from '../../api/f2-buyruq';
import { t } from '../../i18n/til';
import { f2XatoMatni, previewMatni } from '../yordamchi/vosita/f2-mcp-liniya';
import type { IshlovTaklif } from '../../umumiy/ui/yordamchi/ishlov';
import type { JarvisPreview } from './write-tools';

/** A server preview uses the same manual confirmation card as other Jarvis actions. */
export function f2PreviewCard(company: number, preview: JarvisPreview): IshlovTaklif {
  const name = preview.tavsif ?? String(preview.vosita);
  return {
    amallar: [{ tur: 'vosita', qator: null, qiymat: null, izoh: previewMatni(preview), ogoh: null }],
    qoshimcha: () => null,
    vositalar: { sahifa: 'buyruq', kontekst: () => '', oqi: () => '', tekshir: () => null, nomi: () => name, pul: () => true,
      bajar: async () => {
        const result = await f2Tasdiq(company, preview.token);
        return [result.ok ? t('Yozildi') : f2XatoMatni(result)];
      } },
  };
}
