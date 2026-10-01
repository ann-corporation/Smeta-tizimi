-- T2-BEZ-SKLAD-QOLLA-001 — mavjud smeta qatorlariga БЕЗСКЛАД ni operator tasdig'i bilan qo'llash.
-- Kategoriya registri (t2_resurs_kategoriya_belgila_v1) faqat KELGUSI importlarga ta'sir qiladi; eski
-- obyektlarda beton/qorishma МАТ bo'lib qolgan (2026-10-01: 28 obyekt, 3192 nomzod). Ombor agenti
-- (t2_agent_ishchi_ombor_v1) nomzodlarni topadi; bu RPC operator tanlagan qatorlarni o'tkazadi.
--
-- Qoidalar:
--   * faqat shu obyektdagi tur rs/mat, kat='МАТ' va t2_bez_sklad_nomzodmi(nom) = true qatorlar;
--   * F2 aktiga kirgan qator (t2_akt_qator) O'TKAZILMAYDI — topshirilgan hujjat summalari
--     o'zgarmasin; javobda 'aktda' ro'yxati qaytadi (operator alohida hal qiladi);
--   * har nom+birlik registrga ham yoziladi (keyingi importlar ham БЕЗСКЛАД oladi);
--   * idempotent (operation_id), audit, rol: admin/superadmin/boss/director/pto.
-- Faqat ADDITIV.
--
-- HOLAT (2026-10-01 06:45): MANBA TAYYOR, PRODUCTION'GA QO'LLANMAGAN — avtomatik qo'llash
-- xavfsizlik filtri tomonidan to'xtatildi; egasi ko'rib chiqib qo'llaydi. Qo'llanmaguncha UI
-- tugmasi ulanmaydi (Ombor agenti faqat nomzodlarni ko'rsatadi).

begin;

create or replace function public.t2_bez_sklad_qolla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_ids bigint[],
  p_operation_id uuid, p_run_id bigint default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_rol text; v_res jsonb;
  v_otdi bigint[]; v_aktda bigint[]; v_mos_emas bigint[]; v_registr int := 0; r record;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol is null or v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then
    return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED');
  end if;
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBJECT_SCOPE_DENIED');
  end if;
  if p_qator_ids is null or cardinality(p_qator_ids) = 0 or cardinality(p_qator_ids) > 5000 then
    return jsonb_build_object('ok', false, 'code', 'QATOR_IDS_1_5000');
  end if;

  -- Tasnif: o'tadigan / aktda / mos emas (boshqa obyekt, МАТ emas yoki qoida tasdiqlamaydi).
  select coalesce(array_agg(q.id order by q.id) filter (where not exists (select 1 from public.t2_akt_qator a where a.qator_id = q.id)), '{}'),
         coalesce(array_agg(q.id order by q.id) filter (where exists (select 1 from public.t2_akt_qator a where a.qator_id = q.id)), '{}')
    into v_otdi, v_aktda
  from public.t2_qator q
  where q.id = any(p_qator_ids) and q.obyekt_id = p_obyekt_id and q.tur in ('rs', 'mat')
    and q.kat = 'МАТ' and public.t2_bez_sklad_nomzodmi(q.nom);
  select coalesce(array_agg(x order by x), '{}') into v_mos_emas
  from unnest(p_qator_ids) x where not (x = any(v_otdi) or x = any(v_aktda));

  for r in select distinct public.t2_resurs_nom_kalit(q.nom) nk, public.t2_resurs_birlik_kalit(q.birlik) bk
           from public.t2_qator q where q.id = any(v_otdi) loop
    continue when coalesce(r.nk, '') = '' or coalesce(r.bk, '') = '';
    insert into public.t2_resurs_kategoriya(kompaniya_id, nom_key, birlik_key, kategoriya, actor_id)
      values (p_kompaniya_id, r.nk, r.bk, 'БЕЗСКЛАД', p_actor_id)
      on conflict (kompaniya_id, nom_key, birlik_key)
      do update set kategoriya = 'БЕЗСКЛАД', actor_id = excluded.actor_id, yangilandi = now(),
        versiya = t2_resurs_kategoriya.versiya + 1
      where t2_resurs_kategoriya.kategoriya is distinct from 'БЕЗСКЛАД';
    v_registr := v_registr + 1;
  end loop;

  update public.t2_qator set kat = 'БЕЗСКЛАД' where id = any(v_otdi);

  perform public.t2_audit_yoz(p_kompaniya_id, 'bez_sklad_qolla', 'resurs_kategoriya', p_obyekt_id,
    format('otdi=%s aktda=%s mos_emas=%s registr=%s run=%s', cardinality(v_otdi), cardinality(v_aktda),
      cardinality(v_mos_emas), v_registr, coalesce(p_run_id::text, '-')), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'otdi', cardinality(v_otdi), 'otdi_ids', to_jsonb(v_otdi[1:200]),
    'aktda', to_jsonb(v_aktda), 'mos_emas', to_jsonb(v_mos_emas[1:200]), 'registr', v_registr);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'bez_sklad_qolla', v_res);
  return v_res;
end $$;

revoke all on function public.t2_bez_sklad_qolla_v1(bigint, bigint, bigint, bigint[], uuid, bigint) from public, anon, authenticated;
grant execute on function public.t2_bez_sklad_qolla_v1(bigint, bigint, bigint, bigint[], uuid, bigint) to service_role;

commit;
