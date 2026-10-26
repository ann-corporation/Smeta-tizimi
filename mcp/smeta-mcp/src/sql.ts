/** SQL quruvchilar (sof — testlanadi). Identifikatorlar faqat katalogdan/tekshirilgan nomdan; qiymatlar doim $n parametr. */

const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `nom` yoki `sxema.nom` → "nom" / "sxema"."nom". Yaroqsiz nom — xato. */
export function identifikator(nom: string): string {
  const qism = nom.split('.');
  if (qism.length > 2 || qism.some((q) => !ID.test(q))) throw new Error(`Yaroqsiz identifikator: ${nom}`);
  return qism.map((q) => `"${q}"`).join('.');
}

/** Izohlar va satrlarni olib tashlaydi (kalit so'zni aniqlash uchun). */
export function izohsiz(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""')
    .trim();
}

/**
 * Tranzaksiya chegarasini boshqaradigan buyruqmi (COMMIT/ROLLBACK/BEGIN/SAVEPOINT …). MCP har toolni o'zi ochgan
 * tranzaksiyada bajaradi — kirish SQL'i bu chegarani boshqarmasligi kerak (MCP-QA-01). Izoh/satr olib tashlanib,
 * BIRINCHI kalit so'z tekshiriladi; ko'p buyruqli SQL'ni Postgres'ning o'zi rad etadi (bittaSorov, extended protocol).
 */
export function tranzaksiyaBuyrugi(sql: string): string | null {
  const s = izohsiz(sql).replace(/^[\s(;]+/, '').toLowerCase();
  const m = /^(begin|start\s+transaction|commit|end|rollback|abort|savepoint|release|prepare\s+transaction|set\s+transaction|set\s+session\s+characteristics)\b/.exec(s);
  return m ? m[1].replace(/\s+/g, ' ') : null;
}

/** Bitta SELECT-shakl so'rovmi (subquery'ga o'raladigan): select/with/values/table, ichida `;` yo'q. */
export function oralaMumkin(sql: string): boolean {
  const s = izohsiz(sql).replace(/;\s*$/, '');
  if (s.includes(';')) return false;
  return /^(select|with|values|table)\b/i.test(s);
}

/** sql_oqish: SELECT-shakl so'rov limit/offset bilan o'raladi (limit+1 — «yana bor» belgisi uchun). */
export function oqishSorovi(sql: string, limit: number, offset: number): { sql: string; oralgan: boolean } {
  if (!oralaMumkin(sql)) return { sql, oralgan: false };
  const l = Math.max(1, Math.floor(limit)) + 1;
  const o = Math.max(0, Math.floor(offset));
  const ich = sql.trim().replace(/;\s*$/, '');
  return { sql: `select * from (\n${ich}\n) as _mcp_q limit ${l} offset ${o}`, oralgan: true };
}

/** Jami qatorlar soni so'rovi (faqat o'raladigan so'rov uchun). */
export function sanoqSorovi(sql: string): string | null {
  if (!oralaMumkin(sql)) return null;
  return `select count(*)::bigint as jami from (\n${sql.trim().replace(/;\s*$/, '')}\n) as _mcp_q`;
}

/** pg_proc dan bitta overload tavsifi. */
export type FunksiyaTavsif = {
  oid: number; nom: string;
  /** IN/INOUT/VARIADIC argument nomlari va turlari (format_type), tartibda. */
  argNomlar: string[]; argTurlar: string[];
  /** Default qiymatli oxirgi argumentlar soni. */
  defaultSoni: number;
  /** SETOF/TABLE qaytaradimi. */
  toplam: boolean;
};

/** Berilgan argument nomlariga mos overload: hamma berilgan nom bor, default'siz hamma argument berilgan. */
export function overloadTanla(variantlar: readonly FunksiyaTavsif[], berilgan: readonly string[]): FunksiyaTavsif | null {
  const mos = variantlar.filter((v) => {
    if (berilgan.some((b) => !v.argNomlar.includes(b))) return false;
    const majburiy = v.argNomlar.slice(0, v.argNomlar.length - v.defaultSoni);
    return majburiy.every((n) => berilgan.includes(n));
  });
  if (!mos.length) return null;
  // Eng kam ortiqcha argumentli (aniqroq) variant.
  return [...mos].sort((a, b) => a.argNomlar.length - b.argNomlar.length)[0];
}

const JSONTUR = /^(json|jsonb)$/i;

/** Qiymatni pg parametriga: json/jsonb — JSON matn (massiv/obyekt ham), boshqasi o'zi. */
export function parametrQiymati(tur: string, v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (JSONTUR.test(tur)) {
    if (typeof v === 'string') {
      try { JSON.parse(v); return v; } catch { return JSON.stringify(v); }
    }
    return JSON.stringify(v);
  }
  if (typeof v === 'object' && !Array.isArray(v)) return JSON.stringify(v);
  return v;
}

/** RPC chaqiruvi: `select * from public."nom"(p_a => $1::bigint, ...)` (named notation, tur katalogdan). */
export function rpcSorovi(f: FunksiyaTavsif, args: Readonly<Record<string, unknown>>, sxema = 'public'): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const qism: string[] = [];
  f.argNomlar.forEach((n, i) => {
    if (!(n in args)) return;
    params.push(parametrQiymati(f.argTurlar[i], args[n]));
    qism.push(`${identifikator(n)} => $${params.length}::${f.argTurlar[i]}`);
  });
  return { sql: `select * from ${identifikator(sxema)}.${identifikator(f.nom)}(${qism.join(', ')})`, params };
}

/** pg_proc so'rovi: funksiya overloadlari (argument nomlari, turlari, default soni). */
export const FUNKSIYA_TAVSIF_SQL = `
select p.oid::bigint as oid, p.proname as nom, p.pronargdefaults as default_soni, p.proretset as toplam,
       coalesce((select array_agg(coalesce(p.proargnames[i], '') order by i)
                   from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality as x(t, i)
                  where coalesce(p.proargmodes[i], 'i') in ('i','b','v')), '{}') as arg_nomlar,
       coalesce((select array_agg(format_type(t, null) order by i)
                   from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality as x(t, i)
                  where coalesce(p.proargmodes[i], 'i') in ('i','b','v')), '{}') as arg_turlar
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = $1 and p.proname = $2 and p.prokind = 'f'`;

export function funksiyaTavsifQatori(r: { oid: unknown; nom: unknown; default_soni: unknown; toplam: unknown; arg_nomlar: unknown; arg_turlar: unknown }): FunksiyaTavsif {
  return {
    oid: Number(r.oid), nom: String(r.nom),
    argNomlar: (r.arg_nomlar as string[]) ?? [], argTurlar: (r.arg_turlar as string[]) ?? [],
    defaultSoni: Number(r.default_soni) || 0, toplam: !!r.toplam,
  };
}

/** UPDATE quruvchi: ustunlar katalogda borligi oldindan tekshiriladi. */
export function yangilashSorovi(jadval: string, id: number, maydonlar: Readonly<Record<string, unknown>>, ustunTurlari: ReadonlyMap<string, string>, kutilganVersiya?: number | null): { sql: string; params: unknown[] } {
  const kalitlar = Object.keys(maydonlar);
  if (!kalitlar.length) throw new Error('maydonlar bo\'sh');
  const params: unknown[] = [id];
  const set = kalitlar.map((k) => {
    const tur = ustunTurlari.get(k);
    if (!tur) throw new Error(`Ustun yo'q: ${jadval}.${k}`);
    params.push(parametrQiymati(tur, maydonlar[k]));
    return `${identifikator(k)} = $${params.length}::${tur}`;
  });
  let shart = 'id = $1';
  if (kutilganVersiya != null) { params.push(kutilganVersiya); shart += ` and versiya = $${params.length}`; }
  return { sql: `update ${identifikator(jadval)} set ${set.join(', ')} where ${shart} returning *`, params };
}

/** INSERT quruvchi. */
export function qoshishSorovi(jadval: string, maydonlar: Readonly<Record<string, unknown>>, ustunTurlari: ReadonlyMap<string, string>): { sql: string; params: unknown[] } {
  const kalitlar = Object.keys(maydonlar);
  if (!kalitlar.length) throw new Error('maydonlar bo\'sh');
  const params: unknown[] = [];
  const qiymat = kalitlar.map((k) => {
    const tur = ustunTurlari.get(k);
    if (!tur) throw new Error(`Ustun yo'q: ${jadval}.${k}`);
    params.push(parametrQiymati(tur, maydonlar[k]));
    return `$${params.length}::${tur}`;
  });
  return { sql: `insert into ${identifikator(jadval)} (${kalitlar.map(identifikator).join(', ')}) values (${qiymat.join(', ')}) returning *`, params };
}

export const USTUN_TURLARI_SQL = `
select a.attname as nom, format_type(a.atttypid, a.atttypmod) as tur
  from pg_attribute a
 where a.attrelid = to_regclass($1) and a.attnum > 0 and not a.attisdropped`;
