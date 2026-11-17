import { DOCUMENT_ID, SHA256 } from '../normativ-evidence';
import { readNormativ, type NormativEnv } from '../normativ-read';
import type { RpcNatija } from '../agent-rpc';
import { jarvisHasPermission } from './authority';
import { jarvisText, type JarvisText } from './reply-language';

export function normReference(text: string): string | null {
  const match = /(?:^|[^\p{L}\p{N}])(?:shn[kq]|шн[кқ]|qm[qk]|қмқ|кмк)\s*(\d{1,2}\.\d{2}\.\d{2}(?:-\d{2,4})?)(?![\d.-])/iu.exec(text);
  return match?.[1] ?? null;
}

type Citation = {
  norma_kod?: string; jadval_kod?: string; tahrir?: string; sahifa_pdf?: number;
  hujjat_id?: string; sha256?: string;
};
const codeOf = (text: unknown) => typeof text === 'string'
  ? text.match(/\d{1,2}\.\d{2}\.\d{2}(?:-\d{2,4})?/)?.[0] : undefined;

/** A direct link to a verified source excerpt. Document text never enters an instruction or model prompt. */
export async function normAnswer(env: Partial<NormativEnv>, actor: number, company: number, code: string, men: RpcNatija | null, text: JarvisText = jarvisText()) {
  if (!jarvisHasPermission(men, company, 'company.read')) {
    return { rad: true, javob: text('Normativni ko‘rish uchun kompaniyaga kirish ruxsati kerak.', 'Для просмотра норматива нужен доступ к компании.') };
  }
  const { SUPABASE_URL, SUPABASE_KEY } = env;
  const unavailable = { javob: text('Normativ manbasini hozir tekshirib bo‘lmadi. Keyinroq qayta urinib ko‘ring.', 'Не удалось проверить источник норматива. Повторите запрос позже.') };
  if (!SUPABASE_URL || !SUPABASE_KEY) return unavailable;
  const response = await readNormativ({ ...env, SUPABASE_URL, SUPABASE_KEY }, actor, company, {
    q: code, edition: null, doc: null, sha: null, limit: 4, publishedOnly: true,
  }).catch(() => null);
  if (response?.status === 403) return { rad: true, javob: text('Normativni ko‘rish uchun ruxsat kerak.', 'Для просмотра норматива нужен доступ.') };
  if (!response?.ok) return unavailable;
  const result = await response.json<{ natijalar?: Citation[]; sabab?: string }>().catch(() => null);
  if (!result) return unavailable;
  if (result.sabab === 'EDITION_REQUIRED' || result.sabab === 'REFERENCE_AMBIGUOUS') {
    return { javob: text('{code} uchun bir nechta tahrir yoki manba bor. To‘liq normativ kodini va tahririni yozing.', 'Для {code} найдено несколько редакций или источников. Укажите полный код норматива и редакцию.', { code }) };
  }
  if (!Array.isArray(result.natijalar)) return unavailable;
  const hits = result.natijalar.filter(row => row && codeOf(row.norma_kod) === code);
  const hit = hits.find(row => row.hujjat_id && DOCUMENT_ID.test(row.hujjat_id) && row.sha256 && SHA256.test(row.sha256));
  if (!hit) return { javob: text('{code} bo‘yicha tasdiqlangan normativ manbasi topilmadi.', 'Подтверждённый источник для {code} не найден.', { code }) };
  const q = new URLSearchParams({ kompaniya_id: String(company), hujjat_id: hit.hujjat_id!, sha256: hit.sha256! });
  const yol = '/api/normativ-qidir?' + q;
  const page = typeof hit.sahifa_pdf === 'number' && Number.isSafeInteger(hit.sahifa_pdf) && hit.sahifa_pdf > 0
    ? text(' · PDF sahifa {page}', ' · страница PDF {page}', { page: hit.sahifa_pdf }) : '';
  return {
    javob: text('**{code}** · tasdiqlangan normativ', '**{code}** · подтверждённый норматив', { code }) + page +
      '\n\n' + text('[Normativ manbasini ochish]({url})', '[Открыть источник норматива]({url})', { url: yol }),
    dalil: { tur: 'normativ', hujjat_id: hit.hujjat_id, sha256: hit.sha256, yol },
  };
}
