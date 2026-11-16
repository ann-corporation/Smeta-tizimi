-- Apply after jarvis-conversation-sync.sql. Enable the existing arxiv-tick opt-in only after clients can read verified archive bodies.
create index t2_jarvis_suhbat_archive_pick_idx on public.t2_jarvis_suhbat (yangilandi, id) where xabarlar is not null;
create function public.t2_jarvis_suhbat_archive_pick_v1(p_limit integer default 10)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('row', selection.id::text, 'body', selection.body)
    order by selection.yangilandi, selection.id), '[]'::jsonb)
  from (
    select id, yangilandi, jsonb_build_object('v', 1, 'row', id::text, 'turns', xabarlar)::text as body
    from public.t2_jarvis_suhbat
    where xabarlar is not null and yangilandi < now() - interval '90 days'
    order by yangilandi, id limit greatest(0, least(coalesce(p_limit, 10), 20))
  ) selection
$$;

create function public.t2_jarvis_suhbat_archive_commit_v1(p_row bigint, p_sha256 text, p_bytes integer)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare body text;
begin
  if coalesce(p_row, 0) < 1 or coalesce(p_sha256, '') !~ '^[a-f0-9]{64}$'
     or coalesce(p_bytes, 0) not between 1 and 32768 then
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

-- Operator recovery before rollback. The archived bytes must match the current pointer.
create function public.t2_jarvis_suhbat_archive_restore_v1(p_row bigint, p_body text)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  packet jsonb;
  size_bytes integer;
  changed integer;
begin
  if coalesce(p_row, 0) < 1 or coalesce(octet_length(p_body), 0) not between 1 and 32768 then
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

revoke all on function public.t2_jarvis_suhbat_archive_pick_v1(integer) from public, anon, authenticated;
revoke all on function public.t2_jarvis_suhbat_archive_commit_v1(bigint,text,integer) from public, anon, authenticated;
revoke all on function public.t2_jarvis_suhbat_archive_restore_v1(bigint,text) from public, anon, authenticated;
grant execute on function public.t2_jarvis_suhbat_archive_pick_v1(integer) to service_role;
grant execute on function public.t2_jarvis_suhbat_archive_commit_v1(bigint,text,integer) to service_role;
grant execute on function public.t2_jarvis_suhbat_archive_restore_v1(bigint,text) to service_role;
