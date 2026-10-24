/**
 * F2 importda foydalanuvchi QO'SHGAN smeta qatorlari (qo'shimcha ish/resurs, zamena) — egasi 2026-10-18:
 * "smetadan olingan ma'lumotlar o'zgarmas, undan tashqarisi to'liq boshqariluvchan bo'lishi kerak —
 * tahrirlash, joyini o'zgartirish, o'chirish, almashtirish".
 *
 * Server qonuni (`t2_ish_abc_ochir_v1` / `t2_ish_abc_tahrir_v1`): faqat `qoshimcha=true` qatorlar o'zgaradi;
 * asl smeta qatori, F2 aktiga kirgan, АОСР/laboratoriya/narx dalili bog'langan qator — rad etiladi; o'chirilgan
 * qator arxivda qoladi. Bu fayl — UI uchun sof mantiq: qator turini aniqlash va o'zgarishdan keyin F2
 * bog'lanishlarini to'g'rilash (o'chirilganga bog'langan F2 qatori ✕ ga qaytadi, tahrirlanganga — yangisiga).
 */
import { bogIdlari, bogla, ishniBogla, type Bog, type F2Indeks, type IshJoyi, type SmetaIndeks } from './ishJoyi';

/** asl — smetadan (o'zgarmas) · qoshimcha / zamena — foydalanuvchi qo'shgan (boshqariladi) ·
 *  almashtirilgan — asl qator, o'rniga zamena kiritilgan (o'zi o'zgarmaydi). */
export type SmetaQatorTuri = 'asl' | 'qoshimcha' | 'zamena' | 'almashtirilgan';

export interface QoshilganBelgi { id: number; qoshimcha?: boolean | null; zamena?: boolean | null }

export function smetaQatorTuri(r: QoshilganBelgi, almashtirilgan: ReadonlySet<number>): SmetaQatorTuri {
  if (r.qoshimcha) return r.zamena ? 'zamena' : 'qoshimcha';
  return almashtirilgan.has(r.id) ? 'almashtirilgan' : 'asl';
}

/** Foydalanuvchi qo'shgan (tahrirlash/o'chirish mumkin) qatormi. Asl smeta qatori — yo'q. */
export const qoshilganmi = (r: QoshilganBelgi | undefined | null): boolean => !!r?.qoshimcha;

export interface BogTuzatish { ij: IshJoyi; qaytaBoglandi: number; uzildi: number }

/**
 * Qo'shilgan qator o'chirildi yoki tahrirlandi (server eskisini arxivlab yangisini yaratadi — id o'zgaradi).
 *  - `eskiIdlar` — o'zgargan qator va uning bolalari (eski id lar);
 *  - `yangiId` — tahrirdan keyingi yangi qator (o'chirishda yo'q);
 *  - `mavjud` — yangilangan smetadagi barcha id lar; `S` — yangilangan smeta indeksi.
 * Eskisiga bog'langan F2 ishi yangisiga RESURSLARI BILAN qayta bog'lanadi; resurs — to'g'ridan-to'g'ri;
 * smetada endi yo'q qatorga bog'lanish olib tashlanadi (F2 qatori ✕ — operator qayta bog'laydi).
 * Boshqa qatorlarning qarorlari va o'tkazilganlar o'zgarmaydi.
 */
export function qoshilganOzgardi(
  ij: IshJoyi, ind: F2Indeks,
  o: { eskiIdlar: ReadonlySet<number>; yangiId?: number | null; mavjud: ReadonlySet<number>; S: SmetaIndeks },
): BogTuzatish {
  let joriy = ij;
  let qaytaBoglandi = 0;
  if (o.yangiId != null && o.mavjud.has(o.yangiId)) {
    const yangi = o.S.byId.get(o.yangiId);
    for (const [uid, b] of ij.bog) {
      if (!o.eskiIdlar.has(b.qatorId) || b.taqsim) continue; // taqsim avtomatik qayta bog'lanmaydi — operator qayta taqsimlaydi
      const f = ind.byUid.get(uid);
      if (!f) continue;
      const ota = ind.ota.get(uid);
      // Ish yangi ishga — resurslari bilan; resurs (resurs zamenasi) — yangi resursga.
      // Ishning resurslari ishniBogla ichida bog'lanadi — ularni alohida qayta bog'lamaymiz.
      if (ota && ota.tur === 'bl' && o.eskiIdlar.has(ij.bog.get(ota.uid)?.qatorId ?? -1)) continue;
      if (f.tur === 'bl' && yangi?.tur === 'bl') joriy = ishniBogla(joriy, f, o.yangiId, o.S).ij;
      else joriy = bogla(joriy, uid, o.yangiId);
      qaytaBoglandi++;
    }
  }
  // Editing a work must not overwrite a child's independent manual decision.
  // Taqsimlangan bog'lanish: bo'laklaridan biri o'chirilgan/o'zgargan bo'lsa — butunlay uziladi (pul bir qismi yo'qolmasin).
  const tirik = (b: Bog) => bogIdlari(b).every((id) => o.mavjud.has(id) && (b.taqsim ? !o.eskiIdlar.has(id) : true));
  const bog = new Map([...joriy.bog].filter(([, b]) => tirik(b)));
  for (const [uid, b] of ij.bog) {
    if (!o.eskiIdlar.has(b.qatorId) && tirik(b)) bog.set(uid, b);
  }
  return { ij: { bog, otkaz: new Set(joriy.otkaz) }, qaytaBoglandi, uzildi: joriy.bog.size - bog.size };
}
