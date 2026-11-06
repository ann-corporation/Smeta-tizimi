/**
 * Yengil tezlik belgisi (egasi 2026-11-06: katta obyektlar sekin ochiladi). Sahifa ochilishidan ma'lumot ekranga chiqquncha
 * vaqt va shu oraliqda tugagan `/api/sb` so'rovlari soni — brauzer konsolida:
 *   [tezlik] holat ochildi: 2350 ms, 4 so'rov, 26475 qator (obyekt 153)
 * DevTools → Performance panelida ham `tezlik:<nom>` measure bo'lib ko'rinadi. Hisobga, pulga ta'sir qilmaydi.
 */
const SB = '/api/sb';

function sbSoni(): number {
  try {
    return performance.getEntriesByType('resource').filter((e) => e.name.includes(SB)).length;
  } catch { return 0; }
}

let bufer = false;
function buferKengayt() {
  if (bufer) return;
  bufer = true;
  try { performance.setResourceTimingBufferSize?.(5000); } catch { /* eski brauzer */ }
}

export type TezlikBelgi = { tugadi: (izoh?: string) => number | null };

/** Boshlanish belgisi; `tugadi()` bir marta yozadi (keyingi chaqiruvlar jim). */
export function tezlikBelgisi(nom: string): TezlikBelgi {
  const bosh = `tezlik:${nom}:bosh`;
  let tugagan = false;
  let t0 = 0; let s0 = 0;
  try { buferKengayt(); t0 = performance.now(); s0 = sbSoni(); performance.mark(bosh); } catch { /* performance yo'q */ }
  return {
    tugadi: (izoh) => {
      if (tugagan) return null;
      tugagan = true;
      try {
        const ms = Math.round(performance.now() - t0);
        const soni = sbSoni() - s0;
        try { performance.measure(`tezlik:${nom}`, bosh); } catch { /* mark tozalangan */ }
        if (import.meta.env?.MODE !== 'test') {
          // eslint-disable-next-line no-console
          console.info(`[tezlik] ${nom} ochildi: ${ms} ms, ${soni} so'rov${izoh ? `, ${izoh}` : ''}`);
        }
        return ms;
      } catch { return null; }
    },
  };
}
