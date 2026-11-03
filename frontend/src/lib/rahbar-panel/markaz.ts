/**
 * Rahbar paneli — boshqaruv markazi (issue #195 §1–§5): SOF yordamchilar (hisob yo'q — raqamlar serverdan).
 * Davr tanlovi, karta holat rangi, «diqqat» bandlarining nomi va olib boradigan joyi, trend nuqtalari.
 */
import type { RahbarDiqqat, RahbarOy, RahbarPanel } from '../../api/t2-rahbar-panel';

export type DavrTur = 'hammasi' | 'oy' | 'chorak' | 'yil';
export type Davr = { dan: string | null; gacha: string | null };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Tanlangan davr → server parametrlari (joriy oy / chorak / yil boshidan bugungacha). `hammasi` — chegarasiz. */
export function davrOraligi(tur: DavrTur, bugun: Date = new Date()): Davr {
  if (tur === 'hammasi') return { dan: null, gacha: null };
  const y = bugun.getFullYear(), m = bugun.getMonth();
  const bosh = tur === 'oy' ? new Date(y, m, 1) : tur === 'chorak' ? new Date(y, m - (m % 3), 1) : new Date(y, 0, 1);
  return { dan: iso(bosh), gacha: iso(bugun) };
}

export type KartaHolat = 'yaxshi' | 'etibor' | 'xavf' | 'nomalum';

/** Karta rangi: ma'lumot yo'q — kulrang (nomalum), hech qachon «yaxshi» deb taxmin qilinmaydi. */
export function kartaHolati(kod: 'portfel' | 'bajarildi' | 'tolandi' | 'debitor' | 'kreditor' | 'rentabellik', p: RahbarPanel): KartaHolat {
  const k = p.kartalar;
  switch (kod) {
    case 'portfel': return k.portfel.smeta ? 'yaxshi' : 'nomalum';
    case 'bajarildi': {
      if (!k.bajarildi.jami) return 'nomalum';
      return k.bajarildi.reestr && Math.abs(k.bajarildi.reestr.farq) > 1 ? 'etibor' : 'yaxshi';
    }
    case 'tolandi': return k.tolandi.jami == null ? 'nomalum' : 'yaxshi';
    case 'debitor': {
      if (k.debitor.qiymat == null) return 'nomalum';
      if ((k.debitor.yosh?.k60 ?? 0) > 0) return 'xavf';
      return k.debitor.qiymat > 0 ? 'etibor' : 'yaxshi';
    }
    case 'kreditor': return k.kreditor.qiymat == null ? 'nomalum' : 'yaxshi';
    case 'rentabellik': {
      const f = k.rentabellik.foiz;
      if (f == null) return 'nomalum';
      return f < 0 ? 'xavf' : f < 10 ? 'etibor' : 'yaxshi';
    }
  }
}

/** Trend (sparkline) nuqtalari — null (kiritilmagan) oy chizilmaydi, 0 emas. */
export function trendNuqtalari(oylar: readonly RahbarOy[], kalit: 'bajarildi' | 'tolov' | 'xarajat'): Array<number | null> {
  return oylar.map((o) => {
    const v = o[kalit];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  });
}

/** Diqqat bandi qayerga olib boradi (amal tugmasi). Obyektga bog'liq bo'lsa — obyekt sahifasi bo'limi. */
export function diqqatYoli(d: RahbarDiqqat): string {
  const o = d.obyekt_id;
  const ob = (bolim: string) => (o != null ? `/admin/${bolim}?obyekt=${o}` : `/admin/${bolim}`);
  switch (d.kod) {
    case 'fakt_topshirilmagan': return ob('f2-tayyorlash');
    case 'f2_faktdan_oshgan': return ob('fakt');
    case 'smetadan_oshgan': return ob('nakopitelniy');
    case 'f3_chiqarilmagan': return ob('f2-reestr');
    case 'shartnoma_limit': return '/admin/shartnoma-liniya';
    case 'tolov_kechikkan': return '/admin/qarzdorlik';
    case 'reestr_farq': return '/admin/f2-reestr';
    case 'narxsiz': return '/admin/smeta-narxlash';
    case 'sklad_manfiy': return ob('logistika');
    default: return o != null ? `/admin/holat/${o}` : '/admin/holat';
  }
}

/** Obyekt bajarilish bosqichlari (smeta → fakt → F2 → F3), foiz 0–100 oralig'ida chiziladi; null — noma'lum. */
export function bosqichFoizlari(b: { fakt: number | null; f2: number | null; f3: number | null }): Array<{ kalit: 'fakt' | 'f2' | 'f3'; foiz: number | null }> {
  const cheg = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.max(0, Math.min(100, v)));
  return [{ kalit: 'fakt', foiz: cheg(b.fakt) }, { kalit: 'f2', foiz: cheg(b.f2) }, { kalit: 'f3', foiz: cheg(b.f3) }];
}
