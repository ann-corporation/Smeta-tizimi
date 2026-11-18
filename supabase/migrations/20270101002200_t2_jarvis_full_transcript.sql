-- Extended history. Capacity errors never evict messages.

set local lock_timeout = '3s';

alter table public.t2_jarvis_suhbat
  drop constraint t2_jarvis_suhbat_xabarlar_check,
  drop constraint t2_jarvis_suhbat_archive_bytes_check,
  add constraint t2_jarvis_suhbat_xabarlar_check check (
    xabarlar is null or (jsonb_typeof(xabarlar) = 'array' and jsonb_array_length(xabarlar) <= 256 and octet_length(xabarlar::text) <= 524000)) not valid,
  add constraint t2_jarvis_suhbat_archive_bytes_check check (archive_bytes is null or archive_bytes between 1 and 524288) not valid;

create or replace function public.t2_jarvis_suhbat_mutate_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_klient_id text, p_etag text, p_amal text,
  p_sarlavha text default null, p_xabarlar jsonb default null, p_operation_id uuid default null
)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  scope jsonb;
  current_row public.t2_jarvis_suhbat;
  snapshot jsonb;
  title text;
  messages jsonb;
  receipt public.t2_jarvis_suhbat_create_receipt;
  append_receipt public.t2_jarvis_suhbat_append_receipt;
  request_fingerprint text;
begin
  if p_actor_id is null or p_actor_id < 1 or p_kompaniya_id is null or p_kompaniya_id < 1
     or coalesce(p_klient_id,'') !~ '^[A-Za-z0-9_.-]{1,40}$'
     or coalesce(p_amal,'') not in ('create','rename','delete','append')
     or (p_operation_id is not null and p_amal <> 'append')
     or (case when p_amal = 'create' then p_etag is not null else coalesce(p_etag,'') !~ '^[a-f0-9]{32}$' end) then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_INVALID');
  end if;
  title := btrim(regexp_replace(p_sarlavha, '\s+', ' ', 'g'));
  if (p_amal = 'rename' and (coalesce(length(title), 0) not between 1 and 80 or p_xabarlar is not null))
      or (p_amal = 'create' and coalesce(length(title), 0) not between 1 and 80)
      or (p_amal not in ('rename','create') and p_sarlavha is not null)
      or (p_amal not in ('append','create') and p_xabarlar is not null) then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_INVALID');
  end if;
  if p_amal in ('append','create') then
    if jsonb_typeof(p_xabarlar) is distinct from 'array' then
      return jsonb_build_object('ok', false, 'code', 'SUHBAT_INVALID');
    end if;
    select jsonb_agg(jsonb_build_object('r', e ->> 'r', 'm', e ->> 'm') order by n)
    into messages from jsonb_array_elements(p_xabarlar) with ordinality turn(e,n);
    if jsonb_array_length(p_xabarlar) not between 1 and 12 or octet_length(p_xabarlar::text) > 262144 or exists (
      select 1 from jsonb_array_elements(p_xabarlar) e
      where jsonb_typeof(e) is distinct from 'object'
        or coalesce(e ->> 'r','') not in ('user','ai') or jsonb_typeof(e -> 'm') is distinct from 'string'
        or length(e ->> 'm') > 16000 or length(btrim(e ->> 'm')) = 0
    ) then
      return jsonb_build_object('ok', false, 'code', 'SUHBAT_INVALID');
    end if;
  end if;

  scope := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not coalesce((scope ->> 'ok')::boolean, false) then
    return coalesce(scope, jsonb_build_object('ok', false, 'code', 'COMPANY_ACCESS_DENIED'));
  end if;
  if p_amal = 'create' then
    perform pg_advisory_xact_lock(hashtextextended(
      jsonb_build_array('jarvis-create', p_actor_id, p_kompaniya_id)::text, 0));
    select * into receipt from public.t2_jarvis_suhbat_create_receipt
    where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id and klient_id = p_klient_id;
    if found then
      select * into current_row from public.t2_jarvis_suhbat
      where id = receipt.suhbat_id and foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id
        and klient_id = p_klient_id for update;
      if not found then
        return jsonb_build_object('ok', false, 'code', 'SUHBAT_NOT_FOUND');
      end if;
      snapshot := public._t2_jarvis_suhbat_snapshot_v1(current_row);
      if snapshot ->> 'etag' is distinct from receipt.etag
         or current_row.sarlavha is distinct from title or current_row.xabarlar is distinct from messages then
        return jsonb_build_object('ok', false, 'code', 'SUHBAT_CONFLICT');
      end if;
    else
      insert into public.t2_jarvis_suhbat (foydalanuvchi_id, kompaniya_id, klient_id, sarlavha, xabarlar, qisqartma, yangilandi)
      values (p_actor_id, p_kompaniya_id, p_klient_id, title, messages, left(messages -> -1 ->> 'm', 600), clock_timestamp())
      on conflict (foydalanuvchi_id, kompaniya_id, klient_id) do nothing returning * into current_row;
      if not found then
        return jsonb_build_object('ok', false, 'code', 'SUHBAT_CONFLICT');
      end if;
      snapshot := public._t2_jarvis_suhbat_snapshot_v1(current_row);
      insert into public.t2_jarvis_suhbat_create_receipt (foydalanuvchi_id, kompaniya_id, klient_id, suhbat_id, etag)
      values (p_actor_id, p_kompaniya_id, p_klient_id, current_row.id, snapshot ->> 'etag');
      perform public._t2_jarvis_suhbat_tozala(p_actor_id, p_kompaniya_id);
    end if;
    return jsonb_build_object('ok', true, 'id', p_klient_id, 'etag', snapshot ->> 'etag');
  end if;
  select * into current_row from public.t2_jarvis_suhbat
  where foydalanuvchi_id = p_actor_id and kompaniya_id = p_kompaniya_id and klient_id = p_klient_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_NOT_FOUND');
  end if;
  if p_operation_id is not null then
    request_fingerprint := encode(sha256(convert_to(jsonb_build_array(p_etag, messages)::text, 'UTF8')), 'hex');
    select * into append_receipt from public.t2_jarvis_suhbat_append_receipt
    where suhbat_id = current_row.id and operation_id = p_operation_id;
    if found then
      if request_fingerprint is distinct from append_receipt.fingerprint then
        return jsonb_build_object('ok', false, 'code', 'SUHBAT_CONFLICT');
      end if;
      return jsonb_build_object('ok', true, 'id', p_klient_id, 'etag', append_receipt.etag);
    end if;
  end if;
  snapshot := public._t2_jarvis_suhbat_snapshot_v1(current_row);
  if p_etag is distinct from snapshot ->> 'etag' then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_CONFLICT');
  end if;
  if p_amal = 'delete' then
    delete from public.t2_jarvis_suhbat where id = current_row.id;
    return jsonb_build_object('ok', true, 'id', p_klient_id, 'holat', 'missing');
  elsif p_amal = 'rename' then
    update public.t2_jarvis_suhbat set sarlavha = title where id = current_row.id returning * into current_row;
  else
    if snapshot -> 'xabarlar' = 'null'::jsonb then
      return jsonb_build_object('ok', false, 'code', 'SUHBAT_HISTORY_NOT_AVAILABLE');
    end if;
    messages := current_row.xabarlar || messages;
    if jsonb_array_length(messages) > 256 or octet_length(messages::text) > 524000 then
      return jsonb_build_object('ok', false, 'code', 'SUHBAT_FULL');
    end if;
    update public.t2_jarvis_suhbat set xabarlar = messages,
      yangilandi = greatest(clock_timestamp(), current_row.yangilandi + interval '1 microsecond'),
      qisqartma = left((select e ->> 'm' from jsonb_array_elements(messages) with ordinality t(e,n) order by n desc limit 1), 600)
    where id = current_row.id returning * into current_row;
  end if;
  snapshot := public._t2_jarvis_suhbat_snapshot_v1(current_row);
  if p_operation_id is not null then
    insert into public.t2_jarvis_suhbat_append_receipt (suhbat_id, operation_id, fingerprint, etag)
    values (current_row.id, p_operation_id, request_fingerprint, snapshot ->> 'etag');
    delete from public.t2_jarvis_suhbat_append_receipt where suhbat_id = current_row.id and operation_id in (
      select operation_id from public.t2_jarvis_suhbat_append_receipt
      where suhbat_id = current_row.id order by yozildi desc, operation_id desc offset 64
    );
  end if;
  return jsonb_build_object('ok', true, 'id', p_klient_id, 'etag', snapshot ->> 'etag');
end
$$;

create or replace function public.t2_jarvis_suhbat_archive_commit_v1(p_row bigint, p_sha256 text, p_bytes integer)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare body text;
begin
  if coalesce(p_row, 0) < 1 or coalesce(p_sha256, '') !~ '^[a-f0-9]{64}$'
     or coalesce(p_bytes, 0) not between 1 and 524288 then
    return jsonb_build_object('ok', false, 'code', 'JARVIS_ARCHIVE_INVALID');
  end if;
  select jsonb_build_object('v', 1, 'row', id::text, 'turns', xabarlar)::text into body
  from public.t2_jarvis_suhbat
  where id = p_row and xabarlar is not null and yangilandi < now() - interval '90 days'
  for update;
  if not found or octet_length(convert_to(body, 'UTF8')) <> p_bytes
     or encode(sha256(convert_to(body, 'UTF8')), 'hex') <> p_sha256 then
    return jsonb_build_object('ok', true, 'archived', false);
  end if;
  update public.t2_jarvis_suhbat set archive_sha256 = p_sha256, archive_bytes = p_bytes, xabarlar = null where id = p_row;
  return jsonb_build_object('ok', true, 'archived', true);
end
$$;

create or replace function public.t2_jarvis_suhbat_archive_restore_v1(p_row bigint, p_body text)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  packet jsonb;
  size_bytes integer;
  changed integer;
begin
  if coalesce(p_row, 0) < 1 or coalesce(octet_length(p_body), 0) not between 1 and 524288 then
    return jsonb_build_object('ok', false, 'code', 'JARVIS_ARCHIVE_INVALID');
  end if;
  packet := p_body::jsonb;
  if packet ->> 'v' is distinct from '1' or packet ->> 'row' is distinct from p_row::text
     or jsonb_typeof(packet -> 'turns') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'code', 'JARVIS_ARCHIVE_INVALID');
  end if;
  size_bytes := octet_length(convert_to(p_body, 'UTF8'));
  update public.t2_jarvis_suhbat set xabarlar = packet -> 'turns', archive_sha256 = null, archive_bytes = null
  where id = p_row and xabarlar is null and archive_bytes = size_bytes
    and archive_sha256 = encode(sha256(convert_to(p_body, 'UTF8')), 'hex');
  get diagnostics changed = row_count;
  return jsonb_build_object('ok', true, 'restored', changed = 1);
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'code', 'JARVIS_ARCHIVE_INVALID');
end
$$;

create or replace function public.t2_jarvis_suhbat_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_klient_id text, p_sarlavha text, p_xabarlar jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g jsonb; v_x jsonb; v_qisqa text; v_birinchi text; v_oxirgi text;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, p_kompaniya_id);
  if not (g ->> 'ok')::boolean then return g; end if;
  if p_klient_id is null or p_klient_id !~ '^[A-Za-z0-9_.-]{1,40}$' or coalesce(length(btrim(p_sarlavha)), 0) not between 1 and 200
     or p_xabarlar is null or jsonb_typeof(p_xabarlar) <> 'array' or jsonb_array_length(p_xabarlar) > 60 then
    return jsonb_build_object('ok', false, 'code', 'SUHBAT_INVALID');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('r', case when s.e ->> 'r' = 'user' then 'user' else 'ai' end, 'm', left(regexp_replace(coalesce(s.e ->> 'm', ''), '\s+', ' ', 'g'), 400)) order by s.n), '[]'::jsonb)
    into v_x from (select t.e, t.n from jsonb_array_elements(p_xabarlar) with ordinality as t(e, n) where length(coalesce(t.e ->> 'm', '')) > 0 order by t.n desc limit 12) s;
  if jsonb_array_length(v_x) = 0 then return jsonb_build_object('ok', false, 'code', 'SUHBAT_BOSH'); end if;
  v_birinchi := (select e ->> 'm' from jsonb_array_elements(v_x) e where e ->> 'r' = 'user' limit 1);
  v_oxirgi := (select e ->> 'm' from jsonb_array_elements(v_x) with ordinality t(e, n) where e ->> 'r' = 'ai' order by n desc limit 1);
  v_qisqa := left('Savol: ' || coalesce(v_birinchi, '') || coalesce(' | Javob: ' || v_oxirgi, ''), 600);
  insert into public.t2_jarvis_suhbat (kompaniya_id, foydalanuvchi_id, klient_id, sarlavha, qisqartma, xabarlar)
  values (p_kompaniya_id, p_actor_id, p_klient_id, left(regexp_replace(btrim(p_sarlavha), '\s+', ' ', 'g'), 80), v_qisqa, v_x)
  on conflict (foydalanuvchi_id, kompaniya_id, klient_id)
  do update set sarlavha = excluded.sarlavha, qisqartma = excluded.qisqartma, xabarlar = excluded.xabarlar, yangilandi = now()
  where public.t2_jarvis_suhbat.archive_sha256 is null
    and jsonb_array_length(public.t2_jarvis_suhbat.xabarlar) <= 12
    and not exists (select 1 from public.t2_jarvis_suhbat_create_receipt r
                    where r.suhbat_id = public.t2_jarvis_suhbat.id)
    and not exists (select 1 from public.t2_jarvis_suhbat_append_receipt r
                    where r.suhbat_id = public.t2_jarvis_suhbat.id)
    and not exists (select 1 from jsonb_array_elements(public.t2_jarvis_suhbat.xabarlar) e
                    where length(e ->> 'm') > 400);
  if not found then return jsonb_build_object('ok', false, 'code', 'SUHBAT_CONFLICT'); end if;
  perform public._t2_jarvis_suhbat_tozala(p_actor_id, p_kompaniya_id);
  return jsonb_build_object('ok', true);
end $$;
