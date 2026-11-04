/**
 * Uy sotish — sof hisob funksiyalari (UI ham, testlar ham shuni ishlatadi; server Σ ni qayta tekshiradi).
 *  - tolovGrafigi: boshlang'ich to'lov + teng / annuitet / qo'lda bo'lingan muddatli to'lov; oxirgi qator yaxlitlash qoldig'ini oladi → Σ aniq.
 *  - ipoteka: annuitet oylik to'lovi, jami foiz, subsidiya ta'siri.
 *  - birliklarYasa: podyezd × qavat × namuna → shaxmatka qatorlari (raqamlash: ketma-ket yoki «podyezd-qavat-№»).
 *  - narxHisob: m² narx, chegirma, yakuniy summa.
 */

export type GrafikUsul = 'teng' | 'annuitet';
export type GrafikQatorYuk = { sana: string; summa: number; tur: 'boshlangich' | 'oylik' };

const yaxlit = (x: number, q = 0) => { const k = 10 ** q; return Math.round(x * k) / k; };

/** YYYY-MM-DD + n oy; oy oxiri saqlanadi (31-yanvar + 1 oy = 28/29-fevral). */
export function oyQosh(sana: string, n: number): string {
  const [y, m, d] = sana.split('-').map(Number);
  const jamiOy = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(jamiOy / 12); const nm = jamiOy % 12;
  const oxirgi = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, oxirgi);
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

/** Annuitet: oylik to'lov. Foiz 0 bo'lsa — teng bo'lish. */
export function annuitetTolov(asosiy: number, yillikFoiz: number, oylar: number): number {
  if (oylar <= 0) return 0;
  const r = yillikFoiz / 100 / 12;
  if (r === 0) return asosiy / oylar;
  return asosiy * r / (1 - (1 + r) ** -oylar);
}

export type GrafikParam = {
  summa: number;               // shartnoma summasi
  boshlangich: number;         // boshlang'ich to'lov summasi (0 bo'lishi mumkin)
  boshlangichSana: string;     // YYYY-MM-DD
  oylar: number;               // muddatli qism oylari soni (0 → faqat boshlang'ich = to'liq)
  birinchiOySana?: string;     // birinchi oylik to'lov sanasi (yo'q bo'lsa boshlangich + 1 oy)
  usul?: GrafikUsul;           // teng (default) yoki annuitet (ichki bo'lib to'lash foizi bilan)
  yillikFoiz?: number;         // annuitet uchun
  yaxlitlash?: number;         // har oylik summani nechaga yaxlitlash (masalan 1000 so'm); default 1
};

/** Grafik qatorlari. Kafolat: Σ summa = shartnoma summasi (+ annuitet foizi), oxirgi qator qoldiqni oladi. */
export function tolovGrafigi(p: GrafikParam): GrafikQatorYuk[] {
  const summa = yaxlit(p.summa, 2);
  if (!(summa > 0)) return [];
  const bosh = Math.min(Math.max(0, yaxlit(p.boshlangich, 2)), summa);
  const qator: GrafikQatorYuk[] = [];
  if (bosh > 0 || p.oylar <= 0) qator.push({ sana: p.boshlangichSana, summa: p.oylar <= 0 ? summa : bosh, tur: 'boshlangich' });
  if (p.oylar <= 0) return qator;
  const qoldiq = yaxlit(summa - bosh, 2);
  if (qoldiq <= 0) return qator;
  const step = Math.max(1, p.yaxlitlash ?? 1);
  const usul = p.usul ?? 'teng';
  const oylik = usul === 'annuitet' ? annuitetTolov(qoldiq, p.yillikFoiz ?? 0, p.oylar) : qoldiq / p.oylar;
  const jami = usul === 'annuitet' ? yaxlit(oylik * p.oylar, 2) : qoldiq;
  const bir = Math.floor(oylik / step) * step || yaxlit(oylik, 2);
  const boshSana = p.birinchiOySana ?? oyQosh(p.boshlangichSana, 1);
  let yigildi = 0;
  for (let i = 0; i < p.oylar; i++) {
    const oxirgi = i === p.oylar - 1;
    const s = oxirgi ? yaxlit(jami - yigildi, 2) : bir;
    yigildi = yaxlit(yigildi + s, 2);
    qator.push({ sana: oyQosh(boshSana, i), summa: s, tur: 'oylik' });
  }
  return qator;
}

export type IpotekaNatija = { kredit: number; oylik: number; jamiTolov: number; jamiFoiz: number; boshlangich: number; boshlangichFoiz: number };
/** Ipoteka kalkulyatori (xaridor uchun). subsidiya — boshlang'ich to'lovga davlat subsidiyasi (kredit summasini kamaytirmaydi). */
export function ipoteka(p: { narx: number; boshlangich: number; yillikFoiz: number; yillar: number; subsidiya?: number }): IpotekaNatija {
  const boshlangich = Math.min(Math.max(0, p.boshlangich), p.narx);
  const kredit = Math.max(0, p.narx - boshlangich - Math.max(0, p.subsidiya ?? 0));
  const oylar = Math.round(p.yillar * 12);
  const oylik = annuitetTolov(kredit, p.yillikFoiz, oylar);
  const jamiTolov = yaxlit(oylik * oylar, 2);
  return { kredit: yaxlit(kredit, 2), oylik: yaxlit(oylik, 2), jamiTolov, jamiFoiz: yaxlit(jamiTolov - kredit, 2), boshlangich,
    boshlangichFoiz: p.narx > 0 ? yaxlit(boshlangich / p.narx * 100, 1) : 0 };
}

export type NarxNatija = { asosiy: number; chegirma: number; yakuniy: number; m2Yakuniy: number };
export function narxHisob(maydon: number, narxM2: number, chegirmaFoiz = 0): NarxNatija {
  const asosiy = yaxlit(maydon * narxM2, 2);
  const f = Math.min(Math.max(0, chegirmaFoiz), 100);
  const chegirma = yaxlit(asosiy * f / 100, 2);
  const yakuniy = yaxlit(asosiy - chegirma, 2);
  return { asosiy, chegirma, yakuniy, m2Yakuniy: maydon > 0 ? yaxlit(yakuniy / maydon, 2) : 0 };
}

export type BirlikNamuna = { xona_soni: number; maydon: number; narx_m2?: number | null; tur?: 'xonadon' | 'tijorat' };
export type BirlikQator = { raqam: string; podyezd: number; qavat: number; xona_soni: number; maydon: number; narx_m2: number | null; tur: 'xonadon' | 'tijorat' };
/**
 * Shaxmatka generatori: har podyezdda `qavatlar` qavat, har qavatda `namunalar` (chapdan o'ngga) xonadonlar.
 * raqamlash: 'ketma' — 1..N podyezd/qavat bo'yicha; 'kod' — «P-Q-№» (masalan 2-05-3).
 * qavatQoshimcha: yuqori qavatlarga m² narx ustamasi (% har qavatga, boshlanish qavatidan).
 * tijoratQavat: shu qavatgacha (masalan 1) birliklar tijorat bo'ladi.
 */
export function birliklarYasa(p: {
  podyezdlar: number; qavatlar: number; boshQavat?: number; namunalar: BirlikNamuna[]; raqamlash?: 'ketma' | 'kod';
  qavatQoshimcha?: number; qoshimchaDan?: number; tijoratQavat?: number;
}): BirlikQator[] {
  const r: BirlikQator[] = [];
  const bq = p.boshQavat ?? 1;
  let n = 0;
  for (let pd = 1; pd <= p.podyezdlar; pd++) {
    for (let q = bq; q < bq + p.qavatlar; q++) {
      p.namunalar.forEach((nm, i) => {
        n += 1;
        const ustama = p.qavatQoshimcha && q >= (p.qoshimchaDan ?? bq) ? (q - (p.qoshimchaDan ?? bq)) * p.qavatQoshimcha : 0;
        const narx = nm.narx_m2 == null ? null : yaxlit(nm.narx_m2 * (1 + ustama / 100), 0);
        r.push({
          raqam: p.raqamlash === 'kod' ? `${pd}-${String(q).padStart(2, '0')}-${i + 1}` : String(n),
          podyezd: pd, qavat: q, xona_soni: nm.xona_soni, maydon: nm.maydon, narx_m2: narx,
          tur: p.tijoratQavat != null && q <= p.tijoratQavat ? 'tijorat' : (nm.tur ?? 'xonadon'),
        });
      });
    }
  }
  return r;
}

/** Telefonni server bilan bir xil normallashtirish (9 raqam → 998 prefiks). */
export function telefonNorm(t: string): string {
  const d = t.replace(/\D/g, '');
  return d.length === 9 ? `998${d}` : d;
}
