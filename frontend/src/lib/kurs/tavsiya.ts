/**
 * KURS TAVSIYASI (usage-learning tsikli bilan chok): tizim foydalanuvchilar qayerda qiyinalayotganini «ishqalanish kalitlari» bilan
 * xabar qiladi; shu kalitlarga bog‘langan darslar yo‘lda oldinga suriladi. Hech qanday boshqa PR ga bog‘liq emas — faqat shu tikuv.
 *
 * @param ishqalanish kalit -> og‘irlik (masalan hodisalar soni) yoki kalitlar ro‘yxati (har biri 1)
 * @param yol       foydalanuvchi yo‘li (kursYoli().darslar)
 * @param bajarilgan allaqachon o‘tilgan darslar (ular oxirga suriladi)
 */
import type { Dars } from './model';

export type Ishqalanish = Readonly<Record<string, number>> | readonly string[];

const ogirlik = (i: Ishqalanish): Map<string, number> => {
  const m = new Map<string, number>();
  if (Array.isArray(i)) for (const k of i as readonly string[]) m.set(k, (m.get(k) ?? 0) + 1);
  else for (const [k, v] of Object.entries(i as Record<string, number>)) if (v > 0) m.set(k, v);
  return m;
};

export function kursTavsiya(ishqalanish: Ishqalanish, yol: readonly Dars[], bajarilgan: ReadonlySet<string> = new Set()): Dars[] {
  const og = ogirlik(ishqalanish);
  const ball = (d: Dars) => (d.ishqalanish ?? []).reduce((s, k) => s + (og.get(k) ?? 0), 0);
  const id = new Map(yol.map((d) => [d.id, d]));
  const qolgan = yol.filter((d) => !bajarilgan.has(d.id));
  // 1) ishqalanishli darslar (og‘irlik kamayish tartibida, teng bo‘lsa asl tartib), 2) qolganlari asl tartibda.
  const asl = new Map(yol.map((d, i) => [d.id, i]));
  const qiyin = qolgan.filter((d) => ball(d) > 0).sort((a, b) => ball(b) - ball(a) || (asl.get(a.id)! - asl.get(b.id)!));
  const boshqa = qolgan.filter((d) => ball(d) === 0);
  const out: Dars[] = [];
  const bor = new Set<string>();
  const qosh = (d: Dars) => {
    if (bor.has(d.id)) return;
    bor.add(d.id);
    // Oldingi (bajarilmagan) darslar avval — talaba ildizsiz darsga tushib qolmasin.
    for (const o of d.oldin) { const x = id.get(o); if (x && !bajarilgan.has(o)) qosh(x); }
    out.push(d);
  };
  [...qiyin, ...boshqa].forEach(qosh);
  return [...out, ...yol.filter((d) => bajarilgan.has(d.id))];
}
