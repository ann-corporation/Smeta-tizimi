/**
 * IJRO HUJJATLARI KO'RINISHI (АОСР + laboratoriya) — sof hisoblar (egasi 2026-10-25: «bir qarashda tushunarli»).
 * Yangi biznes qoida YO'Q: `t2_aosr_coverage` qatorlari va protokollar holat bo'yicha sanaladi.
 * NULL ≠ 0: yashirin ish yo'q bo'lsa qoplama ulushi — null (100% emas, 0% ham emas).
 */
export type QoplamaQator = { yashirin: boolean; akt_bor: boolean; akt_holat?: string | null };

export type AosrQoplama = {
  jami: number; aktli: number;
  yashirinJami: number; yashirinAktli: number; yashirinAktsiz: number;
  /** Yashirin ishlar ichida tasdiqlangan / qog'ozda imzolangan akt bilan qoplanganlari (akt_holat kelsa). */
  yashirinImzoli: number;
  /** 0..1 — yashirin ishlarning akt bilan qoplangan ulushi; yashirin ish yo'q — null. */
  yashirinUlush: number | null;
  /** 0..1 — barcha bajarilgan ishlar bo'yicha; ish yo'q — null. */
  umumiyUlush: number | null;
};

export function aosrQoplama(qatorlar: readonly QoplamaQator[]): AosrQoplama {
  let aktli = 0, yJ = 0, yA = 0, yI = 0;
  for (const q of qatorlar) {
    if (q.akt_bor) aktli++;
    if (q.yashirin) {
      yJ++;
      if (q.akt_bor) { yA++; if (q.akt_holat === 'tasdiqlangan' || q.akt_holat === 'qogoz') yI++; }
    }
  }
  return {
    jami: qatorlar.length, aktli, yashirinJami: yJ, yashirinAktli: yA, yashirinAktsiz: yJ - yA, yashirinImzoli: yI,
    yashirinUlush: yJ > 0 ? yA / yJ : null, umumiyUlush: qatorlar.length > 0 ? aktli / qatorlar.length : null,
  };
}

export type ProtokolNatija = 'mos' | 'mos_emas' | 'kutilmoqda';
export function protokolXulosa(p: readonly { natija: ProtokolNatija | string; summa?: number | string | null }[]): { mos: number; mosEmas: number; kutilmoqda: number; summa: number | null; summasiz: number } {
  let mos = 0, mosEmas = 0, kut = 0, summa = 0, summasiz = 0;
  for (const x of p) {
    if (x.natija === 'mos') mos++; else if (x.natija === 'mos_emas') mosEmas++; else kut++;
    if (x.summa == null || x.summa === '') summasiz++; else summa += Number(x.summa);
  }
  return { mos, mosEmas, kutilmoqda: kut, summa: p.length - summasiz > 0 ? summa : null, summasiz };
}
