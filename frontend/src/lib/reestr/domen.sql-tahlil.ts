/**
 * SQL migratsiyalarini tahlil qilish (sof fayl o'qish, DB kerak emas). Arxitektura testlari va
 * `scripts/domen-meros-yigish.mjs` shu modulni ishlatadi. Faqat `node:fs` / `node:path`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type FunksiyaTa = { nom: string; fayl: string; imzo: string; tana: string; yaratilgan: number };
export type MigratsiyaTahlili = {
  jadvallar: Map<string, string>;
  funksiyalar: Map<string, FunksiyaTa>;
  fayllar: string[];
};

export function sqlIzohsiz(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function qavsOxiri(s: string, boshi: number): number {
  let d = 0;
  for (let i = boshi; i < s.length; i++) {
    if (s[i] === '(') d++;
    else if (s[i] === ')') { d--; if (d === 0) return i; }
  }
  return -1;
}

/** Migratsiyalardagi jadval/ko'rinish va funksiyalar. Funksiya ta'rifi bir necha marta bo'lsa OXIRGISI (fayl nomi tartibi) yutadi. */
export function migratsiyalarniOqi(ildiz: string): MigratsiyaTahlili {
  const dir = join(ildiz, 'supabase', 'migrations');
  // faqat haqiqiy oldinga migratsiyalar (rollback/acceptance fayllari sxemaga kirmaydi)
  const fayllar = readdirSync(dir).filter((f) => /^\d+_[^.]*\.sql$/.test(f)).sort();
  const jadvallar = new Map<string, string>();
  const funksiyalar = new Map<string, FunksiyaTa>();
  fayllar.forEach((fayl, idx) => {
    const s = sqlIzohsiz(readFileSync(join(dir, fayl), 'utf8'));
    for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?(?:unlogged\s+)?(?:materialized\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?(?![a-z0-9_.])/gi)) {
      if (m[1].toLowerCase() !== 'if' && !jadvallar.has(m[1].toLowerCase())) jadvallar.set(m[1].toLowerCase(), fayl);
    }
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?(?![a-z0-9_.])\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const nom = m[1].toLowerCase();
      if (nom === 'if') continue;
      const qb = m.index + m[0].length - 1;
      const qo = qavsOxiri(s, qb);
      if (qo < 0) continue;
      const imzo = s.slice(qb + 1, qo);
      const qolgan = s.slice(qo + 1);
      const dm = /\$([a-zA-Z_]*)\$/.exec(qolgan);
      if (!dm) continue;
      const ochilish = qo + 1 + dm.index + dm[0].length;
      const yopilish = s.indexOf(dm[0], ochilish);
      if (yopilish < 0) continue;
      funksiyalar.set(nom, { nom, fayl, imzo, tana: s.slice(ochilish, yopilish).toLowerCase(), yaratilgan: idx });
      re.lastIndex = yopilish;
    }
  });
  return { jadvallar, funksiyalar, fayllar };
}

/** Funksiya tanasidagi YOZISH nishonlari (insert/update/delete/truncate; dinamik EXECUTE ko'rinmaydi). */
export function yozilganJadvallar(tana: string): string[] {
  const out = new Set<string>();
  const qoliplar = [
    /\binsert\s+into\s+(?:only\s+)?(?:public\.)?"?(t2_[a-z0-9_]+)"?/g,
    /\bupdate\s+(?:only\s+)?(?:public\.)?"?(t2_[a-z0-9_]+)"?(?:\s+(?:as\s+)?(?!set\b)[a-z_][a-z0-9_]*)?\s+set\b/g,
    /\bdelete\s+from\s+(?:only\s+)?(?:public\.)?"?(t2_[a-z0-9_]+)"?/g,
    /\btruncate\s+(?:table\s+)?(?:only\s+)?(?:public\.)?"?(t2_[a-z0-9_]+)"?/g,
  ];
  for (const q of qoliplar) for (const m of tana.matchAll(q)) out.add(m[1]);
  return [...out].sort();
}

const PUL_SOZ = /summa|narx|jami|qqs|nds|ustama|price|amount|tolov|pul|total|nakrutka|koef|kf\b|prochie|itogo/;

/** Pul/QQS hisobi nishonlari: "1.12", "* 0.12", "/ 112", round(<pul ifoda>, 2). Bo'sh massiv - toza. */
export function pulHisobiNishonlari(tana: string): string[] {
  const out: string[] = [];
  if (/(?<![\d.])1\.12(?![\d])/.test(tana)) out.push('1.12');
  if (/[*]\s*0?\.12(?![\d])/.test(tana)) out.push('*0.12');
  if (/[/*]\s*112(?![\d.])/.test(tana)) out.push('*|/112');
  if (/1\s*\+\s*\w*(nds|qqs)\w*\s*\/\s*100/.test(tana)) out.push('1+qqs/100');
  const re = /\bround\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tana))) {
    const qb = m.index + m[0].length - 1;
    const qo = qavsOxiri(tana, qb);
    if (qo < 0) continue;
    const ichki = tana.slice(qb + 1, qo);
    if (/,\s*2\s*$/.test(ichki) && PUL_SOZ.test(ichki)) { out.push('round(pul,2)'); break; }
  }
  return out;
}

/** `when 'rol' then array[...]` - qattiq yozilgan ikkinchi ruxsat manbasi. */
export function rolRoyxatiNishonlari(tana: string): string[] {
  return [...tana.matchAll(/when\s+'([a-z_]+)'\s+then\s+array\s*\[/g)].map((m) => m[1]);
}

export type TahlilDeps = {
  egasi: (nom: string) => { domen: string } | null;
  sinklar: readonly string[];
  hisobYadro: readonly string[];
  ruxsatManba: readonly string[];
};

export type Buzilishlar = {
  /** "funksiya>jadval" - boshqa domen jadvaliga yozish (sink jadvallar hisobga olinmaydi). */
  yozish: string[];
  /** pul/QQS hisobi yadrodan tashqarida yozilgan funksiyalar. */
  pul: string[];
  /** `when rol then array[` qattiq ruxsat ro'yxati bor funksiyalar. */
  rol: string[];
  /** sb-yoz amallari: ruxsat (capability) siz. */
  capsiz: string[];
  /** sb-yoz amallari: RPC da operation_id yo'q ("amal>rpc"). */
  idemsiz: string[];
  /** egasi topilmagan jadval/funksiya nomlari. */
  egasiz: string[];
};

export function asosFunksiyaNomi(nom: string): string {
  return nom.replace(/_pre_\d{10,}$/, '');
}

/** Hamma arxitektura tekshiruvlari uchun bitta hisob-kitob (testlar va meros generatori ham shuni ishlatadi). */
export function buzilishlarniTop(ildiz: string, deps: TahlilDeps, katalog: { jadvallar: string[]; funksiyalar: string[] }): Buzilishlar {
  const mig = migratsiyalarniOqi(ildiz);
  const yozish = new Set<string>();
  const pul = new Set<string>();
  const rol = new Set<string>();
  for (const f of mig.funksiyalar.values()) {
    const fo = deps.egasi(asosFunksiyaNomi(f.nom));
    if (!fo) continue;
    for (const t of yozilganJadvallar(f.tana)) {
      if (deps.sinklar.includes(t)) continue;
      const to = deps.egasi(t);
      if (to && to.domen !== fo.domen) yozish.add(f.nom + '>' + t);
    }
    if (!deps.hisobYadro.includes(f.nom) && pulHisobiNishonlari(f.tana).length) pul.add(f.nom);
    if (!deps.ruxsatManba.includes(f.nom) && rolRoyxatiNishonlari(f.tana).length) rol.add(f.nom);
  }
  const egasiz = new Set<string>();
  for (const n of [...katalog.jadvallar, ...mig.jadvallar.keys(), ...katalog.funksiyalar.map(asosFunksiyaNomi), ...[...mig.funksiyalar.keys()].map(asosFunksiyaNomi)]) {
    if (!deps.egasi(n)) egasiz.add(n);
  }

  const sb = readFileSync(join(ildiz, 'frontend', 'functions', 'api', 'sb-yoz.ts'), 'utf8');
  const pol = readFileSync(join(ildiz, 'frontend', 'functions', '_shared', 'write-command-policy.ts'), 'utf8');
  const polKeys = new Set([...pol.matchAll(/\b([a-z0-9_]+):\s*'([a-z]+[a-z0-9_.]*)'/g)].map((m) => m[1]));
  const dinM = /DINAMIK_BUYRUQLAR[^=]*=\s*new Set\(\[([^\]]*)\]/.exec(pol);
  const din = new Set((dinM?.[1].match(/"([a-z0-9_]+)"/g) ?? []).map((x) => x.replace(/"/g, '')));
  const capsiz: string[] = [];
  const idemsiz: string[] = [];
  for (const m of sb.matchAll(/^\s*([a-z0-9_]+):\s*\{\s*rpc:\s*'([a-z0-9_]+)'/gm)) {
    const [, amal, rpc] = m;
    if (!polKeys.has(amal) && !din.has(amal)) capsiz.push(amal);
    const fn = mig.funksiyalar.get(rpc);
    if (fn && !/operation_id|op_id/.test(fn.imzo + ' ' + fn.tana)) idemsiz.push(amal + '>' + rpc);
  }
  return {
    yozish: [...yozish].sort(), pul: [...pul].sort(), rol: [...rol].sort(),
    capsiz: capsiz.sort(), idemsiz: idemsiz.sort(), egasiz: [...egasiz].sort(),
  };
}

export function katalogOqi(ildiz: string): { jadvallar: string[]; funksiyalar: string[] } {
  const j = JSON.parse(readFileSync(join(ildiz, 'frontend', 'src', 'lib', 'reestr', 'domen-katalog.snapshot.json'), 'utf8')) as { jadvallar: string; funksiyalar: string };
  return { jadvallar: j.jadvallar.split(','), funksiyalar: j.funksiyalar.split(',') };
}