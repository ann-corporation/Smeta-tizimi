-- T2 mindmap PHASE 2 — «odamlar» (egasi 2026-11-11: «har kim o'ziga tegishli qismini ko'rsin va boshqarsin,
-- kompaniya tuzilmasi shu mindmapda qurilsin»).
--  1) t2_mindmap_grafi_v4(actor, kompaniya) = v3 grafi (t2_mindmap_grafi o'raladi, SQL takrorlanmaydi) +
--     a'zolar tugunlari (foydalanuvchi:<id>), azo_kompaniya / masul_obyekt / masul_loyiha chiziqlari,
--     KO'RISH DOIRASI (_t2_obyekt_doira_ok: dala rollari faqat biriktirilgan obyektlarni ko'radi) va
--     moliyaviy ruxsat yo'q bo'lsa pul maydonlari olib tashlanadi. `korinish` = {toliq, pul, rol, yashirin_obyekt}.
--  2) t2_mindmap_masul_v1 — odamni obyekt/loyihaga mas'ul qilib biriktirish / olib tashlash (idempotent, audit).
-- Additiv. Mavjud funksiyalar o'zgarmaydi. Rollback: 20261111700000_t2_mindmap_v4_odamlar.rollback.sql.
-- ⚠️ Postgres'da hali SINALMAGAN — qo'llashdan oldin egasi ko'rib chiqadi.

begin;

create or replace function public.t2_mindmap_grafi_v4(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_super boolean := false;
  v_roles text[];
  v_rol text;
  v_auth jsonb;
  v_pul boolean;
  v_toliq boolean;
  v_graf jsonb;
  v_hidden text[];
  v_pul_kalitlar text[];
  v_tugunlar jsonb;
  v_bogichlar jsonb;
  v_jamlanma jsonb;
begin
  if p_actor_id is null or p_actor_id <= 0 or p_kompaniya_id is null or p_kompaniya_id <= 0 then
    raise exception 'REQUEST_INVALID' using errcode = '22023';
  end if;

  -- 1) A'zolik (yoki platforma superadmini)
  v_super := coalesce(public.t2_platforma_superadmin(p_actor_id), false);
  select array_agg(a.rol order by a.id) into v_roles
    from public.t2_azolik a
   where a.kompaniya_id = p_kompaniya_id and a.foydalanuvchi_id = p_actor_id and a.holat = 'faol';
  if v_roles is null and not v_super then
    raise exception 'AUTHORIZATION_DENIED' using errcode = '42501';
  end if;
  v_rol := case when v_roles is null then 'superadmin' else v_roles[1] end;

  -- 2) Moliyaviy ruxsat (pul maydonlari)
  v_auth := public.t2_effective_authorization_v1(p_actor_id, p_kompaniya_id, null, null, 'financial.read', null);
  v_pul := coalesce((v_auth->>'allowed')::boolean, false);

  -- 3) Ko'rish doirasi: actor ko'rmaydigan obyektlar
  select coalesce(array_agg('obyekt:' || o.id), array[]::text[]) into v_hidden
    from public.t2_obyekt o
   where o.kompaniya_id = p_kompaniya_id and o.holat <> 'bekor'
     and not public._t2_obyekt_doira_ok(p_actor_id, p_kompaniya_id, o.id);
  v_toliq := coalesce(cardinality(v_hidden), 0) = 0;

  -- 4) v3 grafi
  v_graf := public.t2_mindmap_grafi(p_kompaniya_id);
  v_pul_kalitlar := array['smeta', 'fakt', 'f2', 'f2_qoralama', 'fakt_foiz', 'f2_foiz'];

  -- 5) Tugunlar: yashirin obyektlar, yetim bog'langan resurslar tushadi; meta tozalanadi; odamlar qo'shiladi
  with n as (
    select e as node, e->>'id' as id, e->>'tur' as tur
      from jsonb_array_elements(coalesce(v_graf->'tugunlar', '[]'::jsonb)) e
  ),
  b as (
    select e->>'manba' as m, e->>'maqsad' as q
      from jsonb_array_elements(coalesce(v_graf->'bogichlar', '[]'::jsonb)) e
  ),
  b_ok as (select m, q from b where not (m = any(v_hidden)) and not (q = any(v_hidden))),
  b_hid as (select m, q from b where m = any(v_hidden) or q = any(v_hidden)),
  n_ok as (
    select n.*
      from n
     where not (n.id = any(v_hidden))
       and not (
         n.tur in ('shartnoma', 'sklad', 'texnika', 'kadr')
         and n.id in (select case when h.m = any(v_hidden) then h.q else h.m end from b_hid h)
         and n.id not in (select m from b_ok union select q from b_ok)
       )
  ),
  n1 as (
    select n_ok.node, n_ok.id, n_ok.tur,
           case
             when coalesce(jsonb_typeof(n_ok.node->'meta'), 'null') <> 'object' then n_ok.node->'meta'
             when n_ok.tur = 'shartnoma' and not v_toliq then
               jsonb_set(jsonb_set(n_ok.node->'meta', '{obyekt_idlar}', f.ids), '{obyekt_soni}', to_jsonb(jsonb_array_length(f.ids)))
             else n_ok.node->'meta'
           end as m1
      from n_ok
      left join lateral (
        select coalesce(jsonb_agg(x), '[]'::jsonb) as ids
          from jsonb_array_elements(
                 case when jsonb_typeof(n_ok.node #> '{meta,obyekt_idlar}') = 'array'
                      then n_ok.node #> '{meta,obyekt_idlar}' else '[]'::jsonb end) x
         where not (('obyekt:' || (x #>> '{}')) = any(v_hidden))
      ) f on true
  ),
  n2 as (
    select n1.node, n1.id, n1.tur,
           case
             when coalesce(jsonb_typeof(n1.m1), 'null') <> 'object' then n1.m1
             else n1.m1 - (
               (case
                  when not v_pul and n1.tur = 'obyekt' then v_pul_kalitlar
                  when not v_pul and n1.tur = 'shartnoma' then array['summa', 'summa_bez_nds']
                  when not v_pul and n1.tur = 'loyiha' then array['byudjet', 'smeta_jami']
                  else array[]::text[]
                end)
               ||
               (case
                  when not v_toliq and n1.tur = 'loyiha' then array['smeta_jami', 'zayavka', 'belgi', 'obyekt_soni']
                  when not v_toliq and n1.tur = 'sklad' then array['obyekt_soni']
                  else array[]::text[]
                end)
             )
           end as m2
      from n1
  ),
  odam_masul as (
    select r.foydalanuvchi_id
      from public.t2_obyekt_foydalanuvchi_ruxsat r
      join public.t2_obyekt o on o.id = r.obyekt_id and o.kompaniya_id = p_kompaniya_id and o.holat <> 'bekor'
     where r.holat = 'faol' and not (('obyekt:' || o.id) = any(v_hidden))
    union
    select r.foydalanuvchi_id
      from public.t2_loyiha_foydalanuvchi_ruxsat r
      join public.t2_loyiha l on l.id = r.loyiha_id and l.kompaniya_id = p_kompaniya_id and l.holat <> 'bekor'
     where r.holat = 'faol'
  ),
  odam as (
    select u.id, coalesce(nullif(btrim(u.ism), ''), u.login, 'Foydalanuvchi ' || u.id) as nom, u.login,
           (array_agg(a.rol order by a.id))[1] as rol,
           jsonb_agg(distinct a.rol) as rollar
      from public.t2_azolik a
      join public.t2_foydalanuvchi u on u.id = a.foydalanuvchi_id
     where a.kompaniya_id = p_kompaniya_id and a.holat = 'faol'
       and (v_toliq or u.id = p_actor_id or u.id in (select foydalanuvchi_id from odam_masul))
     group by u.id, u.ism, u.login
  )
  select coalesce(jsonb_agg(x.t), '[]'::jsonb) into v_tugunlar
    from (
      select jsonb_set(n2.node, '{meta}', coalesce(n2.m2, 'null'::jsonb)) as t
        from n2
      union all
      select jsonb_build_object(
               'id', 'foydalanuvchi:' || od.id, 'tur', 'foydalanuvchi', 'nom', od.nom,
               'meta', jsonb_build_object('rol', od.rol, 'rollar', od.rollar, 'login', od.login),
               'x', j.x, 'y', j.y)
        from odam od
        left join public.t2_mindmap_joylashuv j
          on j.kompaniya_id = p_kompaniya_id and j.tugun_id = 'foydalanuvchi:' || od.id
    ) x;

  -- 6) Chiziqlar: yashirin obyektga ketganlar tushadi; odam chiziqlari qo'shiladi
  select coalesce(jsonb_agg(x.e), '[]'::jsonb) into v_bogichlar
    from (
      select e
        from jsonb_array_elements(coalesce(v_graf->'bogichlar', '[]'::jsonb)) e
       where not ((e->>'manba') = any(v_hidden)) and not ((e->>'maqsad') = any(v_hidden))
         and (e->>'manba') in (select t->>'id' from jsonb_array_elements(v_tugunlar) t)
         and (e->>'maqsad') in (select t->>'id' from jsonb_array_elements(v_tugunlar) t)
      union all
      select jsonb_build_object('manba', 'kompaniya:' || p_kompaniya_id, 'maqsad', t->>'id',
                                'tur', 'azo_kompaniya', 'uzsa_boladi', false)
        from jsonb_array_elements(v_tugunlar) t
       where t->>'tur' = 'foydalanuvchi'
      union all
      select jsonb_build_object('manba', 'foydalanuvchi:' || r.foydalanuvchi_id, 'maqsad', 'obyekt:' || r.obyekt_id,
                                'tur', 'masul_obyekt', 'uzsa_boladi', true, 'ruxsat', r.ruxsat,
                                'rol', (select a.rol from public.t2_azolik a
                                         where a.kompaniya_id = p_kompaniya_id and a.foydalanuvchi_id = r.foydalanuvchi_id
                                           and a.holat = 'faol' order by a.id limit 1))
        from public.t2_obyekt_foydalanuvchi_ruxsat r
        join public.t2_obyekt o on o.id = r.obyekt_id and o.kompaniya_id = p_kompaniya_id and o.holat <> 'bekor'
       where r.holat = 'faol'
         and ('foydalanuvchi:' || r.foydalanuvchi_id) in (select t->>'id' from jsonb_array_elements(v_tugunlar) t)
         and ('obyekt:' || r.obyekt_id) in (select t->>'id' from jsonb_array_elements(v_tugunlar) t)
      union all
      select jsonb_build_object('manba', 'foydalanuvchi:' || r.foydalanuvchi_id, 'maqsad', 'loyiha:' || r.loyiha_id,
                                'tur', 'masul_loyiha', 'uzsa_boladi', true, 'ruxsat', r.ruxsat,
                                'rol', (select a.rol from public.t2_azolik a
                                         where a.kompaniya_id = p_kompaniya_id and a.foydalanuvchi_id = r.foydalanuvchi_id
                                           and a.holat = 'faol' order by a.id limit 1))
        from public.t2_loyiha_foydalanuvchi_ruxsat r
        join public.t2_loyiha l on l.id = r.loyiha_id and l.kompaniya_id = p_kompaniya_id and l.holat <> 'bekor'
       where r.holat = 'faol'
         and ('foydalanuvchi:' || r.foydalanuvchi_id) in (select t->>'id' from jsonb_array_elements(v_tugunlar) t)
         and ('loyiha:' || r.loyiha_id) in (select t->>'id' from jsonb_array_elements(v_tugunlar) t)
    ) x(e);

  -- 7) Jamlanma: butun kompaniya bo'yicha — faqat to'liq ko'rinishda; pul yo'q bo'lsa pul kalitlarisiz.
  v_jamlanma := v_graf->'jamlanma';
  if not v_toliq or coalesce(jsonb_typeof(v_jamlanma), 'null') <> 'object' then
    v_jamlanma := null;
  elsif not v_pul then
    v_jamlanma := v_jamlanma - array['smeta_jami', 'fakt_jami', 'f2_jami', 'f2_qoralama_jami'];
  end if;

  return (v_graf - 'tugunlar' - 'bogichlar' - 'jamlanma')
    || jsonb_build_object('tugunlar', v_tugunlar, 'bogichlar', v_bogichlar)
    || case when v_jamlanma is null then '{}'::jsonb else jsonb_build_object('jamlanma', v_jamlanma) end
    || jsonb_build_object('korinish', jsonb_build_object(
         'toliq', v_toliq, 'pul', v_pul, 'rol', v_rol, 'yashirin_obyekt', coalesce(cardinality(v_hidden), 0)));
end
$function$;

-- Mas'ullikni biriktirish / olib tashlash
create or replace function public.t2_mindmap_masul_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_loyiha_id bigint,
  p_foydalanuvchi_id bigint, p_ruxsat text, p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prev jsonb;
  v_auth jsonb;
  v_ok boolean;
  v_natija jsonb;
  v_tur text;
  v_ent bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_kompaniya_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;

  if p_actor_id is null or p_actor_id <= 0 or p_kompaniya_id is null or p_kompaniya_id <= 0
     or p_foydalanuvchi_id is null or p_foydalanuvchi_id <= 0 then
    return jsonb_build_object('ok', false, 'code', 'REQUEST_INVALID');
  end if;
  if (p_obyekt_id is null) = (p_loyiha_id is null) then
    return jsonb_build_object('ok', false, 'code', 'TARGET_INVALID');
  end if;
  if p_ruxsat is not null and p_ruxsat not in ('read', 'write', 'manage') then
    return jsonb_build_object('ok', false, 'code', 'RUXSAT_INVALID');
  end if;

  v_auth := public.t2_effective_authorization_v1(p_actor_id, p_kompaniya_id, null, null, 'company.member.manage', null);
  v_ok := coalesce((v_auth->>'allowed')::boolean, false);
  if not v_ok then
    v_auth := public.t2_effective_authorization_v1(p_actor_id, p_kompaniya_id, null, null, 'control.company.write', null);
    v_ok := coalesce((v_auth->>'allowed')::boolean, false);
  end if;
  if not v_ok then
    return jsonb_build_object('ok', false, 'code', 'AUTHORIZATION_DENIED', 'reason', v_auth->>'reason');
  end if;

  perform 1 from public.t2_azolik a
   where a.kompaniya_id = p_kompaniya_id and a.foydalanuvchi_id = p_foydalanuvchi_id and a.holat = 'faol';
  if not found then return jsonb_build_object('ok', false, 'code', 'TARGET_NOT_MEMBER'); end if;

  if p_obyekt_id is not null then
    perform 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
    v_tur := 'obyekt'; v_ent := p_obyekt_id;
    if p_ruxsat is null then
      update public.t2_obyekt_foydalanuvchi_ruxsat
         set holat = 'bekor', versiya = versiya + 1, yangilandi = now(), berilgan_by = p_actor_id, operation_id = p_operation_id
       where obyekt_id = p_obyekt_id and foydalanuvchi_id = p_foydalanuvchi_id and holat = 'faol';
    else
      insert into public.t2_obyekt_foydalanuvchi_ruxsat (obyekt_id, foydalanuvchi_id, ruxsat, holat, berilgan_by, operation_id)
        values (p_obyekt_id, p_foydalanuvchi_id, p_ruxsat, 'faol', p_actor_id, p_operation_id)
        on conflict (obyekt_id, foydalanuvchi_id) do update
          set ruxsat = excluded.ruxsat, holat = 'faol', berilgan_by = excluded.berilgan_by,
              operation_id = excluded.operation_id, versiya = public.t2_obyekt_foydalanuvchi_ruxsat.versiya + 1,
              yangilandi = now();
    end if;
  else
    perform 1 from public.t2_loyiha l where l.id = p_loyiha_id and l.kompaniya_id = p_kompaniya_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'LOYIHA_NOT_FOUND'); end if;
    v_tur := 'loyiha'; v_ent := p_loyiha_id;
    if p_ruxsat is null then
      update public.t2_loyiha_foydalanuvchi_ruxsat
         set holat = 'bekor', versiya = versiya + 1, yangilandi = now(), berilgan_by = p_actor_id, operation_id = p_operation_id
       where loyiha_id = p_loyiha_id and foydalanuvchi_id = p_foydalanuvchi_id and holat = 'faol';
    else
      insert into public.t2_loyiha_foydalanuvchi_ruxsat (loyiha_id, foydalanuvchi_id, ruxsat, holat, berilgan_by, operation_id)
        values (p_loyiha_id, p_foydalanuvchi_id, p_ruxsat, 'faol', p_actor_id, p_operation_id)
        on conflict (loyiha_id, foydalanuvchi_id) do update
          set ruxsat = excluded.ruxsat, holat = 'faol', berilgan_by = excluded.berilgan_by,
              operation_id = excluded.operation_id, versiya = public.t2_loyiha_foydalanuvchi_ruxsat.versiya + 1,
              yangilandi = now();
    end if;
  end if;

  perform public.t2_audit_yoz(p_kompaniya_id, 'mindmap_masul', v_tur, v_ent,
    format('foydalanuvchi:%s ruxsat=%s', p_foydalanuvchi_id, coalesce(p_ruxsat, 'olib_tashlandi')),
    'actor:' || p_actor_id, null);

  v_natija := jsonb_build_object('ok', true, 'kompaniya_id', p_kompaniya_id, 'tur', v_tur, 'id', v_ent,
                                 'foydalanuvchi_id', p_foydalanuvchi_id, 'ruxsat', p_ruxsat);
  insert into public.t2_kompaniya_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'mindmap_masul_v1', v_natija);
  return v_natija;
end
$function$;

revoke all on function public.t2_mindmap_grafi_v4(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_mindmap_grafi_v4(bigint, bigint) to service_role;
revoke all on function public.t2_mindmap_masul_v1(bigint, bigint, bigint, bigint, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_mindmap_masul_v1(bigint, bigint, bigint, bigint, bigint, text, uuid) to service_role;

commit;
