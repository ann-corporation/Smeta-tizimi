/**
 * Fayl menejeri — papka daraxti, ZIP yo'llari va jadval CSV (egasi 2026-10-02: "saytdagi R2 ni xuddi fayl exploreri
 * darajasida"; "butun boshli tizimlashgan folderlarga tartiblab solingan"; "bitta tugma bilan zip").
 *
 * Papka tartibi (har kompaniya o'z qismi): Loyiha → Obyekt → Hujjat turi → Yil-oy → fayl.
 * Loyihasiz/obyektsiz fayllar aniq nomlangan papkada (yashirilmaydi).
 */

export type Fayl = {
  id: number; nom: string; tur: string; versiya: number; mime: string; hajm: number; sha256: string | null;
  sana: string; kim: string | null; loyiha_id: number | null; loyiha: string | null; obyekt_id: number | null; obyekt: string | null;
  slot?: string | null;
  /** Rasmiy hujjatning hisobot oyi (YYYY-MM) — papka shu oy bo'yicha (yuklangan kuni emas). */
  davr?: string | null;
  /** Yuklangandagi asl nom (`nom` — foydalanuvchi bergan ko'rinadigan nom bo'lishi mumkin). */
  asl_nom?: string | null;
  /** Foydalanuvchining o'z papkasi (bo'lsa — fayl tizim papkasida emas, shu yerda ko'rinadi). */
  papka_id?: number | null;
  /** Savatga tashlangan vaqt (bo'lsa — faqat «Savat» da ko'rinadi). */
  savatda?: string | null;
};

/** Kompaniyaning o'z papkasi (egasi 2026-10-20: Drive / «Мой компьютер» kabi ierarxiya). */
export type FaylPapka = { id: number; ota_id: number | null; nom: string };

/** Tizim papkalari daraxtiga kiradigan fayllar: o'z papkasiga ko'chirilmagan va savatda emas. */
export const tizimFayllari = (f: readonly Fayl[]) => f.filter((x) => !x.papka_id && !x.savatda);
/** Savatdagi fayllar — yangi tashlangani tepada. */
export const savatFayllari = (f: readonly Fayl[]) => f.filter((x) => !!x.savatda).sort((a, b) => String(b.savatda).localeCompare(String(a.savatda)));
/** O'z papkasidagi fayllar (savatdagilar emas). */
export const menPapkaFayllari = (f: readonly Fayl[], papkaId: number) => f.filter((x) => x.papka_id === papkaId && !x.savatda);
/** Papkaning bevosita bolalari (ota = null — ildiz), nom bo'yicha. */
export const papkaBolalari = (p: readonly FaylPapka[], otaId: number | null) =>
  p.filter((x) => (x.ota_id ?? null) === otaId).sort((a, b) => a.nom.localeCompare(b.nom, 'ru'));
/** Ildizdan shu papkagacha yo'l (aylanma himoyasi bilan). */
export function papkaYoli(p: readonly FaylPapka[], id: number | null): FaylPapka[] {
  const yol: FaylPapka[] = [];
  const kor = new Set<number>();
  let joriy = id == null ? undefined : p.find((x) => x.id === id);
  while (joriy && !kor.has(joriy.id)) { kor.add(joriy.id); yol.unshift(joriy); joriy = joriy.ota_id == null ? undefined : p.find((x) => x.id === joriy!.ota_id); }
  return yol;
}
/** Papka va uning barcha avlodlari ID lari. */
export function papkaAvlodlari(p: readonly FaylPapka[], id: number): Set<number> {
  const s = new Set<number>([id]);
  for (let o = true; o;) { o = false; for (const x of p) if (x.ota_id != null && s.has(x.ota_id) && !s.has(x.id)) { s.add(x.id); o = true; } }
  return s;
}
/** Ko'chirish uchun tanlov: «A / B / C» yo'llari; `chiqar` papkasi va uning avlodlari ro'yxatga kirmaydi. */
export function papkaTanlovlari(p: readonly FaylPapka[], chiqar?: number | null): Array<{ id: number; yol: string }> {
  const yoq = chiqar == null ? new Set<number>() : papkaAvlodlari(p, chiqar);
  return p.filter((x) => !yoq.has(x.id)).map((x) => ({ id: x.id, yol: papkaYoli(p, x.id).map((y) => y.nom).join(' / ') }))
    .sort((a, b) => a.yol.localeCompare(b.yol, 'ru'));
}
/** O'z papkasi va avlodlaridagi fayllar soni (savatdagilarsiz). */
export function menPapkaSoni(p: readonly FaylPapka[], f: readonly Fayl[], id: number): number {
  const s = papkaAvlodlari(p, id);
  return f.filter((x) => x.papka_id != null && s.has(x.papka_id) && !x.savatda).length;
}

export type Papka = {
  kalit: string;            // to'liq yo'l: "Loyiha/Obyekt/Tur/2026-10"
  nom: string;
  daraja: number;            // 0 — loyiha, 1 — obyekt, 2 — tur, 3 — oy
  bolalar: Papka[];
  fayllar: Fayl[];           // faqat shu papkaning o'zidagi (eng pastki daraja — oy)
  soni: number;              // ichidagi barcha fayllar
  hajm: number;              // ichidagi barcha fayllar baytlari
  /** Yangi fayl yuklashda papka konteksti. */
  loyiha_id: number | null; obyekt_id: number | null; tur: string | null;
};

export const TUR_NOMI: Readonly<Record<string, string>> = {
  smeta: 'Smetalar', smeta_lrv: 'LRV', smeta_res: 'Resurs vedomostlari (RES)', f2_akt: 'F2 aktlari (import manbasi)',
  f2_hujjat: 'F2 hujjatlari (tasdiqlangan)', f3: 'F3 spravkalar', slichitelniy: 'Slichitelniy', m29: 'M-29', nakopitelniy: 'Nakopitelniy', aosr: 'AOSR', lab: 'Laboratoriya', shartnoma: 'Shartnomalar',
  katalog: 'Kataloglar', faktura: 'Hisob-fakturalar', hujjat: 'Boshqa hujjatlar',
};
export const turNomi = (t: string) => TUR_NOMI[t] ?? t;

export const LOYIHASIZ = 'Loyihaga biriktirilmagan';
export const OBYEKTSIZ = 'Obyektga biriktirilmagan';

/** Fayl/papka nomini ZIP va Windows uchun xavfsiz qiladi (\ / : * ? " < > | — taqiqlangan). */
export function xavfsizNom(s: string): string {
  const t = [...s].filter((c) => c.charCodeAt(0) >= 32).join('')
    .replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return (t || '_').slice(0, 120);
}

export function faylYoli(f: Fayl): string[] {
  return [
    xavfsizNom(f.loyiha ?? LOYIHASIZ),
    xavfsizNom(f.obyekt ?? OBYEKTSIZ),
    xavfsizNom(turNomi(f.tur)),
    (f.davr && /^\d{4}-\d{2}$/.test(f.davr) ? f.davr : (f.sana || '').slice(0, 7)) || 'sanasiz',
  ];
}

/** Daraxt: har daraja nom bo'yicha tartiblangan, oylar — yangisi tepada. */
export function faylDaraxti(fayllar: readonly Fayl[]): Papka {
  const ildiz: Papka = { kalit: '', nom: '', daraja: -1, bolalar: [], fayllar: [], soni: 0, hajm: 0, loyiha_id: null, obyekt_id: null, tur: null };
  for (const f of fayllar) {
    const yol = faylYoli(f);
    let p = ildiz;
    p.soni++; p.hajm += f.hajm || 0;
    yol.forEach((qism, i) => {
      const identity = [`loyiha:${f.loyiha_id ?? 'none'}`, `obyekt:${f.obyekt_id ?? 'none'}`, `tur:${encodeURIComponent(f.tur)}`, `oy:${yol[3]}`];
      const kalit = identity.slice(0, i + 1).join('/');
      let b = p.bolalar.find((x) => x.kalit === kalit);
      if (!b) {
        b = { kalit, nom: qism, daraja: i, bolalar: [], fayllar: [], soni: 0, hajm: 0,
          loyiha_id: f.loyiha_id, obyekt_id: i >= 1 ? f.obyekt_id : null, tur: i >= 2 ? f.tur : null };
        p.bolalar.push(b);
      }
      b.soni++; b.hajm += f.hajm || 0;
      p = b;
    });
    p.fayllar.push(f);
  }
  const tartibla = (p: Papka) => {
    p.bolalar.sort((a, b) => a.daraja === 3 ? b.nom.localeCompare(a.nom)
      : (a.nom === LOYIHASIZ || a.nom === OBYEKTSIZ) ? 1 : (b.nom === LOYIHASIZ || b.nom === OBYEKTSIZ) ? -1 : a.nom.localeCompare(b.nom, 'ru'));
    p.fayllar.sort((a, b) => b.sana.localeCompare(a.sana) || a.nom.localeCompare(b.nom));
    p.bolalar.forEach(tartibla);
  };
  tartibla(ildiz);
  return ildiz;
}

/** Papka ichidagi barcha fayllar (pastki papkalar bilan). */
export function papkaFayllari(p: Papka): Fayl[] {
  return [...p.fayllar, ...p.bolalar.flatMap(papkaFayllari)];
}

export function papkaTop(ildiz: Papka, kalit: string): Papka | null {
  if (ildiz.kalit === kalit) return ildiz;
  for (const b of ildiz.bolalar) { const t = papkaTop(b, kalit); if (t) return t; }
  return null;
}

/** ZIP ichidagi yo'l: papkalar + nom; bir papkada bir xil nom bo'lsa — " (v2, #id)" qo'shiladi (hech biri yo'qolmaydi). */
export function zipYollari(fayllar: readonly Fayl[]): Map<number, string> {
  const band = new Set<string>();
  const natija = new Map<number, string>();
  for (const f of fayllar) {
    const papka = faylYoli(f).join('/');
    const nom = xavfsizNom(f.nom);
    let yol = `fayllar/${papka}/${nom}`;
    if (band.has(yol.toLowerCase())) {
      const n = nom.lastIndexOf('.');
      const asos = n > 0 ? nom.slice(0, n) : nom;
      const ext = n > 0 ? nom.slice(n) : '';
      yol = `fayllar/${papka}/${asos} (v${f.versiya}, #${f.id})${ext}`;
      let takror = 2;
      while (band.has(yol.toLowerCase())) {
        yol = `fayllar/${papka}/${asos} (v${f.versiya}, #${f.id}, ${takror++})${ext}`;
      }
    }
    band.add(yol.toLowerCase());
    natija.set(f.id, yol);
  }
  return natija;
}

/** CSV (Excel uchun: ; ajratuvchi, UTF-8 BOM). Qiymat yo'q — bo'sh katak (0 emas). */
export function csv(qatorlar: readonly Record<string, unknown>[]): string {
  if (!qatorlar.length) return '﻿';
  const ustunlar = [...new Set(qatorlar.flatMap((q) => Object.keys(q)))];
  const k = (v: unknown) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [ustunlar.join(';'), ...qatorlar.map((q) => ustunlar.map((u) => k(q[u])).join(';'))].join('\r\n');
}

export function hajmMatni(b: number): string {
  if (!b) return '0 B';
  const k = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(k.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / 1024 ** i).toLocaleString('ru-RU', { maximumFractionDigits: i ? 1 : 0 })} ${k[i]}`;
}
