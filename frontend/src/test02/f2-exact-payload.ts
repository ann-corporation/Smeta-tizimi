/**
 * f2-exact-payload.ts — T2-LRV-CLOSURE-006 Section 3 (DB-independent).
 * ═══════════════════════════════════════════════════════════════════
 *
 * (tarixan) `TestF2Import.tsx`ning `yozish()` funksiyasi ichida yashiringan
 * aggregatsiya/ambiguity mantig'i shu yerga PURE funksiya sifatida
 * chiqarildi — bazasiz (DB-independent) haqiqiy vitest bilan tekshirish
 * uchun (`f2-exact-payload.test.ts`). Mantiq BAYT-BAYTIGA bir xil
 * saqlangan, faqat komponent tanasidan ajratilgan.
 *
 * F2 EXACT SOURCE LAW (T2-LRV-EXACT-F2-INTEGRATION-003): F2 faylning
 * o'z SUMMA ustuni (`n.summa`) — YAGONA haqiqiy manba. `certified_amount`
 * HECH QACHON `hajm * narx` dan hosil qilinmaydi. Narxi bor-yu fayldan
 * summasi yo'q qator — NOANIQ (`NEEDS_REVIEW`), yozish TO'XTATILADI —
 * soxta summa to'qilmaydi.
 */

export type F2ExactManbaTugun = {
  uid: string;
  hajm: number;
  /** null/undefined/<=0 — narx yo'q (price_intentionally_absent bo'lishi mumkin) */
  narx: number | null | undefined;
  /** F2 faylning o'z SUMMA ustunidan (hajm*narx dan EMAS) */
  summa: number | null | undefined;
  /** T2-F2-IMPORT-TUR-CASCADE-001: asl qator turi (rz/bl/rs/mat/ob) --
   *  resumable qoralama orqali tiklanganda ham rs/ob/mat vizual farqi
   *  yo'qolmasligi uchun (`F2TwoPaneWorkbench`ning `flatSourceNodes`
   *  fallback'i shu maydonga tayanadi). Eski (bu maydon qo'shilishidan
   *  oldingi) qoralamalarda undefined bo'lishi mumkin. */
  tur?: string;
  /** F2 V3 o'quvchisi: summa katagi hujjatda ANIQ yozilgan (bo'sh katak = null, shuning uchun
   *  0 ham haqiqiy qiymat — masalan hujjat materialni 0 so'mga yozgan). Eski o'quvchilar bo'sh
   *  katakni 0 qilgani uchun bu bayroqsiz 0 hamon "summa yo'q" (o'zgarmagan qoida). */
  summaYozilgan?: boolean;
};

export type F2ExactQator = {
  qator_id: number;
  hajm: number;
  narx?: number;
  summa: number;
  /** F2 faylda haqiqatan SUMMA yozilganmi (0 ham "bor" bo'lishi mumkin — shuning uchun alohida flag) */
  summaBor: boolean;
  /**
   * Shu qatorga birlashgan manba bo'laklaridan NECHTASIDA summa yo'q edi.
   * Muhim: bo'laklarning BIRIDA summa bo'lsa `summaBor` true bo'ladi va
   * yig'indi "to'liq"dek ko'rinadi — aslida hajm hamma bo'lakdan qo'shilgan,
   * pul esa faqat bir qismidan. Shuning uchun alohida sanaladi.
   */
  summasizBolak?: number;
  /**
   * Shu qatorga birlashgan barcha manba tugunlarida uchragan (nol/manfiy
   * bo'lmagan) narxlar, birinchi ko'rilgan tartibda, TAKRORLANMAY. Odatda
   * bitta element (F2'da bir qator uchun narx bitta bo'ladi). Bir nechtasi
   * bo'lsa -- `CONFLICTING_PRICES` istisnosi (`narx` maydoni hamon
   * BIRINCHISINI saqlaydi, orqaga qarab moslik uchun).
   */
  barchaNarxlar: number[];
};

/**
 * Bir xil `qator_id`ga bog'langan bir nechta F2 qatorini (masalan bir
 * necha oy/varaq bo'lagi bitta smeta qatoriga tushsa) BITTA yozuvga
 * yig'adi: hajm/summa QO'SHILADI, narx birinchi topilgan qiymatdan
 * olinadi (F2 da bir xil qator uchun narx odatda bitta bo'ladi).
 */
export function f2AggregatsiyaQator(
  nodes: F2ExactManbaTugun[],
  getSmetaId: (uid: string) => number | null | undefined,
): F2ExactQator[] {
  const map = new Map<number, F2ExactQator>();
  nodes.forEach((n) => {
    const smetaId = getSmetaId(n.uid);
    if (!smetaId) return;
    const h = Number(n.hajm) || 0;
    const s = Number(n.summa) || 0;
    const yangiNarx = n.narx != null && n.narx > 0 ? n.narx : undefined;
    // Aniq yozilgan 0 — faqat narx bor bo'lsa haqiqiy summa (АРМАТУРА: narx × 0). Narx ham 0 bo'lsa
    // (ЗАТРАТЫ ТРУДА МАШИНИСТОВ) — narx ataylab yo'q holati, yo'qoladigan pul yo'q.
    const bor = n.summaYozilgan ? n.summa != null && Number.isFinite(Number(n.summa)) && (s !== 0 || yangiNarx != null) : !!s;
    const existing = map.get(smetaId);
    if (existing) {
      existing.hajm += h;
      existing.summa += s;
      if (bor) existing.summaBor = true; else existing.summasizBolak = (existing.summasizBolak ?? 0) + 1;
      if (yangiNarx != null && !existing.barchaNarxlar.includes(yangiNarx)) {
        existing.barchaNarxlar.push(yangiNarx);
      }
    } else {
      map.set(smetaId, {
        qator_id: smetaId,
        hajm: h,
        narx: yangiNarx,
        summa: s,
        summaBor: bor,
        summasizBolak: bor ? 0 : 1,
        barchaNarxlar: yangiNarx != null ? [yangiNarx] : [],
      });
    }
  });
  return Array.from(map.values());
}

export type F2ExactPayloadQatori = {
  qatorId: number;
  certifiedQuantity: number;
  certifiedUnitPrice?: number;
  certifiedAmount?: number;
  priceIntentionallyAbsent: boolean;
};

export type F2ExactPayloadNatija =
  | { ok: true; qatorlar: F2ExactPayloadQatori[] }
  /** Narxi bor-yu F2 faylning o'z summasi yo'q qatorlar bor — qty*narx TO'QILMAYDI, foydalanuvchi ko'rib chiqishi kerak. */
  | { ok: false; sabab: 'NEEDS_REVIEW'; noaniqSoni: number; noaniqQatorIdlar: number[] }
  /**
   * T2-F2-IMPORT-NARXSIZ-BLOK-001: summasi BOR, lekin birlik narxi YO'Q
   * qator. Bu jim yozib bo'lmaydigan holat: `priceIntentionallyAbsent`
   * bayrog'i bilan yuborilsa, `t2_akt_yarat_v2` shartnomaga ko'ra
   * `certified_amount`ni ATAYLAB `null` qiladi — ya'ni qatordagi PUL
   * yo'qoladi. Shuning uchun yozish to'xtatiladi.
   */
  | { ok: false; sabab: 'AMOUNT_WITHOUT_PRICE'; noaniqSoni: number; noaniqQatorIdlar: number[] }
  /** Bitta kanonik qatorga turli sertifikatlangan narxlarni bitta narx sifatida yozish mumkin emas. */
  | { ok: false; sabab: 'CONFLICTING_PRICES'; qatorIdlar: number[] };

/**
 * Aggregatsiyalangan qatorlardan `t2_akt_yarat_v2` uchun aniq (exact)
 * to'lov payload'ini quradi. Ambiguous qator topilsa — RAD ETADI (bo'sh
 * payload yozmaydi), chaqiruvchi buni ko'rsatishi kerak.
 */
/** Summasi qisman: bo'laklarning birida pul bor, boshqasida yo'q -- hajm
 *  hammasidan qo'shilgan, pul esa emas. Yig'indi "to'liq"dek ko'rinadi. */
const qismanSumma = (r: F2ExactQator) => r.summaBor && (r.summasizBolak ?? 0) > 0;

export function f2ExactPayloadQur(rows: F2ExactQator[]): F2ExactPayloadNatija {
  // Aggregatsiya diagnostika uchun birinchi narxni saqlaydi, lekin payload
  // quruvchisi buni haqiqat sifatida tanlamaydi. Har qanday chaqiruvchi
  // shu markaziy fail-closed himoyadan o'tadi.
  const narxZiddiyati = rows.filter((r) => r.barchaNarxlar.length > 1);
  if (narxZiddiyati.length > 0) {
    return {
      ok: false,
      sabab: 'CONFLICTING_PRICES',
      qatorIdlar: narxZiddiyati.map((r) => r.qator_id),
    };
  }
  const noaniq = rows.filter((r) => (r.narx != null && !r.summaBor) || qismanSumma(r));
  if (noaniq.length > 0) {
    return {
      ok: false,
      sabab: 'NEEDS_REVIEW',
      noaniqSoni: noaniq.length,
      noaniqQatorIdlar: noaniq.map((r) => r.qator_id),
    };
  }
  // Narxsiz-u summali qator: pastda `priceIntentionallyAbsent: true` bo'lib
  // ketadi, RPC esa o'sha bayroq bilan `certified_amount`ni null qiladi --
  // summa jimgina yo'qolardi. Yozishdan oldin to'xtatamiz.
  const summaliNarxsiz = rows.filter((r) => r.narx == null && r.summaBor);
  if (summaliNarxsiz.length > 0) {
    return {
      ok: false,
      sabab: 'AMOUNT_WITHOUT_PRICE',
      noaniqSoni: summaliNarxsiz.length,
      noaniqQatorIdlar: summaliNarxsiz.map((r) => r.qator_id),
    };
  }
  return {
    ok: true,
    qatorlar: rows.map((row) => ({
      qatorId: row.qator_id,
      certifiedQuantity: row.hajm,
      certifiedUnitPrice: row.narx,
      certifiedAmount: row.summaBor ? row.summa : undefined,
      priceIntentionallyAbsent: row.narx == null,
    })),
  };
}

// ── Pre-approval audit — istisnolarni aniqlash (T2-LRV-CLOSURE-006 Section 3) ──
//
// LRV Control qonuni: F2 pre-approval audit ko'rinishi FAQAT istisnolarni
// ko'rsatishi kerak (yuzlab qatorni qo'lda ko'rib chiqishga majburlamasdan).
// Bu yerdagi funksiya HAR BIR qatorni tekshiradi va faqat e'tibor talab
// qiladigan qatorlarni qaytaradi. `ARITHMETIC_MISMATCH` — analitik-FAQAT
// signal (F2_ARITHMETIC_MISMATCH, LRV Control qonuni Section 3): hajm*narx
// bilan hujjatning o'z summasi mos kelmasa xabar beradi, lekin
// `certified_amount`ning O'ZINI HECH QACHON qayta yozmaydi/tuzatmaydi —
// faqat ko'rib chiqish uchun belgi.

/**
 * Faqat floating-point shovqinini (masalan `10*123.45 - 1234.49` JS'da
 * `0.009999999999990905` beradi, matematik jihatdan 0.01) yutish uchun --
 * YARIM tiyindan kichik. QAT'IY 0.01 (bir butun tiyin) ATAYLAB yutilmaydi:
 * bu — egasining o'z misoli (qty=10, narx=123.45, summa=1234.49) aynan shu
 * xil haqiqiy 1-tiyinlik farqni ANIQLASHI kerak.
 */
const ARITMETIK_TOLERANS = 0.005;

export type F2Exception =
  /** Narxi bor-yu F2 faylning o'z summasi yo'q -- yozish TO'XTAYDI (f2ExactPayloadQur bilan bir xil qoida). */
  | { turi: 'NEEDS_REVIEW'; qatorId: number }
  /** hajm*narx hujjatning o'z summasidan farq qiladi -- YOZISHNI TO'XTATMAYDI, faqat ko'rib chiqish uchun. */
  | { turi: 'ARITHMETIC_MISMATCH'; qatorId: number; hisoblangan: number; hujjatdagi: number; farq: number }
  /** Manfiy hajm -- pererraschyot/qaytarilgan ish bo'lishi mumkin, alohida ko'rib chiqiladi. */
  | { turi: 'NEGATIVE_HAJM'; qatorId: number; hajm: number }
  /**
   * Bir xil smeta qatoriga birlashgan F2 manba tugunlarida IKKI XIL narx
   * uchradi (masalan hujjat ichida narx o'rtada o'zgargan yoki kiritish
   * xatosi). Aggregatsiya faqat BIRINCHISINI ishlatadi (`row.narx`) --
   * bu ko'pincha ARITHMETIC_MISMATCH sifatida ham ko'rinadi, lekin
   * CONFLICTING_PRICES aynan SABABNI ko'rsatadi (Antigravity'ning
   * T2-LRV-CLOSURE-006-ANTIGRAVITY-MERGE-AUDIT topilmasi asosida qo'shildi).
   */
  | { turi: 'CONFLICTING_PRICES'; qatorId: number; narxlar: number[] };

/**
 * Aggregatsiyalangan qatorlardan FAQAT istisnolarni chiqaradi -- toza
 * qatorlar (narx/summa mos, hajm manfiy emas) natijaga umuman kirmaydi.
 * Pre-approval audit UI shu ro'yxatni ko'rsatadi, butun jadvalni emas.
 */
export function f2IstisnolarniAniqla(rows: F2ExactQator[]): F2Exception[] {
  const out: F2Exception[] = [];
  for (const row of rows) {
    if (row.barchaNarxlar.length > 1) {
      out.push({ turi: 'CONFLICTING_PRICES', qatorId: row.qator_id, narxlar: row.barchaNarxlar });
    }
    if ((row.narx != null && !row.summaBor) || qismanSumma(row)) {
      out.push({ turi: 'NEEDS_REVIEW', qatorId: row.qator_id });
      continue; // summa yo'q/qisman -- arifmetika solishtirib bo'lmaydi
    }
    if (row.narx != null && row.summaBor) {
      const hisoblangan = row.hajm * row.narx;
      const farq = hisoblangan - row.summa;
      if (Math.abs(farq) > ARITMETIK_TOLERANS) {
        out.push({ turi: 'ARITHMETIC_MISMATCH', qatorId: row.qator_id, hisoblangan, hujjatdagi: row.summa, farq });
      }
    }
    if (row.hajm < 0) {
      out.push({ turi: 'NEGATIVE_HAJM', qatorId: row.qator_id, hajm: row.hajm });
    }
  }
  return out;
}
