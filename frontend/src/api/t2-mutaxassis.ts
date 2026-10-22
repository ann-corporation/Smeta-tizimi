/** T6 — mutaxassis profili va xizmat taklifi (/api/mutaxassis). */
export type Kasb = 'pto' | 'smetachi' | 'prorab' | 'loyihachi' | 'bugalter' | 'muhandis';
export type XizmatRoli = 'pto' | 'prorab' | 'bugalter' | 'kuzatuvchi';
export const KASB_NOMI: Record<Kasb, string> = { pto: 'PTO muhandisi', smetachi: 'Smetachi', prorab: 'Prorab', loyihachi: 'Loyihachi', bugalter: 'Buxgalter', muhandis: 'Muhandis' };
export type Statistika = { f2_soni: number; tasdiqlangan_f2: number; obyektlar: number; kompaniyalar: number; jami_summa: number; birinchi: string | null; oxirgi: string | null };
export type MutaxassisKarta = { foydalanuvchi_id: number; ism: string; kasb?: Kasb; hudud?: string | null; tajriba_yil?: number | null; xizmatlar?: string[];
  haqida?: string | null; ochiq?: boolean; statistika_korsat?: boolean; statistika?: Statistika | null };
export type TopilganKompaniya = { kompaniya_id: number; nom: string; manzil: string | null; azo: boolean; kutilmoqda: boolean };
export type YuborilganTaklif = { id: number; kompaniya_id: number; kompaniya_nom: string; rol: XizmatRoli; xabar: string | null; holat: 'yuborildi' | 'qabul' | 'rad' | 'bekor';
  javob_izoh: string | null; yaratildi: string; javob_vaqti: string | null };
export type KelganTaklif = { id: number; rol: XizmatRoli; xabar: string | null; holat: YuborilganTaklif['holat']; yaratildi: string; mutaxassis: MutaxassisKarta };
type Javob = { ok: boolean; code?: string; xabar?: string; error?: string; [k: string]: unknown };

const XATOLAR: Record<string, string> = {
  KUTILMOQDA: 'Bu kompaniyaga taklifingiz javob kutmoqda.', ALLAQACHON_AZO: 'Siz bu kompaniyada allaqachon ishlaysiz.',
  LIMIT_KUN: 'Bir kunda 10 tadan ortiq taklif yuborib bo‘lmaydi.', RUXSAT_YOQ: 'Bu amal uchun ruxsatingiz yo‘q.', KOMPANIYA_TOPILMADI: 'Kompaniya topilmadi.',
  TAKLIF_TOPILMADI: 'Taklif topilmadi yoki allaqachon javob berilgan.',
};
export const mutaxassisXato = (r: Javob) => (r.code && XATOLAR[r.code]) || r.xabar || r.error || 'Amal bajarilmadi.';

async function ol<T>(params: Record<string, string>): Promise<T> {
  const r = await fetch('/api/mutaxassis?' + new URLSearchParams(params).toString());
  const j = await r.json().catch(() => null) as (Javob & T) | null;
  if (!j?.ok) throw new Error(j ? mutaxassisXato(j) : 'Ma’lumot o‘qilmadi');
  return j;
}
async function yoz(body: Record<string, unknown>): Promise<Javob> {
  try {
    const r = await fetch('/api/mutaxassis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json().catch(() => ({ ok: false, error: 'Noto‘g‘ri javob' })) as Javob;
  } catch { return { ok: false, error: 'Tarmoq xatosi' }; }
}

export const profilOl = () => ol<{ profil: MutaxassisKarta | null; statistika: Statistika }>({ bolim: 'profil' });
export const profilSaqla = (p: { ochiq: boolean; kasb: Kasb; hudud: string; tajriba_yil: number | null; xizmatlar: string[]; haqida: string; statistika_korsat: boolean }) =>
  yoz({ amal: 'profil_saqla', ...p });
export const kompaniyaQidir = (matn: string) => ol<{ kompaniyalar: TopilganKompaniya[] }>({ bolim: 'kompaniya_qidir', matn }).then((d) => d.kompaniyalar);
export const taklifYubor = (kompaniyaId: number, rol: XizmatRoli, xabar: string) => yoz({ amal: 'taklif_yubor', kompaniya_id: kompaniyaId, rol, xabar });
export const taklifBekorQil = (taklifId: number) => yoz({ amal: 'taklif_bekor', taklif_id: taklifId });
export const takliflarim = () => ol<{ takliflar: YuborilganTaklif[] }>({ bolim: 'takliflarim' }).then((d) => d.takliflar);
export const kelganTakliflar = (kompaniyaId: number) => ol<{ takliflar: KelganTaklif[]; ochiq_profil?: boolean }>({ bolim: 'kelgan', kompaniya_id: String(kompaniyaId) })
  .then((d) => ({ takliflar: d.takliflar, ochiqProfil: d.ochiq_profil === true }));
export const taklifJavob = (kompaniyaId: number, taklifId: number, qabul: boolean, izoh?: string) => yoz({ amal: 'taklif_javob', kompaniya_id: kompaniyaId, taklif_id: taklifId, qabul, izoh: izoh ?? null });
export const mutaxassislarQidir = (kompaniyaId: number, kasb: string, matn: string) =>
  ol<{ mutaxassislar: MutaxassisKarta[] }>({ bolim: 'mutaxassislar', kompaniya_id: String(kompaniyaId), kasb, matn }).then((d) => d.mutaxassislar);
export const ochiqProfil = (kompaniyaId: number, ochiq: boolean) => yoz({ amal: 'ochiq_profil', kompaniya_id: kompaniyaId, ochiq });

/** «71,4 mlrd» kabi qisqa summa. */
export function qisqaSumma(n: number | null | undefined): string {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} mlrd`;
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} mln`;
  return n.toLocaleString('ru-RU');
}
