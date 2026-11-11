/**
 * Forma 3 eksportidan OLDINGI avtomatik tayyorgarlik (tarmoq): keyingi hujjat raqami, Заказчик rekvizitini kontragentdan
 * to'ldirish va «nima yetishmayapti» ro'yxati. Hech narsa yozilmaydi (raqam faqat taklif; shartnoma rejimida yaratishda
 * `t2_forma3.raqam` ga yoziladi).
 */
import { sbKontragentlarOl } from '../../api/t2-kontragent';
import { sbT2LoyihalarOl } from '../../api/t2-loyiha';
import { forma3RoyxatOl } from '../../api/t2-document-control';
import { f3KeyingiRaqam, f3Yetishmaydi, zakazchikKontragentdan } from '../forma3-rekvizit';
import type { Forma3Rekvizit } from '../forma3-export';
import type { ImzoNomlar } from '../hujjat-yozuvchi';

export async function keyingiForma3Raqam(kompaniyaId: number, yil: number): Promise<string | null> {
  try {
    const lr = await sbT2LoyihalarOl(kompaniyaId);
    if (!lr.ok) return null;
    const hammasi: Array<{ raqam?: string | null; davr_boshi?: string | null; holat?: string | null }> = [];
    for (const l of lr.qatorlar ?? []) {
      const r = await forma3RoyxatOl({ loyihaId: l.id }) as { ok?: boolean; forma3lar?: typeof hammasi };
      if (!r?.ok || !Array.isArray(r.forma3lar)) return null; // o'qilmadi — raqam taxmin qilinmaydi
      hammasi.push(...r.forma3lar);
    }
    return f3KeyingiRaqam(hammasi, yil);
  } catch { return null; }
}

export async function forma3Tayyorgarlik(p: { kompaniyaId: number; yil: number; pudratchi: Forma3Rekvizit | null; zakazchik: Forma3Rekvizit | null; imzo?: ImzoNomlar; raqam?: string | null }): Promise<{ raqam: string | null; zakazchik: Forma3Rekvizit | null; yetishmaydi: string[] }> {
  const [raqam, kg] = await Promise.all([p.raqam ? Promise.resolve(p.raqam) : keyingiForma3Raqam(p.kompaniyaId, p.yil), sbKontragentlarOl(p.kompaniyaId).catch(() => null)]);
  const zakazchik = kg && kg.ok ? zakazchikKontragentdan(p.zakazchik, kg.qatorlar ?? []) : p.zakazchik;
  return { raqam, zakazchik, yetishmaydi: f3Yetishmaydi({ raqam, pudratchi: p.pudratchi, zakazchik, imzo: p.imzo }) };
}
