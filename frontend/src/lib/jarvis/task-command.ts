/** A task draft is data, never authority or a command to execute. */
export type TaskDraft = { sarlavha: string; matn: string | null; muddat: string | null;
  tur: 'ish' | 'reys' | 'tamir' | 'tekshiruv' | 'tuzatish' | 'boshqa';
  obyekt_id: number | null; ijrochi_foydalanuvchi_id: number | null };
export type TaskPreview = { ok: true; holat: 'tasdiq_kerak'; token: string; operation_id: string;
  args: TaskDraft; obyekt_nom: string | null; ijrochi_nom: string | null };
const keys = ['sarlavha', 'matn', 'muddat', 'tur', 'obyekt_id', 'ijrochi_foydalanuvchi_id'];
const kinds = ['ish', 'reys', 'tamir', 'tekshiruv', 'tuzatish', 'boshqa'];
const id = (v: unknown) => v === undefined || v === null || typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
export function taskDraft(value: unknown): TaskDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const a = value as Record<string, unknown>;
  if (Object.keys(a).some(k => !keys.includes(k)) || typeof a.sarlavha !== 'string' ||
      !a.sarlavha.trim() || a.sarlavha.length > 200 || [...a.sarlavha].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
      (a.matn != null && (typeof a.matn !== 'string' || a.matn.length > 4000)) ||
      (a.tur !== undefined && !kinds.includes(String(a.tur))) || !id(a.obyekt_id) || !id(a.ijrochi_foydalanuvchi_id)) return null;
  if (a.muddat != null && (typeof a.muddat !== 'string' || !/^(?!0000)\d{4}-\d\d-\d\d$/.test(a.muddat) ||
      !Number.isFinite(Date.parse(a.muddat)) || new Date(a.muddat).toISOString().slice(0, 10) !== a.muddat)) return null;
  return { sarlavha: a.sarlavha.trim(), matn: typeof a.matn === 'string' ? a.matn : null,
    muddat: typeof a.muddat === 'string' ? a.muddat : null, tur: (a.tur ?? 'ish') as TaskDraft['tur'],
    obyekt_id: (a.obyekt_id ?? null) as number | null, ijrochi_foydalanuvchi_id: (a.ijrochi_foydalanuvchi_id ?? null) as number | null };
}
