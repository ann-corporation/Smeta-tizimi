-- T2-QULF-V1 (2026-11-15): tizim darajasidagi QULF (PIN + passkey/biometrik) va TASDIQ (step-up) poydevori.
-- ISHLATILMAGAN (apply YO'Q) -- egasi tasdig'ini kutadi. Ichida begin/commit YO'Q (tashqi tranzaksiya). Hujjat: docs/architecture/QULF_VA_TASDIQ_V1.md
-- Jadvallar faqat service_role (Pages Functions) orqali; anon/authenticated yopiq. PIN faqat sekin xesh (PBKDF2-SHA256 100k + server pepper), ochiq matn YO'Q.
create table if not exists public.t2_qulf_foydalanuvchi (
  foydalanuvchi_id bigint primary key references public.t2_foydalanuvchi(id) on delete cascade,
  pin_hash text check (pin_hash is null or char_length(pin_hash) between 40 and 300),
  pin_yangilandi timestamptz,
  xato_soni integer not null default 0 check (xato_soni >= 0),
  jami_xato integer not null default 0 check (jami_xato >= 0),
  bloklangan_gacha timestamptz,
  qayta_kirish_vaqti timestamptz,
  bosh_vaqt_daq integer not null default 10 check (bosh_vaqt_daq between 1 and 60),
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);

create table if not exists public.t2_qulf_kalit (
  id bigint generated always as identity primary key,
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id) on delete cascade,
  tur text not null check (tur in ('webauthn', 'android')),
  kredensial_id text not null check (char_length(kredensial_id) between 8 and 1400),
  ochiq_kalit text not null check (char_length(ochiq_kalit) between 40 and 2000), -- SPKI (DER), base64url
  alg integer not null check (alg in (-7, -257)),
  hisob bigint not null default 0 check (hisob >= 0),
  transports text[] not null default '{}',
  qurilma_nomi text check (qurilma_nomi is null or char_length(qurilma_nomi) <= 80),
  yaratildi timestamptz not null default now(),
  oxirgi_ishlatildi timestamptz,
  ochirildi timestamptz
);
create unique index if not exists t2_qulf_kalit_kredensial_uq on public.t2_qulf_kalit (kredensial_id);
create index if not exists t2_qulf_kalit_foydalanuvchi_idx on public.t2_qulf_kalit (foydalanuvchi_id) where ochirildi is null;

create table if not exists public.t2_qulf_siyosat (
  kompaniya_id bigint primary key references public.t2_kompaniya(id) on delete cascade,
  rejim text not null default 'pin' check (rejim in ('off', 'pin', 'biometric_or_pin')),
  yangilagan_id bigint,
  yangilandi timestamptz not null default now()
);

create table if not exists public.t2_qulf_chaqiriq_ishlatilgan (
  jti text primary key check (char_length(jti) between 16 and 64),
  foydalanuvchi_id bigint not null,
  tugaydi timestamptz not null,
  yaratildi timestamptz not null default now()
);
create index if not exists t2_qulf_chaqiriq_tugaydi_idx on public.t2_qulf_chaqiriq_ishlatilgan (tugaydi);

alter table public.t2_qulf_foydalanuvchi enable row level security;
alter table public.t2_qulf_kalit enable row level security;
alter table public.t2_qulf_siyosat enable row level security;
alter table public.t2_qulf_chaqiriq_ishlatilgan enable row level security;
revoke all on public.t2_qulf_foydalanuvchi, public.t2_qulf_kalit, public.t2_qulf_siyosat, public.t2_qulf_chaqiriq_ishlatilgan from public, anon, authenticated;
grant select, insert, update, delete on public.t2_qulf_foydalanuvchi, public.t2_qulf_kalit, public.t2_qulf_siyosat, public.t2_qulf_chaqiriq_ishlatilgan to service_role;
grant usage, select on sequence public.t2_qulf_kalit_id_seq to service_role;

-- PIN urinish natijasi (atomik). Ketma-ket 5 xato -> 15 daqiqa blok; jami 10 xato (muvaffaqiyatsiz) -> qayta_kirish (to'liq qayta kirish shart).
create or replace function public.t2_qulf_urinish_v1(p_foydalanuvchi_id bigint, p_ok boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.t2_qulf_foydalanuvchi%rowtype;
begin
  if p_foydalanuvchi_id is null or p_foydalanuvchi_id <= 0 or p_ok is null then
    return jsonb_build_object('ok', false, 'code', 'URINISH_NOTOGRI');
  end if;
  select * into r from public.t2_qulf_foydalanuvchi where foydalanuvchi_id = p_foydalanuvchi_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'PIN_YOQ'); end if;
  if p_ok then
    update public.t2_qulf_foydalanuvchi set xato_soni = 0, jami_xato = 0, bloklangan_gacha = null, yangilandi = now()
     where foydalanuvchi_id = p_foydalanuvchi_id;
    return jsonb_build_object('ok', true, 'xato_soni', 0);
  end if;
  r.xato_soni := r.xato_soni + 1;
  r.jami_xato := r.jami_xato + 1;
  if r.xato_soni >= 5 then r.bloklangan_gacha := now() + interval '15 minutes'; r.xato_soni := 0; end if;
  if r.jami_xato >= 10 then r.qayta_kirish_vaqti := now(); r.jami_xato := 0; r.xato_soni := 0; r.bloklangan_gacha := null; end if;
  update public.t2_qulf_foydalanuvchi
     set xato_soni = r.xato_soni, jami_xato = r.jami_xato, bloklangan_gacha = r.bloklangan_gacha,
         qayta_kirish_vaqti = r.qayta_kirish_vaqti, yangilandi = now()
   where foydalanuvchi_id = p_foydalanuvchi_id;
  return jsonb_build_object('ok', false, 'code', case when r.qayta_kirish_vaqti is not null and r.qayta_kirish_vaqti >= now() - interval '1 second' then 'QAYTA_KIRISH_KERAK'
                                                      when r.bloklangan_gacha is not null and r.bloklangan_gacha > now() then 'BLOKLANGAN' else 'PIN_NOTOGRI' end,
                            'xato_soni', r.xato_soni, 'bloklangan_gacha', r.bloklangan_gacha);
end $$;

-- Bir martalik challenge (jti) -- takroriy (replay) assertion'ni to'xtatadi.
create or replace function public.t2_qulf_chaqiriq_ishlat_v1(p_jti text, p_foydalanuvchi_id bigint, p_tugaydi timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if p_jti is null or char_length(p_jti) < 16 or p_foydalanuvchi_id is null or p_foydalanuvchi_id <= 0 or p_tugaydi is null then
    return jsonb_build_object('ok', false, 'code', 'CHAQIRIQ_NOTOGRI');
  end if;
  delete from public.t2_qulf_chaqiriq_ishlatilgan where tugaydi < now() - interval '1 hour';
  insert into public.t2_qulf_chaqiriq_ishlatilgan (jti, foydalanuvchi_id, tugaydi) values (p_jti, p_foydalanuvchi_id, p_tugaydi) on conflict (jti) do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n = 1);
end $$;

-- Tasdiq talabi: foydalanuvchida PIN/kalit bormi + kompaniya siyosati. p_kompaniya_id null -> a'zo bo'lgan kompaniyalarning ENG QATTIQ rejimi.
-- Rejim: 'pin' = faqat PIN qabul, 'biometric_or_pin' = PIN yoki biometrik. Talab: 'off' bo'lmasa va foydalanuvchida qabul qilinadigan usul bor.
create or replace function public.t2_qulf_talab_v1(p_foydalanuvchi_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_pin boolean; v_kalit boolean; v_rejim text;
begin
  if p_foydalanuvchi_id is null or p_foydalanuvchi_id <= 0 then return jsonb_build_object('talab', false, 'rejim', 'off'); end if;
  select (pin_hash is not null) into v_pin from public.t2_qulf_foydalanuvchi where foydalanuvchi_id = p_foydalanuvchi_id;
  v_pin := coalesce(v_pin, false);
  select exists (select 1 from public.t2_qulf_kalit where foydalanuvchi_id = p_foydalanuvchi_id and ochirildi is null) into v_kalit;
  if p_kompaniya_id is not null then
    select s.rejim into v_rejim from public.t2_qulf_siyosat s where s.kompaniya_id = p_kompaniya_id;
  else
    select case when bool_or(coalesce(s.rejim, 'pin') = 'biometric_or_pin') then 'biometric_or_pin'
                when bool_or(coalesce(s.rejim, 'pin') = 'pin') then 'pin' else 'off' end
      into v_rejim
      from public.t2_azolik a left join public.t2_qulf_siyosat s on s.kompaniya_id = a.kompaniya_id
     where a.foydalanuvchi_id = p_foydalanuvchi_id and a.holat = 'faol';
  end if;
  v_rejim := coalesce(v_rejim, 'pin');
  return jsonb_build_object(
    'rejim', v_rejim, 'pin', v_pin, 'kalit', v_kalit,
    'talab', v_rejim <> 'off' and (v_pin or (v_kalit and v_rejim = 'biometric_or_pin')));
end $$;

revoke all on function public.t2_qulf_urinish_v1(bigint, boolean) from public, anon, authenticated;
revoke all on function public.t2_qulf_chaqiriq_ishlat_v1(text, bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.t2_qulf_talab_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_qulf_urinish_v1(bigint, boolean) to service_role;
grant execute on function public.t2_qulf_chaqiriq_ishlat_v1(text, bigint, timestamptz) to service_role;
grant execute on function public.t2_qulf_talab_v1(bigint, bigint) to service_role;