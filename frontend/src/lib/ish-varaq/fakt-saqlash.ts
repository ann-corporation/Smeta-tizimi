/**
 * Ctrl+S — YAGONA saqlash (BITTA tranzaksiya: `sbFaktYoz` → `fakt_yoz_v2`) — Fakt jurnali va Ish varag'i uchun umumiy hook.
 * FaktJurnal'dan CHIQARILGAN (xulq o'zgarmagan): takror bosish bitta jarayonga birlashadi, bir xil operation_id (idempotent),
 * muvaffaqiyatda yangi operation_id, birlik-gumon tasdig'i, CAS ziddiyati, xatoda qoralama darhol yoziladi.
 */
import { useCallback, useRef, useState } from 'react';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { yangiOperationId } from '../../api/supabase';
import { jamiIdlari } from '../fakt-foiz-grid';
import type { Kiritma } from '../fakt-jurnal';
import { qiymatBirlikOgohi } from '../fakt-birlik-ogoh';
import { chunkXatosimi, yangiVersiyaChiqdimi, yangiVersiyaniTekshir, yangiVersiyaQoralamaMatni } from '../../_shared/versiya';
import { faktPaketniYoz } from './faktni-saqla';
import type { FaktPaketi } from './paket';

export type SaqlashNatija = Promise<boolean>;
export type SaqlashFn = () => SaqlashNatija;

export type SaqlashQator = { nom: string; smeta: number | null; fakt: number; birlik: string | null };

export function useFaktSaqlash(o: {
  obyektId: number; sana: string;
  kiritmalar: Readonly<Record<number, Kiritma>>; paket: FaktPaketi;
  faktlar: ReadonlyMap<number, number>; smetalar: ReadonlyMap<number, number | null>;
  /** Qator ma'lumoti (birlik ogohi va ziddiyat nomlari uchun). */
  qatorOl: (id: number) => SaqlashQator | undefined;
  ozgarishSoni: number;
  holatniYangila: (qatorIdlar?: readonly number[]) => Promise<void> | void;
  /** Muvaffaqiyatli saqlangach: kiritmalar/tarix tozalanadi va «saqlandi» belgisi qo'yiladi. */
  tozala: () => void;
  onSaqlandi: (idlar: Set<number>) => void;
  qoralamaYozDarhol: () => void; qoralamaTozala: () => void;
  izoh: string;
  fokusgaOt: (id: number | undefined) => void;
}) {
  const { obyektId, sana, kiritmalar, paket, faktlar, smetalar, qatorOl, ozgarishSoni, holatniYangila, tozala, onSaqlandi, qoralamaYozDarhol, qoralamaTozala, izoh, fokusgaOt } = o;
  const [band, setBand] = useState(false);
  const operationId = useRef(yangiOperationId());
  const ishda = useRef<SaqlashNatija | null>(null);
  /**
   * Saqlash muvaffaqiyatsiz: avval qoralama darhol yoziladi. So'rov serverga yetmagan bo'lsa (tarmoq/eski chunk) va
   * yangi versiya chiqqani aniqlansa — umumiy «internet uzildi» o'rniga aniq xabar (hodisa 2026-11-09). Avto-reload YO'Q.
   */
  const saqlashXatosi = async (matn: string, yetmadi: boolean, e?: unknown) => {
    qoralamaYozDarhol();
    if (chunkXatosimi(e) || (yetmadi && (yangiVersiyaChiqdimi() || await yangiVersiyaniTekshir()))) { toast(yangiVersiyaQoralamaMatni(), 'warn', undefined, 15000); return; }
    toast(yetmadi ? `${matn} ${t('O‘zgarishlaringiz brauzerda saqlab qo‘yildi.')}` : matn, 'danger');
  };
  const saqlaIchki = async (): SaqlashNatija => {
    if (!paket.ok || band) return false;
    // Birlik xatosi gumoni («100М3» ga 300): faqat ogohlantirish — foydalanuvchi baribir saqlashi mumkin.
    const ogohSoni = paket.qatorlar.filter((x) => { const q = qatorOl(x.qator_id); const k = kiritmalar[x.qator_id]; return !!q && !!k && qiymatBirlikOgohi(k.qiymat, k.rejim, q.smeta, q.fakt, q.birlik) != null; }).length;
    if (ogohSoni > 0 && !await tasdiqSora({ matn: t('{n} qatorda fakt smetadan ancha oshgan — baribir saqlansinmi?', { n: ogohSoni }), xavfli: true })) return false;
    setBand(true);
    try {
      // CAS: «jami» (=) kiritmalari brauzerdagi faktga nisbatan delta — server fakti o'zgargan bo'lsa yozilmaydi.
      // Tuzatish deltalari ham joriy faktga nisbatan — ular ham CAS bilan tekshiriladi.
      const jamiIdlar = [...new Set([...jamiIdlari(kiritmalar, smetalar), ...paket.tuzatishlar])];
      const r = await faktPaketniYoz({ obyektId, sana, operationId: operationId.current, qatorlar: paket.qatorlar, jamiIdlar, faktlar, izoh });
      if (!r.ok) {
        if (r.sabab === 'HOLAT') { toast(t('Joriy faktni tekshirib bo‘lmadi — saqlanmadi. Qayta urinib ko‘ring.'), 'danger'); return false; }
        if (r.sabab === 'CAS') {
          const z = r.ziddiyat;
          const nomlar = z.slice(0, 3).map((x) => qatorOl(x.id)?.nom ?? `#${x.id}`).join(', ');
          toast(t('{n} ta qator fakti boshqa joyda o‘zgargan ({nomlar}) — hech narsa saqlanmadi. Jadval yangilandi; «jami» qiymatlarini tekshirib qayta saqlang.', { n: z.length, nomlar }), 'danger', undefined, 9000);
          void Promise.resolve(holatniYangila(z.map((x) => x.id))).catch(() => undefined);
          return false;
        }
        await saqlashXatosi(r.matn, r.tarmoq); return false;
      }
      const ids = r.idlar;
      onSaqlandi(ids);
      tozala(); operationId.current = yangiOperationId();
      qoralamaTozala();
      toast(`${ids.size} ta qator saqlandi — F2 qoldig‘i yangilandi.`, 'ok');
      // Saqlash tugadi — tugma darhol bo'shaydi; holat fonda yangilanadi (sekin o'qish tugmani qotirmasin).
      setBand(false);
      void Promise.resolve(holatniYangila([...ids])).catch(() => toast('Saqlandi, lekin jadvalni yangilab bo‘lmadi — sahifani yangilang.', 'warn'));
      return true;
    } catch (e) { await saqlashXatosi('Javob olinmadi. Qayta saqlang — takror xavfsiz (bir xil amal ID).', true, e); }
    finally { setBand(false); }
    return false;
  };
  const saqla = useCallback((): SaqlashNatija => {
    if (ishda.current) return ishda.current;
    const p = saqlaIchki().finally(() => { ishda.current = null; });
    ishda.current = p; return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paket, band, obyektId, sana, holatniYangila]);
  /** Ctrl+Enter / Ctrl+S: mavjud saqlash yo'li; to'silsa — sababi ko'rsatiladi (xatoli birinchi qatorga o'tadi). */
  const saqlaKlav = () => {
    if (band) return;
    if (!ozgarishSoni) { toast(t('Saqlanadigan o‘zgarish yo‘q.'), 'warn'); return; }
    if (paket.xatolar.size) { toast(t('{n} tasida xato — tuzating', { n: String(paket.xatolar.size) }), 'warn'); fokusgaOt([...paket.xatolar.keys()][0]); return; }
    if (!paket.ok) { toast(t('Saqlanadigan o‘zgarish yo‘q.'), 'warn'); return; }
    void saqla();
  };
  return { band, saqla, saqlaKlav, ishda };
}
