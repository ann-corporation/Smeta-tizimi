import { kalit, son, toliqUstunlar, xom } from './matn';
import { sarlavhaBlokiniTop, tartibRaqamlariQatorimi } from './ustun';
import type { Dalil, ErkinVaraq, Katak, KirishKitob, KirishVaraq, Manzil, TransportQatori, VaraqAnatomiyasi } from './turlar';

/**
 * Erkin hisob varaqlari (egasi 2026-09-24: "perevozka proizvoniy shaklda
 * hisoblangan exellar … sub badiiy ishlar, shefmontaj — bizning formatlarga mos
 * bo'lmaydi"). Modul ularni LRV/RES ga majburan solmaydi: faqat isbotlanadigan
 * yakuniy summani va uni o'qiydigan svod qatorini topadi. Qayerga qo'shish —
 * operator qarori.
 *
 * Perevozka (C4 PR-1, 2026-10-26):
 *   - tn·km varag'i (`трансп.`, `Лист2`) — har material qatori olinadi; tonna × masofa = tn·km va
 *     tn·km × narx = summa arifmetikasi bilan tekshiriladi. Egasi qarori: importda har material
 *     ALOHIDA perevozka resursi bo'ladi (F2 da qisman bajarish uchun) — `yuklash.hamrohDaraxti`.
 *   - sarlavhasiz bitta guruhli perevozka RES (`16.Перевоз`) — varaq anatomiyada `res` bo'lib o'qiladi
 *     (varaq.ts: sarlavhasiz RES isboti), bu yerda faqat ИТОГО va svod bog'lanishi.
 */
const JAMI = /^(ИТОГО|ВСЕГО|JAMI|ЖАМИ)/;

function ustunHarf(c: number): string {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Oxirgi ИТОГО/ВСЕГО qatorining eng o'ngdagi soni. */
function yakuniySumma(fayl: string, nom: string, rows: readonly (readonly unknown[])[]): ErkinVaraq['yakuniy'] {
  for (let r = rows.length - 1; r >= 0; r--) {
    const row = (rows[r] ?? []) as Parameters<typeof toliqUstunlar>[0];
    const toliq = toliqUstunlar(row);
    const yorliq = toliq.map((i) => xom(row[i])).find((t) => JAMI.test(kalit(t)));
    if (!yorliq) continue;
    for (let i = toliq.length - 1; i >= 0; i--) {
      const q = son(row[toliq[i]]);
      if (q != null && typeof row[toliq[i]] === 'number') {
        return { xom: yorliq, qiymat: q, manzil: { fayl, varaq: nom, qator: r + 1, ustun: toliq[i] + 1 } };
      }
    }
  }
  return null;
}

/** `трансп.!J15`, `'4230_БР'!$G$123` — formula ichidagi varaq!katak havolalari. */
export function formulaHavolalari(f: string): Array<{ varaq: string; katak: string }> {
  const chiq: Array<{ varaq: string; katak: string }> = [];
  const re = /(?:'((?:[^']|'')+)'|([^\s!'=+\-*/(),;:&<>^"]+))!\$?([A-Z]{1,3})\$?(\d+)/g;
  for (let m = re.exec(f); m; m = re.exec(f)) {
    chiq.push({ varaq: (m[1] ?? m[2]).replace(/''/g, "'"), katak: `${m[3]}${m[4]}` });
  }
  return chiq;
}

function svodQatoriniTop(
  kitob: KirishKitob, anat: readonly VaraqAnatomiyasi[], erkinNom: string, yakuniy: NonNullable<ErkinVaraq['yakuniy']>,
): ErkinVaraq['svodQatori'] {
  const nishon = `${ustunHarf((yakuniy.manzil.ustun ?? 1) - 1)}${yakuniy.manzil.qator}`;
  let tenglik: ErkinVaraq['svodQatori'] = null;
  kitob.varaqlar.forEach((v, j) => {
    if (v.nom === erkinNom || anat[j]?.rol !== 'svod') return;
    v.rows.forEach((row, r) => {
      row.forEach((katak, c) => {
        const f = v.formulalar?.[r]?.[c];
        const yorliq = (): string => {
          const matnlar = (row ?? []).map((x) => (typeof x === 'string' ? xom(x) : '')).filter(Boolean);
          return matnlar.sort((a, b) => b.length - a.length)[0] ?? '';
        };
        const manzil: Manzil = { fayl: kitob.fayl, varaq: v.nom, qator: r + 1, ustun: c + 1 };
        if (f && formulaHavolalari(f).some((h) => h.varaq === erkinNom && h.katak === nishon)) {
          const dalil: Dalil = { qoida: 'formula', ishonch: 'yuqori', izoh: `${v.nom}!${ustunHarf(c)}${r + 1} = ${f.slice(0, 60)}` };
          tenglik = { xom: yorliq(), manzil, dalil };
        } else if (!tenglik && typeof katak === 'number' && Math.abs(katak - yakuniy.qiymat) <= 0.01) {
          tenglik = { xom: yorliq(), manzil, dalil: { qoida: 'qiymat_tengligi', ishonch: 'orta', izoh: `qiymat teng (${katak}), formula havolasi yo'q` } };
        }
      });
    });
  });
  return tenglik;
}

// ─── tn·km qatorlari ─────────────────────────────────────────────────────────

interface TransportUstunlari { tartib: number; nom: number; birlik: number; miqdor: number; tonna: number; masofa: number; tnKm: number; narx: number; summa: number }

/** tn·km sarlavhasi: «Грузооборот тн.км», «Дальность возки (км)», «Кол-во (тн)», «Стоимость тн.км», «Стоимость всего». */
export function transportUstunlari(sarlavhalar: readonly string[]): TransportUstunlari | null {
  const band = new Set<number>();
  const top = (naqsh: RegExp, taqiq?: RegExp): number => {
    const i = sarlavhalar.findIndex((s, k) => !band.has(k) && naqsh.test(s) && !(taqiq && taqiq.test(s)));
    if (i >= 0) band.add(i);
    return i;
  };
  const PUL = /СТОИМ|ЦЕНА|СУММА/;
  const tnKm = top(/ГРУЗООБОРОТ|Т(ОНН?|Н)?\s*[.·*/-]?\s*КМ/, PUL);
  const narx = top(/(СТОИМ|ЦЕНА).*(Т(ОНН?|Н)?\s*[.·*/-]?\s*КМ|ЕД)/, /ВСЕГО/);
  const summa = top(/ВСЕГО|СУММА|СТОИМ/);
  const masofa = top(/ДАЛЬНОСТ|РАССТОЯН|\(КМ\)|^КМ$/);
  const tonna = top(/\(Т(Н|ОНН)?\.?\)|ТОНН|ВЕС|МАССА/);
  const nom = top(/НАИМЕНОВАН|МАТЕРИАЛ/);
  const birlik = top(/ЕД\.?\s*ИЗМ|ЕДИНИЦ/);
  const miqdor = top(/КОЛ-?ВО|КОЛИЧЕСТВ/);
  const tartib = top(/^(№|N П|NN|№№)|^N$/);
  // Kamida material, tn·km va summa ustunlari bo'lmasa — bu tn·km jadvali deb o'qilmaydi.
  if (nom < 0 || tnKm < 0 || summa < 0) return null;
  return { tartib, nom, birlik, miqdor, tonna, masofa, tnKm, narx, summa };
}

const mos = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(b) * 0.005, 0.5);

/** tn·km varag'i material qatorlari (ИТОГО gacha). Ustunlar tanilmasa — null. */
export function transportQatorlari(fayl: string, v: KirishVaraq): { qatorlar: TransportQatori[]; ustunlar: TransportUstunlari } | null {
  const blok = sarlavhaBlokiniTop(v.rows);
  if (!blok) return null;
  const u = transportUstunlari(blok.sarlavhalar);
  if (!u) return null;
  const ol = (row: readonly Katak[], i: number): Katak => (i >= 0 ? row[i] ?? null : null);
  const raqam = (row: readonly Katak[], i: number): number | null => son(ol(row, i));
  const qatorlar: TransportQatori[] = [];
  for (let r = blok.malumotBoshi; r < v.rows.length; r++) {
    const row = v.rows[r] ?? [];
    const toliq = toliqUstunlar(row);
    if (!toliq.length || tartibRaqamlariQatorimi(row)) continue;
    if (toliq.some((i) => JAMI.test(kalit(row[i])))) break;
    const nom = xom(ol(row, u.nom));
    if (!nom || !/[A-Za-zА-Яа-яЁё]/.test(nom)) continue;
    const tonna = raqam(row, u.tonna), masofa = raqam(row, u.masofa), tnKm = raqam(row, u.tnKm);
    const narx = raqam(row, u.narx), summa = raqam(row, u.summa);
    if ([raqam(row, u.miqdor), tonna, tnKm, summa].every((x) => x == null)) continue;
    qatorlar.push({
      tartib: xom(ol(row, u.tartib)), xom: nom, birlik: xom(ol(row, u.birlik)) || null,
      miqdor: raqam(row, u.miqdor), tonna, masofa, tnKm, narx, summa,
      isbot: {
        tnKm: tonna != null && masofa != null && tnKm != null ? mos(tonna * masofa, tnKm) : null,
        summa: tnKm != null && narx != null && summa != null ? mos(tnKm * narx, summa) : null,
      },
      manzil: { fayl, varaq: v.nom, qator: r + 1, ustun: u.nom + 1 },
    });
  }
  return { qatorlar, ustunlar: u };
}

export function erkinVaraqlar(kitob: KirishKitob, anat: readonly VaraqAnatomiyasi[]): ErkinVaraq[] {
  const chiq: ErkinVaraq[] = [];
  kitob.varaqlar.forEach((v, j) => {
    const a = anat[j];
    const perevozkaRes = a?.rol === 'res' && a.rolDalil.some((d) => d.qoida === 'res:sarlavhasiz_arifmetika');
    const rol: ErkinVaraq['rol'] | null = perevozkaRes ? 'perevozka_res' : a?.rol === 'transport' || a?.rol === 'erkin' ? a.rol : null;
    if (!rol) return;
    const yakuniy = yakuniySumma(kitob.fayl, v.nom, v.rows);
    const svodQatori = yakuniy ? svodQatoriniTop(kitob, anat, v.nom, yakuniy) : null;
    const e: ErkinVaraq = { fayl: kitob.fayl, varaq: v.nom, rol, yakuniy, svodQatori, holat: 'kutmoqda' };
    if (rol === 'transport') {
      const t = transportQatorlari(kitob.fayl, v);
      if (t) {
        e.qatorlar = t.qatorlar;
        const summalar = t.qatorlar.map((q) => q.summa).filter((x): x is number => x != null);
        e.qatorlarJami = summalar.length ? summalar.reduce((s, x) => s + x, 0) : null;
        e.jamiMos = e.qatorlarJami != null && yakuniy ? mos(e.qatorlarJami, yakuniy.qiymat) : null;
      }
    }
    chiq.push(e);
  });
  return chiq;
}
