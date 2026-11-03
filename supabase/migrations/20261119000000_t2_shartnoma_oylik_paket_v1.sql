-- T2-SHARTNOMA-OYLIK-PAKET-001 - Shartnoma oylik paketi: bir shartnoma x bir oy = bitta paket (versiyalanadi).
-- Egasi (PTO, 2026-11-03): oylik hujjatlar «bir qozonda» edi; endi har shartnoma uchun har oyga alohida paket, «Topshirildi» bilan muhrlanadi.
-- QATTIQ QULF YO'Q: topshirilgandan keyin fakt/F2 o'zgarsa SAQLASH BLOKLANMAYDI - faqat ogohlantirish (tekshir RPC) va arxivda
-- «topshirilgandan keyin o'zgargan» belgisi (royxat RPC saqlangan iz bilan hozirgi izni birga qaytaradi; solishtirish mijozda).
-- DUBLIKAT YASALMAYDI:
--   * ZIP baytlari - MAVJUD kanonik fayl saqlash (R2_CANONICAL + t2_document_registry, /api/hujjat-yukla, turi 'shartnoma_oylik_paket');
--     bu yerda faqat reyestr id si (hujjat_id) va sha256/hajm saqlanadi;
--   * shartnoma -> obyektlar: t2_shartnoma_bog (asosiy) + t2_shartnoma_qoshimcha_bog (mavjud).
-- YANGI: t2_shartnoma_oylik_paket (paket yozuvi), _t2_oy_iz_v1 / _t2_shartnoma_oy_iz_v1 (o'zgarish izi), 3 ta RPC.
-- Iz (server hisoblaydi, mijozga ishonilmaydi): obyekt bo'yicha shu oyning F2 aktlari (id, versiya, holat, lifecycle) va fakt aktlari
-- barmoq izi (soni, maks id, md5(id:versiya:holat)). Bekor qilingan akt ham izga kiradi - bekor qilish ham o'zgarish.
begin;

create table if not exists public.t2_shartnoma_oylik_paket (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  shartnoma_id bigint not null references public.t2_shartnoma(id) on delete cascade,
  oy date not null check (oy = date_trunc('month', oy)::date),
  versiya integer not null check (versiya >= 1),
  holat text not null default 'topshirildi' check (holat in ('topshirildi')),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  hujjat_id bigint references public.t2_document_registry(id) on delete set null,
  zip_sha256 text check (zip_sha256 is null or zip_sha256 ~ '^[0-9a-f]{64}$'),
  zip_olcham bigint check (zip_olcham is null or zip_olcham > 0),
  kim_actor_id bigint references public.t2_foydalanuvchi(id) on delete set null,
  vaqt timestamptz not null default now(),
  operation_id uuid not null,
  unique (shartnoma_id, oy, versiya),
  unique (operation_id)
);
create index if not exists t2_shartnoma_oylik_paket_komp_idx on public.t2_shartnoma_oylik_paket(kompaniya_id, oy desc, shartnoma_id);
alter table public.t2_shartnoma_oylik_paket enable row level security;
revoke all on public.t2_shartnoma_oylik_paket from anon, authenticated;
comment on table public.t2_shartnoma_oylik_paket is 'Shartnoma oylik paketi (topshirildi). ZIP baytlari kanonik saqlashda (hujjat_id -> t2_document_registry); manifest = fayllar (yol, sha256, hajm) + akt versiyalari + server izi.';

-- Bitta obyektning shu oydagi iz (F2 aktlari + fakt barmoq izi). oy - oyning 1-sanasi.
create or replace function public._t2_oy_iz_v1(p_obyekt_id bigint, p_oy date)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'obyekt_id', p_obyekt_id,
    'f2', coalesce((select jsonb_agg(jsonb_build_object('akt_id', a.id, 'raqam', a.raqam, 'versiya', a.versiya, 'holat', a.holat,
                      'lifecycle', a.lifecycle_status) order by a.id)
                      from public.t2_akt a
                     where a.obyekt_id = p_obyekt_id and a.tur = 'f2' and a.oy::date >= p_oy and a.oy::date < (p_oy + interval '1 month')::date), '[]'::jsonb),
    'fakt', (select jsonb_build_object('soni', count(*), 'maks_id', max(a.id),
                    'xesh', coalesce(md5(string_agg(a.id::text || ':' || coalesce(a.versiya, 0)::text || ':' || coalesce(a.holat, ''), ',' order by a.id)), ''))
               from public.t2_akt a
              where a.obyekt_id = p_obyekt_id and a.tur = 'fakt' and a.oy::date >= p_oy and a.oy::date < (p_oy + interval '1 month')::date));
$$;

-- Shartnomaning barcha faol obyektlari (asosiy bog + qo'shimcha bog), obyekt id tartibida.
create or replace function public._t2_shartnoma_obyektlari_v1(p_shartnoma_id bigint)
returns table(obyekt_id bigint) language sql stable set search_path = public, pg_temp as $$
  select x.obyekt_id from (
    select b.obyekt_id from public.t2_shartnoma_bog b where b.shartnoma_id = p_shartnoma_id and b.holat = 'faol'
    union
    select q.obyekt_id from public.t2_shartnoma_qoshimcha_bog q where q.shartnoma_id = p_shartnoma_id and q.holat = 'faol'
  ) x order by x.obyekt_id;
$$;

create or replace function public._t2_shartnoma_oy_iz_v1(p_shartnoma_id bigint, p_oy date)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(public._t2_oy_iz_v1(o.obyekt_id, p_oy) order by o.obyekt_id), '[]'::jsonb)
    from public._t2_shartnoma_obyektlari_v1(p_shartnoma_id) o;
$$;

-- YOZISH: paketni «topshirildi» deb muhrlash. Qayta topshirish = yangi versiya. operation_id bo'yicha idempotent.
create or replace function public.t2_shartnoma_oylik_paket_saqla_v1(p_actor_id bigint, p_kompaniya_id bigint, p_shartnoma_id bigint, p_oy text,
  p_manifest jsonb, p_hujjat_id bigint, p_zip_sha256 text, p_zip_olcham bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_oy date; v_sh public.t2_shartnoma%rowtype; v_ver int; v_iz jsonb; v_id bigint; v_vaqt timestamptz; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'document.write');
  if p_oy is null or p_oy !~ '^\d{4}-(0[1-9]|1[0-2])$' then return jsonb_build_object('ok', false, 'code', 'OY_INVALID'); end if;
  v_oy := (p_oy || '-01')::date;
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then return jsonb_build_object('ok', false, 'code', 'MANIFEST_INVALID'); end if;
  if jsonb_typeof(p_manifest->'fayllar') is distinct from 'array' or jsonb_array_length(p_manifest->'fayllar') > 5000 then
    return jsonb_build_object('ok', false, 'code', 'MANIFEST_FAYLLAR_INVALID');
  end if;
  if p_zip_sha256 is not null and p_zip_sha256 !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'code', 'SHA256_INVALID'); end if;
  if p_zip_olcham is not null and p_zip_olcham <= 0 then return jsonb_build_object('ok', false, 'code', 'OLCHAM_INVALID'); end if;
  select * into v_sh from public.t2_shartnoma where id = p_shartnoma_id and kompaniya_id = p_kompaniya_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_NOT_FOUND'); end if;
  if p_hujjat_id is not null and not exists (
       select 1 from public.t2_document_registry d
        where d.id = p_hujjat_id and d.kompaniya_id = p_kompaniya_id and d.document_type = 'shartnoma_oylik_paket') then
    return jsonb_build_object('ok', false, 'code', 'HUJJAT_NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('t2_shartnoma_oylik_paket:' || p_shartnoma_id || ':' || p_oy, 0));
  select coalesce(max(versiya), 0) + 1 into v_ver from public.t2_shartnoma_oylik_paket where shartnoma_id = p_shartnoma_id and oy = v_oy;
  v_iz := public._t2_shartnoma_oy_iz_v1(p_shartnoma_id, v_oy);
  insert into public.t2_shartnoma_oylik_paket(kompaniya_id, shartnoma_id, oy, versiya, holat, manifest, hujjat_id, zip_sha256, zip_olcham, kim_actor_id, operation_id)
  values (p_kompaniya_id, p_shartnoma_id, v_oy, v_ver, 'topshirildi', p_manifest || jsonb_build_object('iz', v_iz), p_hujjat_id, p_zip_sha256, p_zip_olcham, p_actor_id, p_operation_id)
  returning id, vaqt into v_id, v_vaqt;
  -- 4-parametr obyekt_id (FK t2_obyekt) — shartnoma emas; shartnoma tafsilotda.
  perform public.t2_audit_yoz(p_kompaniya_id, 'shartnoma_oylik_paket', 'shartnoma', null,
    format('shartnoma=%s oy=%s versiya=%s fayl=%s', p_shartnoma_id, p_oy, v_ver, jsonb_array_length(p_manifest->'fayllar')), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'id', v_id, 'versiya', v_ver, 'vaqt', v_vaqt, 'oy', p_oy, 'obyekt_soni', jsonb_array_length(v_iz));
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 't2_shartnoma_oylik_paket_saqla_v1', v_res);
  return v_res;
end $$;

-- O'QISH (stable): arxiv ro'yxati - har versiya, saqlangan manifest va HOZIRGI iz (mijoz solishtiradi: «o'zgargan» belgisi).
create or replace function public.t2_shartnoma_oylik_paket_royxat_v1(p_kompaniya_id bigint, p_actor_id bigint, p_shartnoma_id bigint default null, p_oy text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_oy date; v_res jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  if p_oy is not null and p_oy !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'OY_INVALID' using errcode = '22023'; end if;
  v_oy := case when p_oy is null then null else (p_oy || '-01')::date end;
  select jsonb_build_object('ok', true, 'generated_at', now(), 'paketlar', coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'shartnoma_id', p.shartnoma_id, 'shartnoma_raqam', s.raqam, 'shartnoma_nom', s.nom,
      'oy', to_char(p.oy, 'YYYY-MM'), 'versiya', p.versiya, 'holat', p.holat, 'vaqt', p.vaqt,
      'hujjat_id', p.hujjat_id, 'zip_sha256', p.zip_sha256, 'zip_olcham', p.zip_olcham,
      'kim_actor_id', p.kim_actor_id, 'kim', u.ism,
      'manifest', p.manifest,
      'hozirgi_iz', public._t2_shartnoma_oy_iz_v1(p.shartnoma_id, p.oy)
    ) order by p.oy desc, p.shartnoma_id, p.versiya desc), '[]'::jsonb))
    into v_res
    from (select * from public.t2_shartnoma_oylik_paket
           where kompaniya_id = p_kompaniya_id and (p_shartnoma_id is null or shartnoma_id = p_shartnoma_id) and (v_oy is null or oy = v_oy)
           order by oy desc, shartnoma_id, versiya desc limit 200) p
    join public.t2_shartnoma s on s.id = p.shartnoma_id
    left join public.t2_foydalanuvchi u on u.id = p.kim_actor_id;
  return v_res;
end $$;

-- O'QISH (stable, ARZON): obyekt + oy uchun topshirilgan paket bormi (fakt/F2 saqlashdan oldin ogohlantirish). Faqat a'zolik talab qilinadi
-- (fakt yozuvchi prorab ham ogohlantirishni ko'rsin); javobda maxfiy ma'lumot yo'q (raqam, versiya, vaqt).
create or replace function public.t2_shartnoma_oylik_paket_tekshir_v1(p_obyekt_id bigint, p_actor_id bigint, p_oy text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_komp bigint; v_oy date; v_res jsonb;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  if v_komp is null then raise exception 'OBYEKT_NOT_FOUND' using errcode = 'P0002'; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if p_oy is null or p_oy !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'OY_INVALID' using errcode = '22023'; end if;
  v_oy := (p_oy || '-01')::date;
  select jsonb_build_object('ok', true, 'paketlar', coalesce(jsonb_agg(jsonb_build_object(
      'shartnoma_id', x.shartnoma_id, 'shartnoma_raqam', x.raqam, 'versiya', x.versiya, 'vaqt', x.vaqt) order by x.shartnoma_id), '[]'::jsonb))
    into v_res
    from (
      select distinct on (p.shartnoma_id) p.shartnoma_id, s.raqam, p.versiya, p.vaqt
        from public.t2_shartnoma_oylik_paket p
        join public.t2_shartnoma s on s.id = p.shartnoma_id
       where p.kompaniya_id = v_komp and p.oy = v_oy and p.holat = 'topshirildi'
         and (exists (select 1 from public.t2_shartnoma_bog b where b.shartnoma_id = p.shartnoma_id and b.obyekt_id = p_obyekt_id and b.holat = 'faol')
           or exists (select 1 from public.t2_shartnoma_qoshimcha_bog q where q.shartnoma_id = p.shartnoma_id and q.obyekt_id = p_obyekt_id and q.holat = 'faol'))
       order by p.shartnoma_id, p.versiya desc
    ) x;
  return v_res;
end $$;

revoke all on function public._t2_oy_iz_v1(bigint, date) from public, anon, authenticated;
revoke all on function public._t2_shartnoma_obyektlari_v1(bigint) from public, anon, authenticated;
revoke all on function public._t2_shartnoma_oy_iz_v1(bigint, date) from public, anon, authenticated;
revoke all on function public.t2_shartnoma_oylik_paket_saqla_v1(bigint, bigint, bigint, text, jsonb, bigint, text, bigint, uuid) from public, anon, authenticated;
revoke all on function public.t2_shartnoma_oylik_paket_royxat_v1(bigint, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.t2_shartnoma_oylik_paket_tekshir_v1(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public._t2_oy_iz_v1(bigint, date) to service_role;
grant execute on function public._t2_shartnoma_obyektlari_v1(bigint) to service_role;
grant execute on function public._t2_shartnoma_oy_iz_v1(bigint, date) to service_role;
grant execute on function public.t2_shartnoma_oylik_paket_saqla_v1(bigint, bigint, bigint, text, jsonb, bigint, text, bigint, uuid) to service_role;
grant execute on function public.t2_shartnoma_oylik_paket_royxat_v1(bigint, bigint, bigint, text) to service_role;
grant execute on function public.t2_shartnoma_oylik_paket_tekshir_v1(bigint, bigint, text) to service_role;

commit;
