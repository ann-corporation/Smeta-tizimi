import { DOCUMENT_ID, SHA256 } from '../normativ-evidence';
import { readNormativ, type NormativEnv } from '../normativ-read';
import type { RpcNatija } from '../agent-rpc';
import { jarvisHasPermission } from './authority';

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
export async function normAnswer(env: Partial<NormativEnv>, actor: number, company: number, code: string, men: RpcNatija | null) {
  if (!jarvisHasPermission(men, company, 'company.read')) {
    return { rad: true, javob: 'Normativni ko‘rish uchun kompaniyaga kirish ruxsati kerak.' };
  }
  const { SUPABASE_URL, SUPABASE_KEY } = env;
  const unavailable = { javob: 'Normativ manbasini hozir tekshirib bo‘lmadi. Keyinroq qayta urinib ko‘ring.' };
  if (!SUPABASE_URL || !SUPABASE_KEY) return unavailable;
  const response = await readNormativ({ ...env, SUPABASE_URL, SUPABASE_KEY }, actor, company, {
    q: code, edition: null, doc: null, sha: null, limit: 4, publishedOnly: true,
  });
  if (response.status === 403) return { rad: true, javob: 'Normativni ko‘rish uchun ruxsat kerak.' };
  if (!response.ok) return unavailable;
  const result = await response.json<{ natijalar?: Citation[]; sabab?: string }>();
  if (result.sabab === 'EDITION_REQUIRED' || result.sabab === 'REFERENCE_AMBIGUOUS') {
    return { javob: code + ' uchun bir nechta tahrir yoki manba bor. To‘liq normativ kodini va tahririni yozing.' };
  }
  const hits = (result.natijalar ?? []).filter(row => row && codeOf(row.norma_kod) === code);
  const hit = hits.find(row => row.hujjat_id && DOCUMENT_ID.test(row.hujjat_id) && row.sha256 && SHA256.test(row.sha256));
  if (!hit) return { javob: code + ' bo‘yicha tasdiqlangan normativ manbasi topilmadi.' };
  const q = new URLSearchParams({ kompaniya_id: String(company), hujjat_id: hit.hujjat_id!, sha256: hit.sha256! });
  const yol = '/api/normativ-qidir?' + q;
  const page = typeof hit.sahifa_pdf === 'number' && Number.isSafeInteger(hit.sahifa_pdf) && hit.sahifa_pdf > 0
    ? ' · PDF sahifa ' + hit.sahifa_pdf : '';
  return {
    javob: '**' + code + '** · tasdiqlangan normativ' + page + '\n\n[Normativ manbasini ochish](' + yol + ')',
    dalil: { tur: 'normativ', hujjat_id: hit.hujjat_id, sha256: hit.sha256, yol },
  };
}
