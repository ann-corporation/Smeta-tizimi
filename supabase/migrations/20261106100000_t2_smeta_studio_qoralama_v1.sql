-- T2-UNIVERSAL-SMETA-STUDIO-001 — Smeta studiyasi qoralamasi (server tomonda, versiyali).
-- Qonunlar:
--  • Bu QORALAMA saqlash: tasdiqlangan smeta (t2_qator), Fakt, F2 ga TEGMAYDI. Obyekt smetasiga aylantirish
--    alohida, keyingi nomli buyruq bo'ladi (mavjud smeta import zanjiri orqali).
--  • Har yozuv: authenticated actor + faol kompaniya a'zoligi (t2_actor_kompaniya_azo_tekshir), obyekt shu
--    kompaniyaniki, operation_id idempotent (t2_kompaniya_command_log), optimistic lock (versiya), audit.
--  • Hujjat — `smeta-studio-v1` JSON (normativ retsept snapshot'i va operator override'lari bilan); NULL saqlanadi.
--  • Jadval anon/authenticated uchun yopiq; faqat SECURITY DEFINER RPC (service_role orqali Cloudflare function).
-- Additive. Rollback: 20261106100000_t2_smeta_studio_qoralama_v1.rollback.sql
begin;

create table if not exists public.t2_smeta_studio_qoralama (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint references public.t2_obyekt(id),
  draft_uid uuid not null,
  nom text not null default '',
  holat text not null default 'qoralama' check (holat in ('qoralama', 'arxiv')),
  versiya integer not null default 1 check (versiya >= 1),
  katalog_revision text,
  hujjat jsonb not null,
  bolim_soni integer not null default 0,
  ish_soni integer not null default 0,
  yaratdi_actor bigint not null,
  yangiladi_actor bigint not null,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  unique (kompaniya_id, draft_uid),
  constraint t2_smeta_studio_hujjat_hajm check (pg_column_size(hujjat) <= 4000000)
);
create index if not exists t2_smeta_studio_qoralama_komp_idx on public.t2_smeta_studio_qoralama (kompaniya_id, holat, yangilandi desc);
revoke all on public.t2_smeta_studio_qoralama from public, anon, authenticated;
alter table public.t2_smeta_studio_qoralama enable row level security;

-- Saqlash (yangi: p_expected_version = 0; mavjud: joriy versiya). Eskirgan versiya — VERSION_CONFLICT.
create or replace function public.t2_smeta_studio_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint,
  p_draft_uid uuid, p_expected_version integer, p_hujjat jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_prev record; v_rol text; v_row public.t2_smeta_studio_qoralama%rowtype; v_res jsonb;
  v_bolim int; v_ish int; v_nom text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select actor_id, command, natija into v_prev from public.t2_kompaniya_command_log where operation_id = p_operation_id;
  if found then
    if v_prev.actor_id is distinct from p_actor_id or v_prev.command <> 'smeta_studio_saqla_v1' then
      return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REUSED');
    end if;
    return v_prev.natija;
  end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol = 'rahbar' then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBJECT_NOT_IN_COMPANY');
  end if;
  if p_draft_uid is null or p_hujjat is null or jsonb_typeof(p_hujjat) <> 'object'
     or p_hujjat->>'schema' <> 'smeta-studio-v1' or p_hujjat->>'draftId' is distinct from p_draft_uid::text
     or jsonb_typeof(p_hujjat->'sections') <> 'object' or jsonb_typeof(p_hujjat->'occurrences') <> 'object'
     or jsonb_typeof(p_hujjat->'rootOrder') <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'DOCUMENT_INVALID');
  end if;
  select count(*) into v_bolim from jsonb_object_keys(p_hujjat->'sections');
  select count(*) into v_ish from jsonb_object_keys(p_hujjat->'occurrences');
  if v_bolim > 2000 or v_ish > 5000 then return jsonb_build_object('ok', false, 'code', 'DOCUMENT_TOO_LARGE'); end if;
  v_nom := left(coalesce(nullif(btrim(p_hujjat->'context'->>'title'), ''), nullif(btrim(p_hujjat->'context'->>'objectLabel'), ''), ''), 300);

  select * into v_row from public.t2_smeta_studio_qoralama where kompaniya_id = p_kompaniya_id and draft_uid = p_draft_uid for update;
  if not found then
    if coalesce(p_expected_version, -1) <> 0 then return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'versiya', null); end if;
    insert into public.t2_smeta_studio_qoralama (kompaniya_id, obyekt_id, draft_uid, nom, katalog_revision, hujjat, bolim_soni, ish_soni, yaratdi_actor, yangiladi_actor)
    values (p_kompaniya_id, p_obyekt_id, p_draft_uid, v_nom, left(p_hujjat->'occurrences'->(select k from jsonb_object_keys(p_hujjat->'occurrences') k limit 1)->'source'->>'catalogRevision', 64),
            p_hujjat, v_bolim, v_ish, p_actor_id, p_actor_id)
    returning * into v_row;
  else
    if v_row.holat <> 'qoralama' then return jsonb_build_object('ok', false, 'code', 'DRAFT_ARCHIVED'); end if;
    if p_expected_version is distinct from v_row.versiya then
      return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'versiya', v_row.versiya);
    end if;
    update public.t2_smeta_studio_qoralama set obyekt_id = p_obyekt_id, nom = v_nom, hujjat = p_hujjat, bolim_soni = v_bolim, ish_soni = v_ish,
      versiya = versiya + 1, yangiladi_actor = p_actor_id, yangilandi = now()
    where id = v_row.id returning * into v_row;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'smeta_studio_saqla', 'smeta', p_obyekt_id,
    'qoralama ' || v_row.id || ' v' || v_row.versiya || ' (' || v_bolim || ' bo''lim, ' || v_ish || ' ish)', 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'id', v_row.id, 'draft_uid', v_row.draft_uid, 'versiya', v_row.versiya, 'yangilandi', v_row.yangilandi);
  insert into public.t2_kompaniya_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'smeta_studio_saqla_v1', v_res);
  return v_res;
end $$;

create or replace function public.t2_smeta_studio_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  return jsonb_build_object('ok', true, 'qoralamalar', coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'draft_uid', q.draft_uid, 'nom', q.nom, 'obyekt_id', q.obyekt_id, 'obyekt', o.nom,
      'versiya', q.versiya, 'bolim_soni', q.bolim_soni, 'ish_soni', q.ish_soni, 'yangilandi', q.yangilandi) order by q.yangilandi desc)
    from (select * from public.t2_smeta_studio_qoralama where kompaniya_id = p_kompaniya_id and holat = 'qoralama' order by yangilandi desc limit 200) q
    left join public.t2_obyekt o on o.id = q.obyekt_id), '[]'::jsonb));
end $$;

create or replace function public.t2_smeta_studio_ol_v1(p_actor_id bigint, p_kompaniya_id bigint, p_draft_uid uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare v_row public.t2_smeta_studio_qoralama%rowtype;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select * into v_row from public.t2_smeta_studio_qoralama where kompaniya_id = p_kompaniya_id and draft_uid = p_draft_uid;
  if not found then return jsonb_build_object('ok', false, 'code', 'DRAFT_NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'versiya', v_row.versiya, 'obyekt_id', v_row.obyekt_id, 'holat', v_row.holat, 'hujjat', v_row.hujjat);
end $$;

revoke all on function public.t2_smeta_studio_saqla_v1(bigint, bigint, bigint, uuid, integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.t2_smeta_studio_royxat_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_smeta_studio_ol_v1(bigint, bigint, uuid) from public, anon, authenticated;
grant execute on function public.t2_smeta_studio_saqla_v1(bigint, bigint, bigint, uuid, integer, jsonb, uuid) to service_role;
grant execute on function public.t2_smeta_studio_royxat_v1(bigint, bigint) to service_role;
grant execute on function public.t2_smeta_studio_ol_v1(bigint, bigint, uuid) to service_role;

commit;
