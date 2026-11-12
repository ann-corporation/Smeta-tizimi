/**
 * Yetkazuvchi «Transport so'rash»: buyurtmadan Yuk birjasi e'loni uchun oldindan to'ldirilgan havola (sof funksiya).
 * Yangi jadval/RPC yo'q — mavjud yuk e'loni (yb_yuk_saqla/elon) ishlatiladi; narx t·km formulasi YukTahrir da hisoblanadi.
 * Og'irlik faqat BARCHA qatorlar tonna bo'lsa yig'iladi (boshqa birlikni o'ylab topmaymiz).
 */
export type TransportSorovManba = {
  buyurtmaId: number;
  qatorlar: readonly { nom: string; birlik: string; miqdor: number }[];
  olishManzil?: string | null;
  yetkazishManzil?: string | null;
};

const TONNA = new Set(['tonna', 'tn', 't', 'тонна', 'т']);

export function transportSorovTonna(q: TransportSorovManba['qatorlar']): number | null {
  if (q.length === 0) return null;
  let s = 0;
  for (const x of q) {
    if (!TONNA.has(x.birlik.trim().toLowerCase()) || !Number.isFinite(x.miqdor) || x.miqdor <= 0) return null;
    s += x.miqdor;
  }
  return Math.round(s * 1000) / 1000;
}

export function transportSorovNomi(q: TransportSorovManba['qatorlar']): string {
  const nomlar = q.map((x) => x.nom.trim()).filter(Boolean);
  if (nomlar.length === 0) return 'Buyurtma yuki';
  const bosh = nomlar.slice(0, 2).join(', ');
  return (nomlar.length > 2 ? `${bosh} +${nomlar.length - 2}` : bosh).slice(0, 200);
}

export function transportSorovYoli(m: TransportSorovManba): string {
  const p = new URLSearchParams({ yangi: '1', nom: transportSorovNomi(m.qatorlar), izoh: `Buyurtma #${m.buyurtmaId}` });
  if (m.olishManzil?.trim()) p.set('a', m.olishManzil.trim().slice(0, 200));
  if (m.yetkazishManzil?.trim()) p.set('b', m.yetkazishManzil.trim().slice(0, 200));
  const tonna = transportSorovTonna(m.qatorlar);
  if (tonna != null) p.set('tonna', String(tonna));
  return `/admin/yuk-birjasi?${p.toString()}`;
}
