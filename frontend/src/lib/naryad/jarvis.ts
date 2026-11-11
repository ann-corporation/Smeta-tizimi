/**
 * Jarvis (Ctrl+K AI buyruq satri) uchun naryad o'qish vositasi — sof funksiya. Faqat o'qiydi (yozuv — «Naryad» sahifasida, tasdiq bilan).
 * Raqam, usta, summa to'qilmaydi: foydalanuvchi sessiyasida o'qilgan ro'yxatdan. Summa — QQS siz (usta narxi to'g'ri xarajat); narxsiz — «noma'lum».
 */
import { HOLAT_NOMI, NARYAD_HOLATLAR, holatSoni, type NaryadHolat, type NaryadQisqa } from './index';

const raqam = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 }));

/** arg: bo'sh — oxirgi naryadlar va holat soni; holat nomi (berildi/bajarildi/qabul/hisoblandi) yoki raqam («N-2026-0001») yoki usta nomi bo'yicha filtr. */
export function naryadMatni(list: readonly NaryadQisqa[] | undefined, arg: string | null, limit = 15): string {
  if (!list) return 'Naryadlar o‘qilmadi (ruxsat yoki tarmoq). «Naryad» sahifasini oching.';
  if (!list.length) return 'Bu obyekt bo‘yicha naryad yo‘q. Yangisi: «Naryad» sahifasi → «Yangi naryad».';
  const q = (arg ?? '').trim().toLowerCase();
  const holat = (NARYAD_HOLATLAR as readonly string[]).includes(q) ? (q as NaryadHolat) : null;
  const l = list.filter((n) => (holat ? n.holat === holat : !q || n.raqam.toLowerCase().includes(q) || n.usta_nom.toLowerCase().includes(q)));
  const s = holatSoni(list);
  const bosh = `Naryadlar: ${list.length} (berildi ${s.berildi}, bajarildi ${s.bajarildi}, qabul ${s.qabul}, hisoblandi ${s.hisoblandi}, bekor ${s.bekor}).`;
  if (!l.length) return `${bosh}\n«${arg}» bo‘yicha naryad topilmadi.`;
  return [bosh, ...l.slice(0, limit).map((n) => `- ${n.raqam} | ${n.usta_nom}${n.brigada ? ` (${n.brigada})` : ''} | ${HOLAT_NOMI[n.holat]} | ${n.qator_soni} ish | to‘lov ${raqam(n.xarajat_summa ?? n.reja_summa)} so‘m (QQS siz)${n.narxsiz_soni ? ` | ${n.narxsiz_soni} ta ishda narx kelishilmagan` : ''}${n.holat === 'qabul' && n.fakt_holat !== 'yozildi' ? ' | fakt yozilmagan' : ''}`),
    ...(l.length > limit ? [`… yana ${l.length - limit} ta`] : [])].join('\n');
}
