/**
 * Yetkazuvchi «Bugun» hisobi (sof funksiyalar): kelgan so'rovlar, takliflar natijasi, buyurtmalar navbati.
 * Raqamlar serverdan kelgan qatorlardan sanaladi; pul bu yerda hisoblanmaydi (yagona hisob yadrosi qoidasi).
 */
import type { TenderRoyxatQator } from '../../api/t2-tender';
import type { BuyurtmaRoyxatQator } from '../../api/t2-buyurtma';
import { IJROCHI_QADAM, buyurtmaYakunlandi } from './buyurtma-holat';

export type SorovHisobi = {
  /** Taklif berish kerak: e'lon qilingan, muddati o'tmagan, hali taklifim yo'q (eng yaqin muddat birinchi). */
  yangi: TenderRoyxatQator[];
  /** Taklif yuborilgan, xaridor qarori kutilmoqda. */
  kutilmoqda: TenderRoyxatQator[];
  yutdim: TenderRoyxatQator[];
  yutqazdim: TenderRoyxatQator[];
};

export function sorovHisobi(qatorlar: readonly TenderRoyxatQator[]): SorovHisobi {
  const yangi: TenderRoyxatQator[] = [], kutilmoqda: TenderRoyxatQator[] = [], yutdim: TenderRoyxatQator[] = [], yutqazdim: TenderRoyxatQator[] = [];
  const korildi = new Set<number>();
  for (const q of qatorlar) {
    if (korildi.has(q.id)) continue;       // «menga» va «ochiq» ro'yxatlari kesishsa ikki marta sanalmasin
    korildi.add(q.id);
    const m = q.mening_taklifim;
    if (!m) { if (q.effektiv_holat === 'elon') yangi.push(q); continue; }
    if (m.holat === 'golib') yutdim.push(q);
    else if (m.holat === 'yutqazdi') yutqazdim.push(q);
    else if (m.holat === 'berildi' || m.holat === 'faol') kutilmoqda.push(q);
  }
  const muddat = (x: TenderRoyxatQator) => (x.muddat ? Date.parse(x.muddat) : Number.POSITIVE_INFINITY);
  yangi.sort((a, b) => muddat(a) - muddat(b));
  return { yangi, kutilmoqda, yutdim, yutqazdim };
}

export type BuyurtmaHisobi = {
  /** Mening qadamim kerak: yuborildi (qabul), qabul qilindi (boshlash), bajarilmoqda (tayyor), tayyor (topshirish). */
  harakatKerak: BuyurtmaRoyxatQator[];
  /** Topshirdim: xaridor qabul qilishini kutyapman. */
  qabulKutilmoqda: BuyurtmaRoyxatQator[];
  /** Xaridor qabul qilgan (qisman ham): pul/hisob-faktura bosqichi. */
  qabulQilingan: BuyurtmaRoyxatQator[];
  nizo: BuyurtmaRoyxatQator[];
  yakunlangan: number;
};

export function buyurtmaHisobi(qatorlar: readonly BuyurtmaRoyxatQator[]): BuyurtmaHisobi {
  const r: BuyurtmaHisobi = { harakatKerak: [], qabulKutilmoqda: [], qabulQilingan: [], nizo: [], yakunlangan: 0 };
  for (const b of qatorlar) {
    if (IJROCHI_QADAM[b.holat]) r.harakatKerak.push(b);
    else if (b.holat === 'topshirildi') r.qabulKutilmoqda.push(b);
    else if (b.holat === 'qabul_qilindi_yakuniy' || b.holat === 'qisman') r.qabulQilingan.push(b);
    else if (b.holat === 'nizo') r.nizo.push(b);
    if (buyurtmaYakunlandi(b.holat)) r.yakunlangan += 1;
  }
  return r;
}
