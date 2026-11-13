import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** AI ISHCHILAR migratsiyasi: tuzilma qoidalari (DB kerak emas). Haqiqiy qabul — .acceptance.sql (ROLLBACK ichida, egasi bajaradi). */
const dir = resolve(__dirname, '../../../../supabase/migrations');
const NOM = '20261218500000_t2_ai_ishchilar_v1';
const oqi = (s: string) => readFileSync(resolve(dir, NOM + s), 'utf8');
const fwd = oqi('.sql'); const rb = oqi('.rollback.sql'); const acc = oqi('.acceptance.sql');
const bytes = (s: string) => readFileSync(resolve(dir, NOM + s));
const jadvallar = [...fwd.matchAll(/create table if not exists public\.(t2_ai_[a-z_]+)/g)].map((m) => m[1]);
const funksiyalar = [...fwd.matchAll(/create or replace function public\.(_?t2_ai_[a-z_0-9]+)\(([^)]*)\)/g)].map((m) => ({ nom: m[1], arg: m[2] }));

describe('migratsiya fayllari: format', () => {
  it('BOM yo‘q, BEGIN/COMMIT yo‘q, psql meta-buyruq yo‘q, statement_timeout 300s', () => {
    for (const s of ['.sql', '.rollback.sql', '.acceptance.sql']) {
      const b = bytes(s); expect(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf, s + ' BOM').toBe(false);
    }
    for (const t of [fwd, rb]) {
      expect(t).not.toMatch(/^\s*(begin|commit)\s*;/im);
      expect(t).not.toMatch(/^\s*\\[a-z]/im);
      expect(t).toContain("set local statement_timeout = '300s';");
    }
  });
  it('hajm bahosi va retention faylning boshida yozilgan', () => {
    const bosh = fwd.slice(0, 2500);
    expect(bosh).toMatch(/HAJM/); expect(bosh).toMatch(/RETENTION/); expect(bosh).toMatch(/45 kun/);
    expect(fwd).toMatch(/delete from public\.t2_ai_ish where yaratildi < now\(\) - interval '45 days'/);
  });
  it('kirill matn faqat U&\'\\XXXX\' orqali (to‘g‘ridan kirill harf yo‘q)', () => {
    for (const t of [fwd, rb, acc]) expect(t).not.toMatch(/[\u0400-\u04FF]/);
  });
});

describe('xavfsizlik: RLS, huquqlar, tenant', () => {
  it('har jadval: RLS yoqiladi, anon/authenticated huquqi olinadi, service_role beriladi', () => {
    expect(jadvallar.sort()).toEqual(['t2_ai_ish', 't2_ai_ishchi', 't2_ai_limit', 't2_ai_natija', 't2_ai_sozlama']);
    expect(fwd).toMatch(/foreach t in array array\['t2_ai_ishchi', 't2_ai_sozlama', 't2_ai_ish', 't2_ai_natija', 't2_ai_limit'\]/);
    expect(fwd).toMatch(/enable row level security/); expect(fwd).toMatch(/revoke all on public\.%I from public, anon, authenticated/); expect(fwd).toMatch(/to service_role/);
  });
  it('har funksiya security definer + search_path, ro‘yxatda revoke/grant service_role (authenticated YO‘Q)', () => {
    expect(funksiyalar.length).toBeGreaterThanOrEqual(20);
    const grant = fwd.slice(fwd.indexOf('do $grant$'), fwd.indexOf('-- ---------------------------------------------------------------- pg_cron'));
    for (const f of funksiyalar) {
      const bosh = fwd.indexOf('create or replace function public.' + f.nom + '(');
      const sarlavha = fwd.slice(bosh, bosh + 700);
      if (!/^_t2_ai_(rol_ok|band|quruq)_v1$/.test(f.nom)) expect(sarlavha, f.nom).toMatch(/security definer/);
      expect(sarlavha, f.nom).toMatch(/set search_path = public, pg_temp/);
      expect(grant, f.nom).toContain('public.' + f.nom + '(');
    }
    expect(grant).toMatch(/revoke all on function ' \|\| f \|\| ' from public, anon, authenticated/);
    expect(grant).not.toMatch(/to authenticated|to anon/);
  });
  it('ruxsat har qadamda bazada: scope guard + rol; tizim ishchisi — superadmin; begona obyekt/akt rad', () => {
    expect(fwd).toMatch(/public\.t2_agent_scope_guard_v1\(p_actor_id, p_kompaniya_id\)/);
    expect(fwd).toContain("'AKT_BEGONA'"); expect(fwd).toContain("'OBYEKT_BEGONA'"); expect(fwd).toContain("'RUXSAT_YOQ'"); expect(fwd).toContain("'ISHCHI_OCHIQ'"); expect(fwd).toContain("'DOIRA_MOS_EMAS'");
    expect(fwd).toContain("'BOLAK_MOS_EMAS'");   // internet: faqat navbatdagi (ro'yxatdagi) manba
  });
  it('limit: mavjud t2_agent_sarf_tekshir_v1 ishlatiladi (yangi hisob yo‘q), limitda ish `limit` holatiga o‘tadi', () => {
    expect(fwd).toMatch(/t2_agent_sarf_tekshir_v1\(i\.actor_id, i\.kompaniya_id\)/);
    expect(fwd).toMatch(/holat = 'limit'/);
    expect(fwd).not.toMatch(/insert into public\.t2_token_harakat|insert into public\.t2_agent_sarf/);   // token yechish faqat aiHisobli -> t2_agent_sarf_yoz_v1 orqali
  });
  it('agent faqat o‘qiydi: biznes jadvalga yozish yo‘q (faqat t2_ai_*, t2_agent_kuzatuv_url, t2_osuvchi_taklif, audit/command_log)', () => {
    const yozilganlar = new Set([...fwd.matchAll(/(?:insert into|update|delete from)\s+(?:only\s+)?(?:public\.)?(t2_[a-z0-9_]+)/g)].map((m) => m[1]));
    const ruxsat = new Set(['t2_ai_limit', 't2_ai_ish', 't2_ai_natija', 't2_ai_sozlama', 't2_ai_ishchi', 't2_agent_kuzatuv_url', 't2_osuvchi_taklif', 't2_agent_command_log']);
    expect([...yozilganlar].filter((t) => !ruxsat.has(t))).toEqual([]);
  });
  it('hamma ishchi sukut bo‘yicha o‘chiq: sozlama.yoqilgan default false, seed sozlama yozmaydi', () => {
    expect(fwd).toMatch(/yoqilgan boolean not null default false/);
    expect(fwd).not.toMatch(/insert into public\.t2_ai_sozlama\s*\(\s*kompaniya_id, ishchi_kod, yoqilgan\)\s*select/);
  });
  it('t2_qator o‘quvchisi: faqat faol qatorlar + «versiya:» izohi', () => {
    for (const nom of ['_t2_ai_faktlar_v1', '_t2_ai_bolaklar_v1']) expect(fwd).toMatch(new RegExp(`comment on function public\\.${nom}\\([^)]*\\) is 'versiya:\\s*versiya`));
    expect(fwd).toMatch(/q\.versiya_holat = 'faol'/);
  });
});

describe('declare: o‘zgaruvchi nomlari harf registrisiz takrorlanmaydi', () => {
  it('acceptance va funksiyalarning declare bo‘limlarida takror e‘lon yo‘q', () => {
    for (const [nom, t] of [['acceptance', acc], ['forward', fwd]] as const) {
      for (const blok of t.matchAll(/\bdeclare\b([\s\S]*?)\bbegin\b/gi)) {
        const nomlar = [...blok[1].replace(/'[^']*'/g, '').matchAll(/(?:^|[;\s,])((?:v|p)_[a-z0-9_]+|[a-z]\b)\s+(?:bigint|integer|numeric|text|boolean|jsonb|uuid|record|smallint|public\.)/gi)].map((m) => m[1].toLowerCase());
        const takror = nomlar.filter((n, i) => nomlar.indexOf(n) !== i);
        expect(takror, nom + ' declare takror: ' + takror.join(',')).toEqual([]);
      }
    }
  });
  it('fon ishchilar ulushi: alohida jadval, limit funksiyasi yakunla va ai_ol da tekshiriladi', () => {
    expect(fwd).toMatch(/fon_foiz integer not null default 40 check \(fon_foiz between 0 and 90\)/);
    expect((fwd.match(/public\.t2_ai_fon_limit_v1\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(acc).toContain('FON_BYUDJET_TUGADI'); expect(acc).toContain('zaxira qoladi');
  });
});

describe('cron, rollback va qabul', () => {
  it('pg_cron: har 10 daqiqada t2_ai_jadval_v1 (idempotent unschedule/schedule); rollback uni olib tashlaydi', () => {
    expect(fwd).toMatch(/cron\.schedule\('t2-ai-ishchi-jadval', '\*\/10 \* \* \* \*'/);
    expect(rb).toMatch(/cron\.unschedule\(jobid\) from cron\.job where jobname = 't2-ai-ishchi-jadval'/);
  });
  it('rollback: har yaratilgan funksiya va jadval o‘chiriladi; ustunlar va tur cheklovi tiklanadi', () => {
    for (const f of funksiyalar) expect(rb, f.nom).toContain('drop function if exists public.' + f.nom + '(');
    for (const j of jadvallar) expect(rb).toContain('drop table if exists public.' + j + ';');
    expect(rb).toMatch(/tur in \('tajriba', 'friksiya'\)/);
    expect(rb).toMatch(/drop column if exists oxirgi_xulosa/);
  });
  it('qabul: sintetik, yorliqli RAISE, har talab qamrab olingan', () => {
    expect(acc).toMatch(/raise exception 'AI qadam \[% %\]: %'/);
    expect(acc.split('\n').slice(1).join('\n')).not.toMatch(/\b\d{9,}\b/);   // real INN/hisob raqami yo'q
    for (const kalit of ['ISHCHI_OCHIQ', 'COMPANY_ACCESS_DENIED', 'GLOBAL_SCOPE_DENIED', 'WRITE_ROLE_REQUIRED', 'RUXSAT_YOQ', 'BOLAK_MOS_EMAS', 'AI_NAVBATDA_EMAS', 'takror', 'limit', 'quruq', 't2_ai_jadval_v1', '45 kundan eski']) {
      expect(acc, kalit).toContain(kalit);
    }
    expect(acc).toMatch(/limitda token yechilmasligi kerak/);
    expect(acc).toMatch(/begona natija holatini o‘zgartira olmaydi|begona natija holatini o''zgartira olmaydi/);
  });
});
