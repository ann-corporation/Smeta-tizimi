-- MOSLASH QUTISI KESHI (2026-11-14, 2-aylana). Sabab: jonli hisob kompaniya 123 da (49 tasdiqlangan F-2) 10-22 s oldi (> 5 s chegara).
-- Yechim: og'ir hisob _t2_moslash_hisob_v1 kunlik cron (mavjud ai-ishchilar cron'i -> /api/ai-ishchi-bajar -> t2_moslash_kunlik_v1) bilan jadvalga yoziladi;
-- 	2_moslash_qutisi_v1 endi jadvaldan O'QIYDI (tez). Qo'lda yangilash: t2_moslash_yangila_v1 (a'zolik + financial.read).
-- FAQAT aniqlaydi: hech narsani tuzatmaydi. t2_moslash_qutisi_v1 (20261218700000) shu migratsiyada almashtiriladi — 700000 oldin qo'llangan bo'lishi shart.
-- Migratsiyani EGASI qo'llaydi. Rollback: .rollback.sql (qutini jonli hisobga qaytaradi emas — 700000 ni qayta qo'llash kerak). Qabul: .acceptance.sql.

create table if not exists public.t2_moslash_kesh (
  kompaniya_id bigint primary key references public.t2_kompaniya(id) on delete cascade,
  natija jsonb not null,
  hisoblandi timestamptz not null default now(),
  hisob_ms integer
);
alter table public.t2_moslash_kesh enable row level security;
revoke all on public.t2_moslash_kesh from public, anon, authenticated;
grant all on public.t2_moslash_kesh to service_role;

create or replace function public._t2_moslash_hisob_v1(p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  v_ob bigint[]; v_sm jsonb; v_fk jsonb; v_f2 jsonb; v_band jsonb; v_soni jsonb;
begin

  select coalesce(array_agg(id order by id), '{}') into v_ob from public.t2_obyekt where kompaniya_id = p_kompaniya_id;
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_sm from public._t2_summa_paket_v1(v_ob, 'smeta') p;
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_fk from public._t2_summa_paket_v1(v_ob, 'fakt') p;
  select jsonb_object_agg(p.obyekt_id::text, p.paket) into v_f2 from public._t2_summa_paket_v1(v_ob, 'f2') p;

  with ob as (
    select o.id, o.nom from public.t2_obyekt o where o.kompaniya_id = p_kompaniya_id
  ), ak as (
    select a.id, a.obyekt_id, a.raqam, a.oy
      from public.t2_akt a
     where a.kompaniya_id = p_kompaniya_id and a.tur = 'f2' and a.holat = 'tasdiqlangan' and a.obyekt_id = any(v_ob)
     order by a.id desc limit 300
  ), pv as (
    select p.akt_id, count(*) as soni, sum(p.hujjat_vsego) as vsego
      from public.t2_akt_podval p where p.kompaniya_id = p_kompaniya_id and p.akt_id in (select id from ak) group by p.akt_id
  ), tz as (
    select ak.*, pv.soni as pv_soni, pv.vsego as pv_vsego,
           (public._t2_f2_ustamali(p_kompaniya_id, null, array[ak.id]) -> 'paket' ->> 'qqs_bilan')::numeric as tizim
      from ak left join pv on pv.akt_id = ak.id
  ), b as (
    -- (a) tizim jami vs podval hujjat jami
    select 'f2_podval_farq'::text as tur, tz.obyekt_id, tz.id as akt_id, tz.raqam as akt_raqam, tz.tizim as summa, (tz.tizim - tz.pv_vsego) as farq,
           'Tizim jami hujjat jamidan farq qiladi'::text as izoh, '/admin/f2-tarix'::text as yol
      from tz where tz.pv_soni > 0 and tz.pv_vsego is not null and tz.tizim is not null and abs(tz.tizim - tz.pv_vsego) > 0.02
    union all
    select 'f2_podval_yoq', tz.obyekt_id, tz.id, tz.raqam, tz.tizim, null, 'Aktning podvali yo''q (hujjat jami solishtirilmadi)', '/admin/f2-tarix'
      from tz where coalesce(tz.pv_soni, 0) = 0
    union all
    -- (b) kesh vs jonli (iflos belgilanmagan = haqiqiy eskirish)
    select 'kesh_eskirgan', k.obyekt_id, null, null, (v_f2 -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric,
           (abs(coalesce((k.f2 ->> 'qqs_bilan')::numeric, 0) - coalesce((v_f2 -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric, 0))
               + abs(coalesce((k.smeta ->> 'qqs_bilan')::numeric, 0) - coalesce((v_sm -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric, 0))
               + abs(coalesce((k.fakt ->> 'qqs_bilan')::numeric, 0) - coalesce((v_fk -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric, 0))),
           'Obyekt keshi jonli hisobdan farq qiladi', '/admin/holat'
      from public.t2_obyekt_kesh k
     where k.kompaniya_id = p_kompaniya_id and k.obyekt_id = any(v_ob)
       and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = k.obyekt_id)
       and (abs(coalesce((k.f2 ->> 'qqs_bilan')::numeric, 0) - coalesce((v_f2 -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric, 0))
          + abs(coalesce((k.smeta ->> 'qqs_bilan')::numeric, 0) - coalesce((v_sm -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric, 0))
          + abs(coalesce((k.fakt ->> 'qqs_bilan')::numeric, 0) - coalesce((v_fk -> (k.obyekt_id::text) ->> 'qqs_bilan')::numeric, 0))) > 1
    union all
    -- (c) fakt < F-2 (ustamasiz): к снятию nomzodi
    select 'fakt_kam_f2', o.id, null, null,
           ((v_f2 -> (o.id::text) ->> 'ustamasiz')::numeric - coalesce((v_fk -> (o.id::text) ->> 'ustamasiz')::numeric, 0)), null,
           'F-2 faktdan ko''p: «к снятию» nomzodi (ustamasiz)', '/admin/aosr'
      from ob o where (v_f2 -> (o.id::text) ->> 'ustamasiz')::numeric - coalesce((v_fk -> (o.id::text) ->> 'ustamasiz')::numeric, 0) > 1
    union all
    -- (d) narxsiz qatorlar (summa yo'q — soni izohda)
    select 'narxsiz', o.id, null, null, null, null,
           'Narxsiz qatorlar: ' || (coalesce((v_sm -> (o.id::text) ->> 'narxsiz_soni')::bigint, 0) + coalesce((v_f2 -> (o.id::text) ->> 'narxsiz_soni')::bigint, 0))::text || ' ta',
           '/admin/narxlar'
      from ob o where coalesce((v_sm -> (o.id::text) ->> 'narxsiz_soni')::bigint, 0) + coalesce((v_f2 -> (o.id::text) ->> 'narxsiz_soni')::bigint, 0) > 0
    union all
    -- (e) F-3 (manba='sotuv', 1C sotuv summasi QQS bilan) yig'indisi vs shartnomaga bog'langan obyektlar F-2 lari (QQS bilan). F-3 «с начала» saqlanmaydi
    --     (forma3-export: F-2 yig'indisi, oy <= davr) — saqlangan summa faqat manba='sotuv' qatorlarda, shartnoma darajasida.
    select 'f3_f2_farq', (sh.obyektlar)[1], null::bigint, sh.raqam, f3.sotuv,
           (f3.sotuv - coalesce((select sum((v_f2 -> (o::text) ->> 'qqs_bilan')::numeric) from unnest(sh.obyektlar) o), 0)),
           'F-3 (sotuv) jami F-2 lar yig''indisidan farq qiladi', '/admin/nakopitelniy'
      from (select s.id, s.raqam, array(select b.obyekt_id from public.t2_shartnoma_bog b where b.shartnoma_id = s.id and b.holat = 'faol' order by b.obyekt_id) as obyektlar
              from public.t2_shartnoma s where s.kompaniya_id = p_kompaniya_id and s.holat <> 'bekor' and coalesce(s.asosiy, true)) sh
      join (select f.shartnoma_id, sum(f.sotuv_summa) as sotuv from public.t2_forma3 f
             where f.kompaniya_id = p_kompaniya_id and f.holat <> 'bekor' and f.manba = 'sotuv' group by f.shartnoma_id) f3 on f3.shartnoma_id = sh.id
     where cardinality(sh.obyektlar) > 0
       and abs(f3.sotuv - coalesce((select sum((v_f2 -> (o::text) ->> 'qqs_bilan')::numeric) from unnest(sh.obyektlar) o), 0)) > 1  ), z as (
    select b.*, o.nom as obyekt_nom from b left join ob o on o.id = b.obyekt_id
     order by abs(coalesce(b.farq, b.summa, 0)) desc, b.tur limit 300
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'tur', z.tur, 'obyekt_id', z.obyekt_id, 'obyekt_nom', z.obyekt_nom, 'akt_id', z.akt_id, 'akt_raqam', z.akt_raqam,
           'summa', z.summa, 'farq', z.farq, 'izoh', z.izoh,
           'havola', z.yol || case when z.obyekt_id is not null then (case when z.yol = '/admin/holat' then '/' || z.obyekt_id::text else '?obyekt=' || z.obyekt_id::text end) else '' end)
         order by abs(coalesce(z.farq, z.summa, 0)) desc, z.tur), '[]'::jsonb)
    into v_band from z;

  select coalesce(jsonb_object_agg(t.tur, t.n), '{}'::jsonb) into v_soni
    from (select e ->> 'tur' as tur, count(*) as n from jsonb_array_elements(v_band) e group by 1) t;

  return jsonb_build_object('ok', true, 'hisoblandi', now(), 'jami', jsonb_array_length(v_band), 'tur_soni', v_soni, 'bandlar', v_band,
                            'izoh', 'Faqat aniqlaydi: hech narsa o''zgartirilmaydi, tuzatishni inson qiladi.');
end $fn$;
revoke all on function public._t2_moslash_hisob_v1(bigint) from public, anon, authenticated;
grant execute on function public._t2_moslash_hisob_v1(bigint) to service_role;

create or replace function public._t2_moslash_yoz_v1(p_kompaniya_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare v_t timestamptz := clock_timestamp(); v_n jsonb;
begin
  perform set_config('statement_timeout', '120000', true);
  v_n := public._t2_moslash_hisob_v1(p_kompaniya_id);
  insert into public.t2_moslash_kesh (kompaniya_id, natija, hisoblandi, hisob_ms)
  values (p_kompaniya_id, v_n, now(), (extract(epoch from clock_timestamp() - v_t) * 1000)::int)
  on conflict (kompaniya_id) do update set natija = excluded.natija, hisoblandi = excluded.hisoblandi, hisob_ms = excluded.hisob_ms;
  return v_n;
end $fn$;
revoke all on function public._t2_moslash_yoz_v1(bigint) from public, anon, authenticated;
grant execute on function public._t2_moslash_yoz_v1(bigint) to service_role;

-- Qutini O'QIYDI (tez). Kesh yo'q -> hisoblanmagan:true (0 ta tafovut DEMAYDI). 30 soatdan eski -> eskirgan:true.
create or replace function public.t2_moslash_qutisi_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare k public.t2_moslash_kesh;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');
  select * into k from public.t2_moslash_kesh where kompaniya_id = p_kompaniya_id;
  if not found then
    return jsonb_build_object('ok', true, 'hisoblanmagan', true, 'jami', 0, 'tur_soni', '{}'::jsonb, 'bandlar', '[]'::jsonb, 'hisoblandi', null);
  end if;
  return k.natija || jsonb_build_object('hisoblandi', k.hisoblandi, 'eskirgan', k.hisoblandi < now() - interval '30 hours', 'hisob_ms', k.hisob_ms);
end $fn$;
revoke all on function public.t2_moslash_qutisi_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_moslash_qutisi_v1(bigint, bigint) to service_role;

-- Qo'lda yangilash (og'ir: ~10-20 s). a'zolik + financial.read.
create or replace function public.t2_moslash_yangila_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'financial.read');
  return public._t2_moslash_yoz_v1(p_kompaniya_id) || jsonb_build_object('yangilandi', true);
end $fn$;
revoke all on function public.t2_moslash_yangila_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_moslash_yangila_v1(bigint, bigint) to service_role;

-- Kunlik cron (service_role): eng eskirgan kompaniyalarni p_limit tagacha yangilaydi (har chaqiruvda 1 ta — vaqt chegarasi uchun).
create or replace function public.t2_moslash_kunlik_v1(p_limit integer default 1)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $fn$
declare r record; n integer := 0; v_ids bigint[] := '{}';
begin
  for r in
    select a.kompaniya_id from (select distinct kompaniya_id from public.t2_akt where tur = 'f2' and holat = 'tasdiqlangan') a
      left join public.t2_moslash_kesh k on k.kompaniya_id = a.kompaniya_id
     where k.hisoblandi is null or k.hisoblandi < now() - interval '20 hours'
     order by k.hisoblandi nulls first, a.kompaniya_id limit greatest(1, least(coalesce(p_limit, 1), 3))
  loop
    perform public._t2_moslash_yoz_v1(r.kompaniya_id); n := n + 1; v_ids := v_ids || r.kompaniya_id;
  end loop;
  return jsonb_build_object('ok', true, 'yangilandi', n);
end $fn$;
revoke all on function public.t2_moslash_kunlik_v1(integer) from public, anon, authenticated;
grant execute on function public.t2_moslash_kunlik_v1(integer) to service_role;