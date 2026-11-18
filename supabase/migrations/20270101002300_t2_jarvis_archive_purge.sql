-- Private lifecycle metadata only. R2 retains no transcript after purge.
set local lock_timeout = '3s';

create table public.t2_jarvis_suhbat_r2_purge (
  suhbat_id bigint not null check (suhbat_id > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  due_at timestamptz,
  primary key (suhbat_id, sha256)
);
create index t2_jarvis_suhbat_r2_purge_due_idx on public.t2_jarvis_suhbat_r2_purge (due_at, suhbat_id, sha256) where due_at is not null;
alter table public.t2_jarvis_suhbat_r2_purge enable row level security;
revoke all on public.t2_jarvis_suhbat_r2_purge from public, anon, authenticated;
grant select, insert, update, delete on public.t2_jarvis_suhbat_r2_purge to service_role;

-- Reserve the exact key before R2 I/O. The row lock serializes this with deletion, including a cascade.
create function public.t2_jarvis_suhbat_archive_stage_v1(p_row bigint, p_sha256 text, p_bytes integer)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare body text;
begin
  if coalesce(p_row, 0) <= 0 or coalesce(p_sha256, '') !~ '^[a-f0-9]{64}$'
     or coalesce(p_bytes, 0) not between 1 and 524288 then
    return jsonb_build_object('ok', false, 'code', 'JARVIS_ARCHIVE_INVALID');
  end if;
  select jsonb_build_object('v', 1, 'row', id::text, 'turns', xabarlar)::text into body
  from public.t2_jarvis_suhbat
  where id = p_row and xabarlar is not null and yangilandi < now() - interval '90 days'
  for share;
  if body is null or octet_length(body) <> p_bytes
     or encode(sha256(convert_to(body, 'UTF8')), 'hex') <> p_sha256 then
    return jsonb_build_object('ok', true, 'staged', false);
  end if;
  insert into public.t2_jarvis_suhbat_r2_purge (suhbat_id, sha256)
  values (p_row, p_sha256) on conflict (suhbat_id, sha256) do nothing;
  return jsonb_build_object('ok', true, 'staged', true);
end
$$;

create function public._t2_jarvis_suhbat_archive_deleted_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.t2_jarvis_suhbat_r2_purge set due_at = now() where suhbat_id = old.id;
  -- Previously committed archives may predate the reservation table.
  if old.archive_sha256 is not null then
    insert into public.t2_jarvis_suhbat_r2_purge (suhbat_id, sha256, due_at)
    values (old.id, old.archive_sha256, now()) on conflict (suhbat_id, sha256) do nothing;
  end if;
  return old;
end
$$;
create trigger t2_jarvis_suhbat_archive_deleted after delete on public.t2_jarvis_suhbat
  for each row execute function public._t2_jarvis_suhbat_archive_deleted_v1();

create function public.t2_jarvis_suhbat_archive_purge_pick_v1(p_limit integer default 20)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('row', suhbat_id::text, 'sha256', sha256)
      order by due_at, suhbat_id, sha256), '[]'::jsonb)
  from (
    select q.suhbat_id, q.sha256, q.due_at from public.t2_jarvis_suhbat_r2_purge q
    where q.due_at <= now() and not exists (select 1 from public.t2_jarvis_suhbat s where s.id = q.suhbat_id)
    order by q.due_at, q.suhbat_id, q.sha256 limit greatest(0, least(coalesce(p_limit, 20), 20))
  ) due
$$;

create function public.t2_jarvis_suhbat_archive_purge_ack_v1(p_row bigint, p_sha256 text)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  with acknowledged as (
    delete from public.t2_jarvis_suhbat_r2_purge q
    where q.suhbat_id = p_row and q.sha256 = p_sha256 and q.due_at <= now()
      and not exists (select 1 from public.t2_jarvis_suhbat s where s.id = q.suhbat_id)
    returning 1
  )
  select jsonb_build_object('ok', true, 'acknowledged', exists (select 1 from acknowledged))
$$;

revoke all on function public._t2_jarvis_suhbat_archive_deleted_v1() from public, anon, authenticated;
revoke all on function public.t2_jarvis_suhbat_archive_stage_v1(bigint,text,integer) from public, anon, authenticated;
revoke all on function public.t2_jarvis_suhbat_archive_purge_pick_v1(integer) from public, anon, authenticated;
revoke all on function public.t2_jarvis_suhbat_archive_purge_ack_v1(bigint,text) from public, anon, authenticated;
grant execute on function public.t2_jarvis_suhbat_archive_stage_v1(bigint,text,integer) to service_role;
grant execute on function public.t2_jarvis_suhbat_archive_purge_pick_v1(integer) to service_role;
grant execute on function public.t2_jarvis_suhbat_archive_purge_ack_v1(bigint,text) to service_role;
