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

/** O'qish (60 s) + yozish (90 s, +qayta urinish) + zaxira: shundan keyin saqlash «qotdi» deb to'xtatiladi (qayta urinish mumkin). */
export const SAQLASH_QOROVUL_MS = 240_000;

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
  /** `imzo` — shu operation_id bilan BIRINCHI yuborilgan paket (bir xil id + boshqa paket = server «takror» deb jim qaytarishi mumkin). */
  const op = useRef<{ id: string; imzo: string | null }>({ id: yangiOperationId(), imzo: null });
  const ishda = useRef<SaqlashNatija | null>(null);
  /** Har renderda eng yangi `saqlaIchki` — `saqla` eskirgan closure (faktlar/izoh/kiritmalar) bilan ishlamasin. */
  const oxirgi = useRef<() => SaqlashNatija>(() => Promise.resolve(false));
  /**
   * Saqlash muvaffaqiyatsiz: avval qoralama darhol yoziladi. Xabar SABABNI aytadi (oflayn / server ko'rinmaydi / so'rov chiqmadi /
   * sessiya tugagan / server xatosi / vaqt chegarasi / yangi versiya) — har holatda «internet uzildi» emas (hodisa 2026-11-09). Avto-reload YO'Q.
   */
  const saqlashXatosi = async (matn: string, kod?: string, e?: unknown) => {
    qoralamaYozDarhol();
    const yetmadi = kod === 'NETWORK' || kod === 'SEND_FAILED';
    if (chunkXatosimi(e) || (yetmadi && (yangiVersiyaChiqdimi() || await yangiVersiyaniTekshir()))) { toast(yangiVersiyaQoralamaMatni(), 'warn', undefined, 15000); return; }
    const saqlandi = yetmadi || kod === 'OFFLINE' || kod === 'SESSION_EXPIRED' || kod === 'TIMEOUT' || kod === 'SERVER' || kod === 'SERIALIZE' || kod === 'CLIENT';
    toast(saqlandi ? `${matn} ${t('O‘zgarishlaringiz brauzerda saqlab qo‘yildi.')}` : matn, 'danger', undefined, saqlandi ? 12000 : undefined);
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
      const imzo = JSON.stringify([obyektId, sana, paket.qatorlar, izoh]);
      op.current.imzo ??= imzo;
      // Qo'riqchi: so'rov/javob hech qachon tugamasa tugma va `ishda` abadiy qotib qolmasin (hodisa 2026-11-09).
      let qorovul: ReturnType<typeof setTimeout> | undefined;
      const r = await Promise.race([
        faktPaketniYoz({ obyektId, sana, operationId: op.current.id, qatorlar: paket.qatorlar, jamiIdlar, faktlar, izoh }),
        new Promise<never>((_, yoq) => { qorovul = setTimeout(() => yoq(new DOMException('qotdi', 'AbortError')), SAQLASH_QOROVUL_MS); }),
      ]).finally(() => clearTimeout(qorovul));
      if (!r.ok) {
        if (r.sabab === 'HOLAT') {
          const tarmoq = r.kod === 'NETWORK' || r.kod === 'TIMEOUT' || r.kod === 'SESSION_EXPIRED';
          const sabab = r.kod === 'SESSION_EXPIRED' ? t('kirish muddati tugagan — yangi varaqda qayta kiring')
            : r.kod === 'TIMEOUT' ? t('server 60 soniyada javob bermadi') : r.kod === 'NETWORK' ? t('server bilan aloqa bo‘lmadi') : (r.matn || t('server rad etdi'));
          await saqlashXatosi(`${t('Joriy faktni tekshirib bo‘lmadi — saqlanmadi')} (${sabab}). ${t('Qayta urinib ko‘ring.')}`, tarmoq ? r.kod : undefined);
          return false;
        }
        if (r.sabab === 'CAS') {
          const z = r.ziddiyat;
          const nomlar = z.slice(0, 3).map((x) => qatorOl(x.id)?.nom ?? `#${x.id}`).join(', ');
          toast(t('{n} ta qator fakti boshqa joyda o‘zgargan ({nomlar}) — hech narsa saqlanmadi. Jadval yangilandi; «jami» qiymatlarini tekshirib qayta saqlang.', { n: z.length, nomlar }), 'danger', undefined, 9000);
          void Promise.resolve(holatniYangila(z.map((x) => x.id))).catch(() => undefined);
          return false;
        }
        await saqlashXatosi(r.matn, r.kod); return false;
      }
      const ids = r.idlar;
      if (r.takror && op.current.imzo !== imzo) {
        // Bir xil operation_id bilan BOSHQA paket: server avvalgi (javobi yo'qolgan) amalni takror deb qaytardi — yangi kiritmalar YOZILMADI.
        // Hech narsa tozalanmaydi; yangi operation_id; jadval serverdan yangilanadi.
        op.current = { id: yangiOperationId(), imzo: null };
        qoralamaYozDarhol();
        toast(t('Oldingi urinish serverda allaqachon bajarilgan edi — yangi kiritmalaringiz saqlanmadi. Jadval yangilandi: «jami» va farqlarni tekshirib qayta saqlang.'), 'warn', undefined, 12000);
        void Promise.resolve(holatniYangila([...ids])).catch(() => undefined);
        return false;
      }
      onSaqlandi(ids);
      tozala(); op.current = { id: yangiOperationId(), imzo: null };
      qoralamaTozala();
      toast(`${ids.size} ta qator saqlandi — F2 qoldig‘i yangilandi.`, 'ok');
      // Saqlash tugadi — tugma darhol bo'shaydi; holat fonda yangilanadi (sekin o'qish tugmani qotirmasin).
      setBand(false);
      void Promise.resolve(holatniYangila([...ids])).catch(() => toast('Saqlandi, lekin jadvalni yangilab bo‘lmadi — sahifani yangilang.', 'warn'));
      return true;
    } catch (e) {
      // Istisno — faqat HAQIQIY tarmoq (TypeError) «tarmoq» deyiladi; qolgani (dastur xatosi, qotib qolish) o'z nomi bilan.
      const qotdi = e instanceof DOMException && e.name === 'AbortError';
      const tarmoq = !qotdi && e instanceof TypeError;
      await saqlashXatosi(qotdi ? t('Server javob bermadi — saqlash tugamadi. Qayta saqlash xavfsiz (bir xil amal ID).')
        : tarmoq ? t('Saqlash so‘rovi serverga yetmadi. Qayta saqlang — takror xavfsiz (bir xil amal ID).')
        : `${t('Kutilmagan dastur xatosi')}: ${e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 120) : String(e).slice(0, 120)}. ${t('Qayta saqlang — takror xavfsiz (bir xil amal ID).')}`,
      qotdi ? 'TIMEOUT' : tarmoq ? 'NETWORK' : 'CLIENT', e);
    }
    finally { setBand(false); }
    return false;
  };
  oxirgi.current = saqlaIchki;
  const saqla = useCallback((): SaqlashNatija => {
    if (ishda.current) return ishda.current;
    const p = oxirgi.current().finally(() => { if (ishda.current === p) ishda.current = null; });
    ishda.current = p; return p;
  }, []);
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
