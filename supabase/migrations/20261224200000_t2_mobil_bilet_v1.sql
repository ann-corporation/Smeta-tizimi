-- T2-MOBIL-BILET-V1 (2026-11-15): native ilova WebView biletini BIR MARTALIK qilish (jti/nonce jadvali).
-- ISHLATILMAGAN (apply YO'Q) — egasi tasdig'ini kutadi. Qo'llangach Cloudflare Pages env: MOBIL_BILET_BIR_MARTALIK=1.
-- Atomik: insert ... on conflict do nothing -> ok=false (qayta ishlatilgan). Muddati o'tgan qatorlar har chaqiruvda tozalanadi.
begin;
create table if not exists public.t2_mobil_bilet_ishlatilgan (
  jti text primary key check (char_length(jti) between 16 and 64),
  foydalanuvchi_id bigint not null,
  tugaydi timestamptz not null,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_mobil_bilet_tugaydi_idx on public.t2_mobil_bilet_ishlatilgan (tugaydi);
alter table public.t2_mobil_bilet_ishlatilgan enable row level security;
revoke all on public.t2_mobil_bilet_ishlatilgan from public, anon, authenticated;

create or replace function public.t2_mobil_bilet_ishlat_v1(p_jti text, p_foydalanuvchi_id bigint, p_tugaydi timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if p_jti is null or char_length(p_jti) < 16 or p_foydalanuvchi_id is null or p_foydalanuvchi_id <= 0 or p_tugaydi is null then
    return jsonb_build_object('ok', false, 'code', 'BILET_NOTOGRI');
  end if;
  delete from public.t2_mobil_bilet_ishlatilgan where tugaydi < now() - interval '1 hour';
  insert into public.t2_mobil_bilet_ishlatilgan (jti, foydalanuvchi_id, tugaydi) values (p_jti, p_foydalanuvchi_id, p_tugaydi) on conflict (jti) do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n = 1);
end $$;
revoke all on function public.t2_mobil_bilet_ishlat_v1(text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.t2_mobil_bilet_ishlat_v1(text, bigint, timestamptz) to service_role;
commit;
