/**
 * Forma 3 uchun SOF yordamchilar: (1) bo'sh rekvizitni kontragent ro'yxatidan to'ldirish, (2) eksportdan OLDIN
 * «nima hali yetishmayapti» ro'yxati, (3) hujjat raqami — kompaniya bo'yicha kalendar yil ketma-ketligi (invoys uslubi).
 * Bilmagan narsa to'qilmaydi: aniq topilmasa bo'sh qoladi va ro'yxatda ko'rsatiladi.
 */
import type { Forma3Rekvizit } from './forma3-export';
import type { ImzoNomlar } from './hujjat-yozuvchi';

export type KontragentRek = { nom: string; inn: string | null; manzil: string | null; mfo: string | null; hisob_raqam: string | null; rahbar: string | null; mavqe: string | null };

const bos = (x: string | null | undefined) => !String(x ?? '').trim();
const inn = (x: string | null | undefined) => String(x ?? '').replace(/\D+/g, '');

/**
 * ЗАКАZЧИК rekviziti to'liq bo'lmasa — kontragentlar ro'yxatidan to'ldiriladi. Mos kontragent: INN bir xil; INN yo'q va
 * rekvizit butunlay bo'sh bo'lsa — AYNAN BITTA «buyurtmachi» kontragent. Mavjud (bo'sh bo'lmagan) qiymat hech qachon bosilmaydi.
 */
export function zakazchikKontragentdan(rek: Forma3Rekvizit | null | undefined, kontragentlar: readonly KontragentRek[]): Forma3Rekvizit | null {
  const r: Forma3Rekvizit = { ...(rek ?? {}) };
  const butunlayBosh = bos(r.toliqNom) && bos(r.inn) && bos(r.hisobRaqam);
  let k: KontragentRek | undefined;
  if (!bos(r.inn)) k = kontragentlar.find((x) => inn(x.inn) && inn(x.inn) === inn(r.inn));
  else if (butunlayBosh) { const b = kontragentlar.filter((x) => x.mavqe === 'buyurtmachi'); if (b.length === 1) k = b[0]; }
  if (!k) return rek ?? null;
  const to = (a: string | null | undefined, b: string | null | undefined) => (bos(a) ? (bos(b) ? a ?? null : b) : a);
  return {
    ...r,
    toliqNom: to(r.toliqNom, k.nom), manzil: to(r.manzil, k.manzil), hisobRaqam: to(r.hisobRaqam, k.hisob_raqam),
    mfo: to(r.mfo, k.mfo), inn: to(r.inn, k.inn), rahbar: to(r.rahbar, k.rahbar),
  };
}

/** Eksportdan oldin: qaysi ma'lumot hali yo'q (foydalanuvchiga ko'rsatiladi; chiziq faqat chindan noma'lum bo'lsa qoladi). */
export function f3Yetishmaydi(p: { raqam?: string | null; pudratchi?: Forma3Rekvizit | null; zakazchik?: Forma3Rekvizit | null; imzo?: ImzoNomlar }): string[] {
  const m: string[] = [];
  if (bos(p.raqam)) m.push('Номер документа');
  const rek = (nom: string, r: Forma3Rekvizit | null | undefined) => {
    if (bos(r?.toliqNom)) m.push(`${nom}: название`);
    if (bos(r?.inn)) m.push(`${nom}: ИНН`);
    if (bos(r?.hisobRaqam)) m.push(`${nom}: расчётный счёт`);
    if (bos(r?.bank)) m.push(`${nom}: банк`);
    if (bos(r?.mfo)) m.push(`${nom}: МФО`);
    if (bos(r?.manzil)) m.push(`${nom}: адрес`);
    if (bos(r?.rahbar)) m.push(`${nom}: руководитель (Ф.И.О.)`);
    if (bos(r?.boshHisobchi)) m.push(`${nom}: главный бухгалтер (Ф.И.О.)`);
  };
  rek('Подрядчик', p.pudratchi);
  rek('Заказчик', p.zakazchik);
  if (bos(p.imzo?.texnadzor)) m.push('Технадзор (Ф.И.О.)');
  return m;
}

/**
 * Keyingi Forma 3 raqami: shu kalendar yilda (davr_boshi yili) kompaniyaning mavjud (bekor qilinmagan) Forma 3 lari
 * raqamlaridagi eng katta butun son + 1. Raqamsiz/raqam bo'lmagan yozuvlar e'tiborga olinmaydi.
 */
export function f3KeyingiRaqam(royxat: ReadonlyArray<{ raqam?: string | null; davr_boshi?: string | null; holat?: string | null }>, yil: number): string {
  let eng = 0;
  for (const f of royxat) {
    if (f.holat === 'bekor') continue;
    if (String(f.davr_boshi ?? '').slice(0, 4) !== String(yil)) continue;
    const m = /(\d+)\s*$/.exec(String(f.raqam ?? '').trim());
    if (m) eng = Math.max(eng, Number(m[1]));
  }
  return String(eng + 1);
}
