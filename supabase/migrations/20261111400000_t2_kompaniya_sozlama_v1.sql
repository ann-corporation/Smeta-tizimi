-- AKKAUNT-KIRISH-20261026 / SOZLAMA-MARKAZ — kompaniya darajasidagi sozlamalar BITTA server joyida.
-- Egasi (2026-10-26): «sozlamalar juda tarqoq … kompaniyada admin panelida hammasi boshqarilishi kerak».
--
-- Avval: hujjat imzo tomonlari (HujjatTomonlari) va hujjat dizayni (rasmiy.ts) faqat brauzer localStorage'da —
-- boshqa kompyuterda yoki boshqa xodimda yo'qolardi; F2 tasdiq rejimi (t2_kompaniya.f2_tasdiq_rejimi) ni
-- o'zgartiradigan hech qanday UI/RPC yo'q edi.
-- Endi: t2_kompaniya_sozlama (kompaniya_id, kalit) → jsonb, ruxsat etilgan kalitlar ro'yxati bilan;
--       o'qish — company.read, yozish — company.profile.update (t2_effective_authorization_v1, yagona haqiqat).
--       F2 tasdiq rejimi ham shu RPC orqali (ustun t2_kompaniya da qoladi — SoD trigger o'shani o'qiydi).
-- Har yozuv audit (t2_audit_yoz) va operation_id idempotent (t2_kompaniya_command_log).

begin;

create table if not exists public.t2_kompaniya_sozlama (
  kompaniya_id   bigint not null references public.t2_kompaniya(id) on delete cascade,
  kalit          text   not null check (kalit in ('hujjat.imzo_tomonlari', 'hujjat.dizayn')),
  qiymat         jsonb  not null,
  yangilagan_id  bigint,
  yangilangan_at timestamptz not null default now(),
  primary key (kompaniya_id, kalit)
);
comment on table public.t2_kompaniya_sozlama is
  'Kompaniya darajasidagi sozlamalar (kalit → jsonb). Faqat t2_kompaniya_sozlama_*_v1 RPC orqali (service_role).';
alter table public.t2_kompaniya_sozlama enable row level security;
revoke all on public.t2_kompaniya_sozlama from public, anon, authenticated;

-- ── O'qish ──
create or replace function public.t2_kompaniya_sozlama_ol_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_auth jsonb;
  v_yoz jsonb;
  v_k public.t2_kompaniya%rowtype;
  v_s jsonb;
begin
  if p_actor_id is null or p_actor_id <= 0 or p_kompaniya_id is null or p_kompaniya_id <= 0 then
    return jsonb_build_object('ok', false, 'code', 'REQUEST_INVALID');
  end if;
  v_auth := public.t2_effective_authorization_v1(p_actor_id, p_kompaniya_id, null, null, 'company.read', null);
  if coalesce((v_auth->>'allowed')::boolean, false) is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'AUTHORIZATION_DENIED', 'reason', v_auth->>'reason');
  end if;
  select * into v_k from public.t2_kompaniya where id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'COMPANY_NOT_FOUND'); end if;
  v_yoz := public.t2_effective_authorization_v1(p_actor_id, p_kompaniya_id, null, null, 'company.profile.update', null);
  select coalesce(jsonb_object_agg(s.kalit, jsonb_build_object('qiymat', s.qiymat, 'yangilangan_at', s.yangilangan_at)), '{}'::jsonb)
    into v_s from public.t2_kompaniya_sozlama s where s.kompaniya_id = p_kompaniya_id;
  return jsonb_build_object(
    'ok', true,
    'kompaniya_id', p_kompaniya_id,
    'mavqe', v_k.mavqe,
    'f2_tasdiq_rejimi', v_k.f2_tasdiq_rejimi,
    'sozlamalar', v_s,
    'yozish_mumkin', coalesce((v_yoz->>'allowed')::boolean, false)
  );
end
$function$;

-- ── Yozish ──
-- p_kalit: 'hujjat.imzo_tomonlari' | 'hujjat.dizayn' | 'f2.tasdiq_rejimi'
-- p_qiymat: jsonb obyekt (birinchi ikkisi) yoki satr 'shaxsiy' | 'korporativ' (oxirgisi). NULL — kalitni o'chirish.
create or replace function public.t2_kompaniya_sozlama_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_kalit text, p_qiymat jsonb, p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prev jsonb;
  v_auth jsonb;
  v_eski text;
  v_natija jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_kompaniya_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  if p_actor_id is null or p_actor_id <= 0 or p_kompaniya_id is null or p_kompaniya_id <= 0 then
    return jsonb_build_object('ok', false, 'code', 'REQUEST_INVALID');
  end if;
  if p_kalit is null or p_kalit not in ('hujjat.imzo_tomonlari', 'hujjat.dizayn', 'f2.tasdiq_rejimi') then
    return jsonb_build_object('ok', false, 'code', 'KALIT_INVALID');
  end if;
  v_auth := public.t2_effective_authorization_v1(p_actor_id, p_kompaniya_id, null, null, 'company.profile.update', null);
  if coalesce((v_auth->>'allowed')::boolean, false) is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'AUTHORIZATION_DENIED', 'reason', v_auth->>'reason');
  end if;
  perform 1 from public.t2_kompaniya where id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'COMPANY_NOT_FOUND'); end if;

  if p_kalit = 'f2.tasdiq_rejimi' then
    if p_qiymat is null or jsonb_typeof(p_qiymat) <> 'string' or (p_qiymat #>> '{}') not in ('shaxsiy', 'korporativ') then
      return jsonb_build_object('ok', false, 'code', 'QIYMAT_INVALID');
    end if;
    select f2_tasdiq_rejimi into v_eski from public.t2_kompaniya where id = p_kompaniya_id;
    update public.t2_kompaniya set f2_tasdiq_rejimi = p_qiymat #>> '{}' where id = p_kompaniya_id;
    if v_eski is distinct from (p_qiymat #>> '{}') then
      perform public.t2_audit_yoz(p_kompaniya_id, 'kompaniya_sozlama', 'company', null,
        format('f2.tasdiq_rejimi: %s -> %s', coalesce(v_eski, '-'), p_qiymat #>> '{}'), 'actor:' || p_actor_id, null);
    end if;
  else
    if p_qiymat is null then
      delete from public.t2_kompaniya_sozlama where kompaniya_id = p_kompaniya_id and kalit = p_kalit;
    else
      if jsonb_typeof(p_qiymat) <> 'object' or length(p_qiymat::text) > 20000 then
        return jsonb_build_object('ok', false, 'code', 'QIYMAT_INVALID');
      end if;
      insert into public.t2_kompaniya_sozlama (kompaniya_id, kalit, qiymat, yangilagan_id, yangilangan_at)
        values (p_kompaniya_id, p_kalit, p_qiymat, p_actor_id, now())
        on conflict (kompaniya_id, kalit) do update
          set qiymat = excluded.qiymat, yangilagan_id = excluded.yangilagan_id, yangilangan_at = excluded.yangilangan_at;
    end if;
    perform public.t2_audit_yoz(p_kompaniya_id, 'kompaniya_sozlama', 'company', null,
      p_kalit || case when p_qiymat is null then ': o''chirildi' else ': yangilandi' end, 'actor:' || p_actor_id, null);
  end if;

  v_natija := jsonb_build_object('ok', true, 'kompaniya_id', p_kompaniya_id, 'kalit', p_kalit);
  insert into public.t2_kompaniya_command_log (operation_id, actor_id, command, natija)
    values (p_operation_id, p_actor_id, 'kompaniya_sozlama_saqla_v1', v_natija);
  return v_natija;
end
$function$;

revoke all on function public.t2_kompaniya_sozlama_ol_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_kompaniya_sozlama_ol_v1(bigint, bigint) to service_role;
revoke all on function public.t2_kompaniya_sozlama_saqla_v1(bigint, bigint, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.t2_kompaniya_sozlama_saqla_v1(bigint, bigint, text, jsonb, uuid) to service_role;

commit;
