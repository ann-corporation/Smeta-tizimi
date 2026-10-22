-- BOSH_REJA Bosqich 2 «Billing ledger: token sarf/qaytarish server tomonda saga (REFUND_PENDING), operator ko'radi».
-- Muammo: sarf serverda, lekin amal yiqilganda qaytarishni BRAUZER boshqarardi (localStorage navbati) — brauzer yopilsa
-- yoki tarmoq uzilsa token jim yo'qolardi; muvaffaqiyatli qaytarishning javobi yo'qolsa qayta urinish xato qaytarib
-- navbat abadiy qolardi; 24 soatdan keyin hech kim qaytara olmasdi.
-- Yechim (daftar o'zgarmaydi — t2_token_harakat o'zgarmas bo'lib qoladi):
--   • t2_token_saga — har sarfning natija holati: band → yakunlandi | qaytarildi (trigger avtomatik yuritadi);
--   • mijoz amal muvaffaqiyatli tugaganini tasdiqlaydi (t2_token_yakunla_v1);
--   • 30 daqiqadan ko'p «band» qolgan sarf — QAYTARISH KUTILMOQDA: superadmin panelida ko'rinadi va bir bosishda
--     qaytariladi yoki yakunlangan deb belgilanadi (muddat cheklovisiz, sabab va audit bilan);
--   • t2_token_qaytar_v1: allaqachon qaytarilgan sarfga takror so'rov — muvaffaqiyat (idempotent), xato emas.
-- Eski sarflar (migratsiyagacha) sagaga kirmaydi — ularning natijasi noma'lum, operatorni shovqin bilan to'ldirmaydi.

create table if not exists public.t2_token_saga (
  sarf_operation_id uuid primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  foydalanuvchi_id bigint,
  amal text,
  token numeric not null,
  holat text not null default 'band' check (holat in ('band', 'yakunlandi', 'qaytarildi')),
  sabab text check (sabab is null or length(sabab) <= 500),
  hal_actor_id bigint,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create index if not exists t2_token_saga_band_idx on public.t2_token_saga (yaratildi) where holat = 'band';
create index if not exists t2_token_saga_kompaniya_idx on public.t2_token_saga (kompaniya_id, yaratildi desc);
alter table public.t2_token_saga enable row level security;
revoke all on table public.t2_token_saga from anon, authenticated;

-- Daftar → saga: sarf yozilganda «band», qaytarish yozilganda «qaytarildi».
create or replace function public._t2_token_saga_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.tur = 'sarf' and new.miqdor < 0 and new.operation_id is not null then
    insert into public.t2_token_saga (sarf_operation_id, kompaniya_id, foydalanuvchi_id, amal, token)
    values (new.operation_id, new.kompaniya_id, new.foydalanuvchi_id, new.amal, -new.miqdor)
    on conflict (sarf_operation_id) do nothing;
  elsif new.tur = 'qaytarish' and new.bogliq_operation_id is not null then
    update public.t2_token_saga set holat = 'qaytarildi', sabab = coalesce(left(new.izoh, 500), sabab), yangilandi = now()
     where sarf_operation_id = new.bogliq_operation_id;
  end if;
  return new;
end $$;
drop trigger if exists t2_token_saga_trg on public.t2_token_harakat;
create trigger t2_token_saga_trg after insert on public.t2_token_harakat for each row execute function public._t2_token_saga_trg();

-- Mijoz: amal muvaffaqiyatli tugadi (idempotent). Faqat shu kompaniya a'zosi va faqat «band» sarf.
create or replace function public.t2_token_yakunla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sarf_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.t2_token_saga%rowtype;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  select * into v from public.t2_token_saga where sarf_operation_id = p_sarf_operation_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', true, 'saga', false); end if;  -- bepul / eski sarf: yakunlash shart emas
  if v.holat = 'band' then
    update public.t2_token_saga set holat = 'yakunlandi', yangilandi = now() where sarf_operation_id = v.sarf_operation_id;
    return jsonb_build_object('ok', true, 'holat', 'yakunlandi');
  end if;
  return jsonb_build_object('ok', true, 'holat', v.holat, 'takror', true);
end $$;

-- Qaytarish: takror so'rov endi muvaffaqiyat (javob yo'lda yo'qolsa ham navbat tozalanadi). Qolgani avvalgidek.
create or replace function public.t2_token_qaytar_v1(p_actor_id bigint, p_kompaniya_id bigint, p_sarf_operation_id uuid, p_operation_id uuid, p_sabab text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_sarf public.t2_token_harakat%rowtype;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if exists (select 1 from public.t2_token_harakat where operation_id = p_operation_id) then return jsonb_build_object('ok', true, 'takror', true); end if;
  select * into v_sarf from public.t2_token_harakat where operation_id = p_sarf_operation_id and kompaniya_id = p_kompaniya_id and tur = 'sarf';
  if not found then return jsonb_build_object('ok', false, 'code', 'SARF_TOPILMADI'); end if;
  if exists (select 1 from public.t2_token_harakat where bogliq_operation_id = p_sarf_operation_id and tur = 'qaytarish') then
    return jsonb_build_object('ok', true, 'takror', true, 'code', 'ALLAQACHON_QAYTARILGAN', 'balans', public.t2_token_balans(p_kompaniya_id));
  end if;
  if exists (select 1 from public.t2_token_saga where sarf_operation_id = p_sarf_operation_id and holat = 'yakunlandi') then
    return jsonb_build_object('ok', false, 'code', 'YAKUNLANGAN', 'xabar', 'Amal muvaffaqiyatli yakunlangan — token qaytarilmaydi.');
  end if;
  if v_sarf.yaratildi < now() - interval '24 hours' then return jsonb_build_object('ok', false, 'code', 'MUDDAT_OTGAN'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_token:' || p_kompaniya_id, 0));
  insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, izoh, operation_id, bogliq_operation_id)
  values (p_kompaniya_id, p_actor_id, -v_sarf.miqdor, 'qaytarish', v_sarf.amal, left(coalesce(p_sabab, ''), 300), p_operation_id, p_sarf_operation_id);
  return jsonb_build_object('ok', true, 'qaytarildi', -v_sarf.miqdor, 'balans', public.t2_token_balans(p_kompaniya_id));
end $function$;

-- Operator (superadmin): natijasi noma'lum qolgan sarflar — QAYTARISH KUTILMOQDA.
create or replace function public.t2_boshqaruv_token_saga_v1(p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  return jsonb_build_object('ok', true, 'kutilmoqda', coalesce((
    select jsonb_agg(jsonb_build_object('sarf_operation_id', s.sarf_operation_id, 'kompaniya_id', s.kompaniya_id, 'kompaniya', k.nom,
             'kim', f.login, 'amal', s.amal, 'token', s.token, 'yaratildi', s.yaratildi,
             'hujjat', h.meta->>'hujjat', 'obyekt', h.meta->>'obyekt') order by s.yaratildi)
      from public.t2_token_saga s
      join public.t2_kompaniya k on k.id = s.kompaniya_id
      left join public.t2_foydalanuvchi f on f.id = s.foydalanuvchi_id
      left join public.t2_token_harakat h on h.operation_id = s.sarf_operation_id
     where s.holat = 'band' and s.yaratildi < now() - interval '30 minutes'), '[]'::jsonb));
end $$;

-- Operator qarori: «qaytar» (muddat cheklovisiz) yoki «yakunlandi». Sabab majburiy, audit yoziladi.
create or replace function public.t2_boshqaruv_token_saga_hal_v1(p_actor_id bigint, p_sarf_operation_id uuid, p_qaror text, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.t2_token_saga%rowtype; v_sarf public.t2_token_harakat%rowtype; v_op uuid;
begin
  perform public._t2_boshqaruv_tekshir(p_actor_id);
  if p_qaror not in ('qaytar', 'yakunlandi') then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI'); end if;
  if length(btrim(coalesce(p_sabab, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'SABAB_KERAK', 'error', 'Sabab kerak'); end if;
  select * into v from public.t2_token_saga where sarf_operation_id = p_sarf_operation_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  if v.holat <> 'band' then return jsonb_build_object('ok', true, 'takror', true, 'holat', v.holat); end if;
  if p_qaror = 'yakunlandi' then
    update public.t2_token_saga set holat = 'yakunlandi', sabab = left(p_sabab, 500), hal_actor_id = p_actor_id, yangilandi = now()
     where sarf_operation_id = v.sarf_operation_id;
  else
    select * into v_sarf from public.t2_token_harakat where operation_id = v.sarf_operation_id and tur = 'sarf';
    if not found then return jsonb_build_object('ok', false, 'code', 'SARF_TOPILMADI'); end if;
    v_op := md5('token-saga-qaytar:' || v.sarf_operation_id::text)::uuid;
    perform pg_advisory_xact_lock(hashtextextended('t2_token:' || v.kompaniya_id, 0));
    insert into public.t2_token_harakat(kompaniya_id, foydalanuvchi_id, miqdor, tur, amal, izoh, operation_id, bogliq_operation_id, meta)
    values (v.kompaniya_id, p_actor_id, -v_sarf.miqdor, 'qaytarish', v_sarf.amal, left('Operator: ' || p_sabab, 300), v_op, v.sarf_operation_id,
            jsonb_build_object('operator', true))
    on conflict do nothing;
    update public.t2_token_saga set holat = 'qaytarildi', sabab = left(p_sabab, 500), hal_actor_id = p_actor_id, yangilandi = now()
     where sarf_operation_id = v.sarf_operation_id;
  end if;
  perform public.t2_audit_yoz(v.kompaniya_id, 'token_saga_hal', 'token', null,
    format('sarf=%s qaror=%s token=%s sabab=%s', v.sarf_operation_id, p_qaror, v.token, left(p_sabab, 200)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'holat', case when p_qaror = 'qaytar' then 'qaytarildi' else 'yakunlandi' end,
                            'balans', public.t2_token_balans(v.kompaniya_id));
end $$;

revoke all on function public._t2_token_saga_trg() from public, anon, authenticated;
revoke all on function public.t2_token_yakunla_v1(bigint, bigint, uuid) from public, anon, authenticated;
revoke all on function public.t2_token_qaytar_v1(bigint, bigint, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.t2_boshqaruv_token_saga_v1(bigint) from public, anon, authenticated;
revoke all on function public.t2_boshqaruv_token_saga_hal_v1(bigint, uuid, text, text) from public, anon, authenticated;
grant execute on function public.t2_token_yakunla_v1(bigint, bigint, uuid) to service_role;
grant execute on function public.t2_token_qaytar_v1(bigint, bigint, uuid, uuid, text) to service_role;
grant execute on function public.t2_boshqaruv_token_saga_v1(bigint) to service_role;
grant execute on function public.t2_boshqaruv_token_saga_hal_v1(bigint, uuid, text, text) to service_role;
