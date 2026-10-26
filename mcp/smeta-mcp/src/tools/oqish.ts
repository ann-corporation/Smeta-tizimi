/** Umumiy o'qish: sql_oqish, sxema, aktor, aktor_tanla. */
import { z } from 'zod';
import { markdownJadval, qatorTozala } from '../format';
import { bittaSorov } from '../db';
import { oqishSorovi, sanoqSorovi, tranzaksiyaBuyrugi } from '../sql';
import { tool } from '../tool';

export const sqlOqish = tool({
  nom: 'sql_oqish',
  tavsif: 'Istalgan o\'qish so\'rovi (SELECT/WITH/VALUES/SHOW/EXPLAIN …) READ ONLY tranzaksiyada. SELECT-shakl so\'rov limit/offset bilan sahifalanadi '
    + '(`yana_bor`, `keyingi_offset`); `jami:true` — umumiy qatorlar soni. Parametrlar $1,$2… → `params`. `format:"jadval"` — markdown jadval.',
  kirish: {
    sql: z.string().min(1),
    params: z.array(z.any()).optional(),
    limit: z.number().int().positive().max(20000).optional().describe('standart 200'),
    offset: z.number().int().min(0).optional(),
    jami: z.boolean().optional(),
    format: z.enum(['json', 'jadval']).optional(),
  },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    const limit = a.limit ?? 200, offset = a.offset ?? 0;
    const q = oqishSorovi(a.sql, limit, offset);
    const r = await bittaSorov(m, q.sql, a.params, tranzaksiyaBuyrugi);
    const barcha = (Array.isArray(r) ? (r as Array<{ rows: Record<string, unknown>[] }>).at(-1)?.rows ?? [] : r.rows).map(qatorTozala);
    const yanaBor = barcha.length > limit;
    const qatorlar = barcha.slice(0, limit);
    let jami: number | undefined;
    if (a.jami) {
      const s = sanoqSorovi(a.sql);
      if (s) jami = Number((await bittaSorov<{ jami: number }>(m, s, a.params, tranzaksiyaBuyrugi)).rows[0]?.jami ?? 0);
      else jami = barcha.length;
    }
    if (a.format === 'jadval') {
      return `${markdownJadval(qatorlar)}\n\n${qatorlar.length} qator (offset ${offset})${jami != null ? `, jami ${jami}` : ''}${yanaBor ? `, yana bor → offset ${offset + limit}` : ''}`;
    }
    return { qatorlar, korsatildi: qatorlar.length, offset, yana_bor: yanaBor, keyingi_offset: yanaBor ? offset + limit : null, ...(jami != null ? { jami } : {}), ...(q.oralgan ? {} : { izoh: 'so\'rov o\'ralmadi (SELECT-shakl emas) — natija limit bo\'yicha kesildi' }) };
  }),
});

const JADVAL_ROYXAT = `
select n.nspname as sxema, c.relname as nom,
       case c.relkind when 'r' then 'jadval' when 'p' then 'jadval' when 'v' then 'view' when 'm' then 'mview' end as tur,
       greatest(c.reltuples, 0)::bigint as taxminiy_qator
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'snapshot') and c.relkind in ('r','p','v','m') and ($1::text is null or c.relname ilike '%' || $1 || '%')
 order by 1, 2`;

const FUNK_ROYXAT = `
select n.nspname as sxema, p.proname as nom, pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as natija
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'snapshot') and p.prokind = 'f' and ($1::text is null or p.proname ilike '%' || $1 || '%')
 order by 1, 2 limit 400`;

export const sxema = tool({
  nom: 'sxema',
  tavsif: 'Baza sxemasi (pg_catalog): argumentsiz — public/snapshot jadval/view ro\'yxati; `jadval` — ustunlar, PK/FK (chiquvchi va kiruvchi), indekslar, '
    + 'triggerlar (ta\'rifi bilan), RLS siyosatlari, view ta\'rifi; `funksiya` — har overload to\'liq ta\'rifi (pg_get_functiondef); `qidir` — nom bo\'yicha jadval+funksiya.',
  kirish: {
    jadval: z.string().optional().describe('masalan t2_qator yoki snapshot.x'),
    funksiya: z.string().optional().describe('masalan t2_fakt_yoz_v2'),
    qidir: z.string().optional(),
  },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    if (a.funksiya) {
      const [sx, nom] = a.funksiya.includes('.') ? a.funksiya.split('.', 2) : ['public', a.funksiya];
      const r = await m.query(`select pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as natija, p.prosecdef as security_definer,
                                      p.proacl::text as ruxsat, pg_get_functiondef(p.oid) as tarif
                                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2`, [sx, nom]);
      if (!r.rows.length) throw new Error(`Funksiya topilmadi: ${a.funksiya}`);
      return { funksiya: a.funksiya, overloadlar: r.rows };
    }
    if (a.jadval) {
      const nom = a.jadval.includes('.') ? a.jadval : `public.${a.jadval}`;
      const oid = (await m.query<{ oid: number | null; kind: string | null }>('select to_regclass($1)::oid::bigint as oid, (select relkind from pg_class where oid = to_regclass($1)) as kind', [nom])).rows[0];
      if (!oid?.oid) throw new Error(`Jadval/view topilmadi: ${nom}`);
      const o = oid.oid;
      const [ustunlar, cheklov, kiruvchi, indeks, trigger, rls, view] = await Promise.all([
        m.query(`select a.attname as nom, format_type(a.atttypid, a.atttypmod) as tur, not a.attnotnull as null_mumkin, pg_get_expr(d.adbin, d.adrelid) as standart
                   from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                  where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped order by a.attnum`, [o]),
        m.query(`select conname as nom, contype as tur, pg_get_constraintdef(oid) as tarif from pg_constraint where conrelid = $1 order by contype, conname`, [o]),
        m.query(`select conrelid::regclass::text as jadval, conname as nom, pg_get_constraintdef(oid) as tarif from pg_constraint where confrelid = $1 and contype = 'f' order by 1`, [o]),
        m.query(`select indexrelid::regclass::text as nom, pg_get_indexdef(indexrelid) as tarif from pg_index where indrelid = $1`, [o]),
        m.query(`select tgname as nom, pg_get_triggerdef(oid) as tarif, tgenabled as holat from pg_trigger where tgrelid = $1 and not tgisinternal order by tgname`, [o]),
        m.query(`select polname as nom, polcmd as amal, pg_get_expr(polqual, polrelid) as using_ifoda, pg_get_expr(polwithcheck, polrelid) as check_ifoda from pg_policy where polrelid = $1`, [o]),
        oid.kind === 'v' || oid.kind === 'm' ? m.query('select pg_get_viewdef($1::oid, true) as tarif', [o]) : Promise.resolve({ rows: [] as Array<{ tarif: string }> }),
      ]);
      return {
        jadval: nom, tur: oid.kind, ustunlar: ustunlar.rows, cheklovlar: cheklov.rows, kiruvchi_fk: kiruvchi.rows, indekslar: indeks.rows,
        triggerlar: trigger.rows, rls: rls.rows, ...(view.rows[0] ? { view_tarif: (view.rows[0] as { tarif: string }).tarif } : {}),
      };
    }
    const q = a.qidir ?? null;
    const j = await m.query<{ sxema: string; nom: string; tur: string; taxminiy_qator: number }>(JADVAL_ROYXAT, [q]);
    const f = q ? (await m.query(FUNK_ROYXAT, [q])).rows : undefined;
    return { jadvallar: j.rows.map((r) => `${r.sxema === 'public' ? '' : r.sxema + '.'}${r.nom}${r.tur === 'jadval' ? '' : ` (${r.tur})`} ~${r.taxminiy_qator}`), ...(f ? { funksiyalar: f } : { izoh: 'funksiyalar uchun `qidir` yoki `funksiya` bering' }) };
  }),
});

export const aktor = tool({
  nom: 'aktor',
  tavsif: 'Tizim foydalanuvchilari (t2_foydalanuvchi: id, login, email, ism, a\'zoliklar) — RPC aktorini tanlash uchun. Parol xeshi o\'qilmaydi. Joriy aktor ham ko\'rsatiladi.',
  kirish: { qidir: z.string().optional().describe('login/email/ism bo\'yicha'), kompaniya_id: z.number().int().positive().optional() },
  yozadi: false,
  bajar: async (a, mu) => mu.oqish(async (m) => {
    const r = await m.query(`select f.id, f.login, f.email, f.ism, f.holat,
                                    coalesce(json_agg(json_build_object('kompaniya_id', z.kompaniya_id, 'rol', z.rol, 'holat', z.holat)) filter (where z.id is not null), '[]') as azolik
                               from public.t2_foydalanuvchi f left join public.t2_azolik z on z.foydalanuvchi_id = f.id
                              where ($1::text is null or f.login ilike '%'||$1||'%' or f.email ilike '%'||$1||'%' or f.ism ilike '%'||$1||'%')
                                and ($2::bigint is null or exists (select 1 from public.t2_azolik z2 where z2.foydalanuvchi_id = f.id and z2.kompaniya_id = $2))
                              group by f.id order by f.id limit 100`, [a.qidir ?? null, a.kompaniya_id ?? null]);
    return { joriy_aktor: mu.aktorId, foydalanuvchilar: r.rows };
  }),
});

export const aktorTanla = tool({
  nom: 'aktor_tanla',
  tavsif: 'Shu sessiya uchun RPC aktorini o\'rnatadi (p_actor_id / t2.kim). Doimiy qilish uchun SMETA_AKTOR_ID muhit o\'zgaruvchisi.',
  kirish: { id: z.number().int().positive() },
  yozadi: false,
  bajar: async (a, mu) => {
    const f = await mu.oqish(async (m) => (await m.query('select id, login, email, ism, holat from public.t2_foydalanuvchi where id = $1', [a.id])).rows[0]);
    if (!f) throw new Error(`Foydalanuvchi #${a.id} topilmadi.`);
    mu.aktorId = a.id;
    return { aktor: f, izoh: 'sessiya aktori o\'rnatildi' };
  },
});
