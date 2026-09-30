import { kalit } from './matn';
import { sarlavhaYoli } from './ierarxiya';
import type { AktNode } from '../f2-match-engine';
import type { Resurs, Sarlavha, VaraqAnatomiyasi } from './turlar';

/**
 * Anatomiya → import quvurining `AktNode` daraxti (smeta-flatten → bo'laklar →
 * t2_smeta_import_bolak_v1). Quvur o'zgarmaydi; farq bitta: RZ endi ichma-ich
 * (obyekt → lokal → РАЗДЕЛ → blok), eski `treeBuild` da esa tekis edi va
 * ketma-ket sarlavhalardan faqat oxirgisi qolardi.
 *
 * Ish/resurs qoidalari `f2-import-parse/treeBuild.ts` bilan aynan bir xil
 * (tenglik qo'riqchisi shunga tayanadi):
 *   - resurslari bor ish → `bl`, ichida `rs` (hajm = loyiha, yo'q bo'lsa norma);
 *   - resurssiz ish qatori → `ob` (nomida yoki RZ yo'lida ОБОРУДОВАН) yoki `mat`;
 *   - hajmi bo'sh/0 yoki nomsiz qator eski quruvchidagidek kirmaydi;
 *   - LRV_PLUS mustaqil MAT/OB (RZ ostida, ishdan tashqari) — o'z turida (`mat`/`ob`),
 *     egasiz RS — `rs`; hujjat qatori tartibida.
 */
export interface AktDaraxtNatija {
  tree: AktNode[];
  /** Kirmay qolgan (hajmsiz/nomsiz) ish va resurslar — operatorga ko'rsatiladi. */
  otkazildi: number;
}

type Tugun = AktNode & { norma?: number };

export function anatomiyadanAktDaraxt(v: VaraqAnatomiyasi): AktDaraxtNatija {
  // Titul obyekti — import qilinayotgan obyektning o'zi; daraxtga ikkinchi marta kirmaydi.
  const titulObyekt = new Set(v.titul.filter((s) => s.tur === 'obyekt').map((s) => s.id));
  const barcha = [...v.titul, ...v.sarlavhalar];
  const rzOf = new Map<number, Tugun>();
  const ildiz: Tugun[] = [];
  const otasi = (s: Sarlavha): number | null => {
    let o = s.ota;
    while (o != null && titulObyekt.has(o)) o = barcha.find((x) => x.id === o)?.ota ?? null;
    return o;
  };
  const rzQosh = (s: Sarlavha) => {
    if (titulObyekt.has(s.id) || rzOf.has(s.id)) return;
    const o = otasi(s);
    if (o != null && !rzOf.has(o)) { const os = barcha.find((x) => x.id === o); if (os) rzQosh(os); }
    const t: Tugun = { uid: `anat_s${s.id}`, type: 'rz', nom: s.xom, children: [] };
    rzOf.set(s.id, t);
    const ota = o == null ? undefined : rzOf.get(o);
    (ota ? ota.children! : ildiz).push(t);
  };
  // Titul (lokal) hujjat boshida — birinchi.
  for (const s of v.titul) rzQosh(s);
  let asosiy: Tugun | null = null;
  const joy = (sarlavhaId: number | null): Tugun[] => {
    let id = sarlavhaId;
    while (id != null && titulObyekt.has(id)) id = barcha.find((x) => x.id === id)?.ota ?? null;
    const t = id == null ? undefined : rzOf.get(id);
    if (t) return t.children!;
    if (!asosiy) { asosiy = { uid: 'anat_asosiy', type: 'rz', nom: 'Асосий бўлим', children: [] }; ildiz.unshift(asosiy); }
    return asosiy.children!;
  };

  // Hujjat tartibi: sarlavha va ishlar Excel qatori bo'yicha birga — daraxtning
  // pre-order yurishi aynan hujjat tartibini beradi (bazadagi `tartib` shunga tayanadi).
  type Hodisa = { qator: number; sarlavha?: Sarlavha; ish?: VaraqAnatomiyasi['ishlar'][number]; mustaqil?: Resurs };
  const hodisalar: Hodisa[] = [
    // Svoddan qo'shilgan obyekt tugunlari boshqa faylda — bolasi kelganda rzQosh o'zi yaratadi.
    ...v.sarlavhalar.filter((s) => s.manzil.fayl === v.fayl).map((s) => ({ qator: s.manzil.qator, sarlavha: s })),
    ...v.ishlar.map((i) => ({ qator: i.manzil.qator, ish: i })),
    ...(v.mustaqilResurslar ?? []).map((r) => ({ qator: r.manzil.qator, mustaqil: r })),
  ].sort((a, b) => a.qator - b.qator);

  let otkazildi = 0;
  for (const h of hodisalar) {
    if (h.sarlavha) { rzQosh(h.sarlavha); continue; }
    if (h.mustaqil) {
      const r = h.mustaqil;
      const rh = r.hajm ?? r.normaBirlikka;
      if (!r.xom || !rh) { otkazildi++; continue; }
      const tur: AktNode['type'] = r.texnikBelgi?.startsWith('ob') ? 'ob' : r.texnikBelgi?.startsWith('mat') ? 'mat' : 'rs';
      joy(r.sarlavha ?? null).push({
        uid: `anat_m${r.manzil.qator}`, type: tur, kod: r.kod ?? '', nom: r.xom, bir: r.birlik ?? '',
        hajm: rh, narx: r.narx ?? 0, summa: r.summa ?? 0, children: [], norma: 0,
      } as Tugun);
      continue;
    }
    const ish = h.ish!;
    const hajm = ish.hajm;
    if (!ish.xom || !hajm) { otkazildi += 1 + ish.resurslar.length; continue; }
    // treeBuild bilan bir xil: faqat eng yaqin haqiqiy sarlavha nomi (titul emas —
    // treeBuild titulni bilmaydi, RZ siz faylda u "Асосий бўлим" bo'ladi).
    const titulIdlar = new Set(v.titul.map((s) => s.id));
    const yol = kalit(sarlavhaYoli(barcha, ish.sarlavha).filter((s) => !titulIdlar.has(s.id)).at(-1)?.xom ?? '');
    const nomK = kalit(ish.xom);
    const resurslar: Tugun[] = [];
    for (const r of ish.resurslar) {
      const rh = r.hajm ?? r.normaBirlikka;
      if (!r.xom || !rh) { otkazildi++; continue; }
      resurslar.push({
        uid: `anat_r${r.manzil.qator}`, type: 'rs', kod: r.kod ?? '', nom: r.xom, bir: r.birlik ?? '',
        hajm: rh, narx: r.narx ?? 0, summa: r.summa ?? 0, children: [],
        norma: r.hajm != null ? (r.normaBirlikka ?? 0) : 0,
      });
    }
    const tur: AktNode['type'] = resurslar.length || /ЗАТРАТЫ ТРУДА/.test(nomK) ? 'bl'
      : /ОБОРУДОВАН/.test(nomK) || /ОБОРУДОВАН/.test(yol) ? 'ob' : 'mat';
    joy(ish.sarlavha).push({
      uid: `anat_i${ish.manzil.qator}`, type: tur, kod: ish.shifr ?? '', nom: ish.xom, bir: ish.birlik ?? '',
      hajm, narx: ish.narx ?? 0, summa: ish.summa ?? 0, children: resurslar, norma: 0,
    } as Tugun);
  }
  // Ishsiz qolgan sarlavhalar daraxtni ifloslamaydi (eski quruvchi ham bo'sh RZ ni tashlaydi).
  const tozala = (nodes: Tugun[]): Tugun[] => nodes
    .map((n) => (n.type === 'rz' ? { ...n, children: tozala((n.children ?? []) as Tugun[]) } : n))
    .filter((n) => n.type !== 'rz' || (n.children?.length ?? 0) > 0);
  return { tree: tozala(ildiz), otkazildi };
}

/** Ish/resurs barglari imzosi (RZ e'tiborsiz): tur, kod, nom, hajm — tartib bilan. */
export function daraxtBarglari(tree: readonly AktNode[]): string[] {
  const chiq: string[] = [];
  const yur = (nodes: readonly AktNode[]) => {
    for (const n of nodes) {
      if (n.type !== 'rz') chiq.push(`${n.type}|${kalit(n.kod ?? '')}|${kalit(n.nom ?? '')}|${Number(n.hajm ?? 0).toPrecision(12)}`);
      if (n.children?.length) yur(n.children);
    }
  };
  yur(tree);
  return chiq;
}

/**
 * Tenglik qo'riqchisi: yangi daraxt eski daraxt bilan AYNAN bir xil ish/resurs
 * barglarini (tur, kod, nom, hajm, tartib) bersa — mazmun bir xil, faqat RZ
 * ierarxiyasi boyigan. Aks holda eski daraxt ishlatiladi va farq aytiladi.
 *
 * Yagona ruxsat etilgan farq (`vedomostNomlari`): eski `treeBuild` ABC4 LRV
 * oxiridagi "ВЕДОМОСТЬ РЕСУРСОВ" bo'limini ham ish sifatida qo'shardi (Navoiy
 * STR: 2 413 resurs ikki marta). Yangi barglar eskining BOSHI bilan aynan bir xil
 * va HAR BIR ortiqcha eski barg nomi anatomiya topgan vedomostda bo'lsa — bu o'sha
 * xato, `vedomostChiqarildi` bilan ochiq aytiladi.
 */
export function daraxtlarTengmi(
  eski: readonly AktNode[], yangi: readonly AktNode[], vedomostNomlari: readonly string[] = [],
): { teng: boolean; eski: number; yangi: number; birinchiFarq: number; vedomostChiqarildi: number } {
  const a = daraxtBarglari(eski), b = daraxtBarglari(yangi);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const toliqMos = a.length === b.length && i === a.length;
  const vNom = new Set(vedomostNomlari.map((n) => kalit(n)));
  const vedomostFarqi = !toliqMos && vNom.size > 0 && i === b.length && a.length > b.length
    && a.slice(b.length).every((barg) => vNom.has(barg.split('|')[2]));
  return {
    teng: toliqMos || vedomostFarqi, eski: a.length, yangi: b.length, birinchiFarq: i,
    vedomostChiqarildi: vedomostFarqi ? a.length - b.length : 0,
  };
}
