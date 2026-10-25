/**
 * lrv-qayta-import.ts — tasdiqlashdan QAYTGAN LRV/Forma-2 faylini xavfsiz
 * qabul qilish qoidalari.
 *
 * ═══ NEGA BU KERAK ═══
 * Eksportga kanonik `t2_qator.id` yozish moslashtirishni aniq qiladi (kod
 * bo'yicha moslashtirib bo'lmaydi: `000001` bitta obyektda 852 marta
 * uchraydi). LEKIN egasining ogohlantirishi (2026-09-09):
 *
 *   «kanonik id yaxshi fikr, lekin tasdiqlatish jarayonida umuman boshqa
 *    ish turlari qo'shilishi yoki o'sha id bilan ko'chirilib boshqa obyom
 *    ham berib qolinishi mumkin — bu keyin katta xavf beradi.»
 *
 * Ya'ni ID ga KO'R-KO'RONA ishonib bo'lmaydi. Excelda qator nusxalansa,
 * ikkita qator bir xil IDni oladi; nom/kod qo'lda o'zgartirilsa, ID eski
 * qatorniki bo'lib qolaveradi. Ikkalasi ham jim o'tsa — pul boshqa qatorga
 * yozilib ketadi.
 *
 * ═══ HIMOYA ═══
 * Yashirin `КАЛИТ` katagi ikki qismdan iborat: `<id>:<barmoq izi>`.
 * Barmoq izi — qatorning O'ZLIGI (kod|nom|birlik) dan olingan qisqa xesh.
 * HAJM barmoq iziga KIRMAYDI — chunki tasdiqlashda hajm o'zgarishi
 * QONUNIY, o'zlik o'zgarishi esa emas.
 *
 *   ID bor + barmoq izi mos       → aniq moslik (hajm o'zgargan bo'lsa ham)
 *   ID ikki marta uchradi         → DUBLIKAT_ID  (bloklaydi — nusxalangan)
 *   Fayldagi katak ↔ kalit mos emas → OZLIK_OZGARDI (bloklaydi — qator tahrirlangan)
 *   Kanonik ↔ kalit mos emas       → SMETA_OZGARDI (bloklaydi — fayl eskirgan)
 *   ID bu obyektga tegishli emas  → BEGONA_ID    (bloklaydi)
 *   КАЛИТ yo'q                    → YANGI qator  (qo'shimcha ish — operator tasdiqlaydi)
 *   Kanonikda bor, faylda yo'q    → YO'QOLGAN    (BELGILANADI, o'chirilmaydi)
 *
 * Bu modul sof: fayl o'qish ham, yozish ham yo'q — faqat solishtirish.
 */

import { shifrKorinish } from './f2-resurs-guruh';

/** Qator o'zligini normallashtiradi — bo'shliq/registr farqi ahamiyatsiz. */
function normal(v: unknown): string {
  return String(v ?? '').trim().toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, ' ');
}

/** Qisqa, barqaror xesh (FNV-1a, base36). Kriptografik emas — maqsad
 *  tasodifiy/qo'lda o'zgarishni sezish, hujumga qarshi turish emas. */
export function lrvBarmoqIzi(kod: unknown, nom: unknown, birlik: unknown): string {
  /* «ЦЕНА» shifr emas (narx belgisi): hujjatda shifr katagi bo'sh chiqadi - iz ikkala holatda bir xil (egasi 2026-10-25). */
  return lrvIzHisobla(shifrKorinish(String(kod ?? '')), nom, birlik);
}
/** Eski (kodi xom) iz - «ЦЕНА» shifri bilan avval chiqarilgan fayllar qaytganda ham tanilsin. */
export function lrvBarmoqIziEski(kod: unknown, nom: unknown, birlik: unknown): string { return lrvIzHisobla(kod, nom, birlik); }
/** Fayldagi/kanonik qator izi kalitdagi izga mos (yangi yoki eski hisob bo'yicha). */
export function lrvIziMos(fp: string, kod: unknown, nom: unknown, birlik: unknown): boolean {
  return lrvBarmoqIzi(kod, nom, birlik) === fp || lrvBarmoqIziEski(kod, nom, birlik) === fp;
}
function lrvIzHisobla(kod: unknown, nom: unknown, birlik: unknown): string {
  const s =`${normal(kod)}|${normal(nom)}|${normal(birlik)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0').slice(-7);
}

/** Faylga yoziladigan yashirin kalit: `<id>:<barmoq izi>`. */
export function lrvKalitYoz(id: number, kod: unknown, nom: unknown, birlik: unknown): string {
  return `${id}:${lrvBarmoqIzi(kod, nom, birlik)}`;
}

export function lrvKalitOqi(kalit: unknown): { id: number; fp: string } | null {
  const s = String(kalit ?? '').trim();
  const m = /^(\d+):([0-9a-z]{7})$/.exec(s);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? { id, fp: m[2] } : null;
}

export type LrvFaylQator = {
  /** Excel qator raqami — xatoni operatorga ko'rsatish uchun. */
  satr: number;
  kalit: string | null;
  kod: string;
  nom: string;
  birlik: string;
  /** Tasdiqlashdan qaytgan hajm. */
  hajm: number | null;
  izoh?: string;
};

export type LrvKanonikQator = {
  id: number;
  kod: string;
  nom: string;
  birlik: string;
  hajm: number | null;
};

export type LrvXatoTuri = 'DUBLIKAT_ID' | 'BEGONA_ID' | 'OZLIK_OZGARDI' | 'SMETA_OZGARDI' | 'KALIT_BUZUQ';

export type LrvQaytaImportNatija = {
  /** Bloklaydigan xato yo'qmi. */
  ok: boolean;
  mos: Array<{
    id: number; satr: number;
    eskiHajm: number | null; yangiHajm: number | null;
    ozgardi: boolean; izoh?: string;
  }>;
  /** КАЛИТ siz qatorlar — qo'shimcha ish. Jim qabul qilinmaydi. */
  yangi: Array<{ satr: number; kod: string; nom: string; birlik: string; hajm: number | null; izoh?: string }>;
  /** Kanonikda bor, qaytgan faylda yo'q — O'CHIRILMAYDI, belgilanadi. */
  yoqolgan: Array<{ id: number; kod: string; nom: string }>;
  xatolar: Array<{ turi: LrvXatoTuri; satr?: number; id?: number; xabar: string }>;
};

const TENGLIK = 1e-9;

/**
 * Qaytgan fayl qatorlarini kanonik smeta bilan solishtiradi.
 * HECH NARSA YOZMAYDI — natijani operator ko'rib, keyin qo'llaydi.
 */
export function lrvQaytaImportTekshir(
  fayl: readonly LrvFaylQator[],
  kanonik: readonly LrvKanonikQator[],
): LrvQaytaImportNatija {
  const kanonikById = new Map(kanonik.map((q) => [q.id, q]));
  const natija: LrvQaytaImportNatija = { ok: true, mos: [], yangi: [], yoqolgan: [], xatolar: [] };

  const korilganId = new Map<number, number>(); // id -> birinchi satr
  const dublikatBelgilangan = new Set<number>();

  for (const q of fayl) {
    // 1) КАЛИТ yo'q -> yangi (qo'shimcha) ish
    if (q.kalit == null || String(q.kalit).trim() === '') {
      natija.yangi.push({ satr: q.satr, kod: q.kod, nom: q.nom, birlik: q.birlik, hajm: q.hajm, izoh: q.izoh });
      continue;
    }

    const kalit = lrvKalitOqi(q.kalit);
    if (!kalit) {
      natija.xatolar.push({
        turi: 'KALIT_BUZUQ', satr: q.satr,
        xabar: `${q.satr}-qator: yashirin КАЛИТ buzilgan («${String(q.kalit).slice(0, 24)}»). Qator qo'lda o'zgartirilgan bo'lishi mumkin.`,
      });
      continue;
    }

    // 2) Bir xil ID ikki marta -> qator NUSXALANGAN
    const oldingi = korilganId.get(kalit.id);
    if (oldingi != null) {
      if (!dublikatBelgilangan.has(kalit.id)) {
        natija.xatolar.push({
          turi: 'DUBLIKAT_ID', id: kalit.id, satr: q.satr,
          xabar: `ID ${kalit.id} ikki marta uchradi (${oldingi}- va ${q.satr}-qatorlar). Qator nusxalangan — qaysi hajm to'g'ri ekani noaniq, import to'xtatildi.`,
        });
        dublikatBelgilangan.add(kalit.id);
      }
      continue;
    }
    korilganId.set(kalit.id, q.satr);

    // 3) ID bu obyektga tegishlimi
    const k = kanonikById.get(kalit.id);
    if (!k) {
      natija.xatolar.push({
        turi: 'BEGONA_ID', id: kalit.id, satr: q.satr,
        xabar: `${q.satr}-qator: ID ${kalit.id} bu smetada yo'q. Fayl boshqa obyekt yoki eski versiyadan bo'lishi mumkin.`,
      });
      continue;
    }

    /* 4) O'zlik o'zgarganmi (kod/nom/birlik). Hajm o'zgarishi QONUNIY.
       IKKI TOMONLAMA tekshiriladi:
         a) FAYLDAGI ko'rinadigan katak ↔ yashirin kalit — kimdir nom/kod/
            birlikni qo'lda tahrirlab, yashirin kalitni tegmagan bo'lsa
            (aynan «o'sha id bilan ko'chirib boshqa narsa berish» xavfi);
         b) KANONIK qator ↔ yashirin kalit — eksportdan keyin smeta
            o'zgargan bo'lsa, fayl eskirgan.
       Faqat kanonikni tekshirish YETARLI EMAS edi: fayldagi katak
       o'zgartirilsa ham izlar mos kelaverardi. */
    if (!lrvIziMos(kalit.fp, q.kod, q.nom, q.birlik)) {
      natija.xatolar.push({
        turi: 'OZLIK_OZGARDI', id: kalit.id, satr: q.satr,
        xabar: `${q.satr}-qator: ID ${kalit.id} — fayldagi kod/nom/birlik tahrirlangan, yashirin kalit esa eski («${k.nom}» ≠ «${q.nom}»). Pul boshqa qatorga yozilib ketmasligi uchun import to'xtatildi.`,
      });
      continue;
    }
    if (!lrvIziMos(kalit.fp, k.kod, k.nom, k.birlik)) {
      natija.xatolar.push({
        turi: 'SMETA_OZGARDI', id: kalit.id, satr: q.satr,
        xabar: `${q.satr}-qator: ID ${kalit.id} — eksportdan keyin smetadagi qator o'zgargan («${k.nom}»). Fayl eskirgan, qaytadan eksport qiling.`,
      });
      continue;
    }

    const ozgardi = Math.abs((q.hajm ?? 0) - (k.hajm ?? 0)) > TENGLIK;
    natija.mos.push({
      id: kalit.id, satr: q.satr,
      eskiHajm: k.hajm, yangiHajm: q.hajm, ozgardi, izoh: q.izoh,
    });
  }

  // 5) Kanonikda bor, faylda yo'q -> belgilanadi, O'CHIRILMAYDI
  const faylIdlari = new Set(natija.mos.map((m) => m.id));
  for (const k of kanonik) {
    if (!faylIdlari.has(k.id) && !korilganId.has(k.id)) {
      natija.yoqolgan.push({ id: k.id, kod: k.kod, nom: k.nom });
    }
  }

  natija.ok = natija.xatolar.length === 0;
  return natija;
}

/** Operatorga ko'rsatiladigan qisqa xulosa. */
export function lrvQaytaImportXulosa(n: LrvQaytaImportNatija): string {
  const ozgargan = n.mos.filter((m) => m.ozgardi).length;
  const qismlar = [
    `${n.mos.length} qator moslashdi`,
    `${ozgargan} tasida hajm o'zgargan`,
    `${n.yangi.length} yangi (qo'shimcha) qator`,
    `${n.yoqolgan.length} qator faylda yo'q`,
  ];
  if (n.xatolar.length) qismlar.push(`${n.xatolar.length} BLOKLAYDIGAN xato`);
  return qismlar.join(' · ');
}
