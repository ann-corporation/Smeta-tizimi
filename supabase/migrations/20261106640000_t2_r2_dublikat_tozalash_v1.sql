-- R2 dagi MAVJUD dublikatlarni tozalash (egasi 2026-10-20: «dublikatlar R2 da yig'ilib axlatxona»). 20261106630000 dan
-- keyin yangi dublikat yaratilmaydi; bu — eskilar uchun. Faqat platforma superadmini. Uch bosqich:
--   1) t2_r2_dublikat_royxat_v1  — kompaniya ichida bir xil mazmunli (sha256 + hajm, tasdiqlangan) yozuvlar guruhlari;
--   2) t2_r2_dublikat_birlashtir_v1 — nusxa yozuvlarni asosiy obyektga bog'laydi (blob_key). Endi hech kim ishlatmaydigan
--      eski obyekt t2_r2_yetim ga yoziladi (o'chirilmaydi). Worker (functions/api/r2-dublikat.ts) avval asosiy obyekt
--      R2 da borligini va hajmini tekshiradi;
--   3) t2_r2_yetim_royxat_v1 / t2_r2_yetim_ochirildi_v1 — hali ham hech kim ishlatmaydigan yetimlar; worker R2 dan o'chirgach
--      belgilaydi. O'chirish qaytarib bo'lmaydi — tugmani egasi bosadi.
-- Hujjat yozuvlari, ularning obyekt/tur/reviziyasi o'zgarmaydi; faqat baytlar qayerda turishi.

create table if not exists public.t2_r2_yetim (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  r2_key text not null unique,
  document_id bigint,
  sha256 text,
  size_bytes bigint,
  yaratildi timestamptz not null default now(),
  ochirildi timestamptz,
  ochirgan bigint
);
alter table public.t2_r2_yetim enable row level security;
revoke all on public.t2_r2_yetim from public, anon, authenticated;
comment on table public.t2_r2_yetim is 'R2 dublikat tozalash: hech bir hujjat yozuvi ishlatmaydigan eski obyektlar (ochirildi — R2 dan o''chirilgan vaqt).';

-- Obyekt kalitini biror yozuv ishlatadimi (jismoniy kalit = coalesce(blob_key, r2_key)).
create or replace function public.t2_r2_kalit_ishlatiladimi(p_key text)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $$ select exists (select 1 from public.t2_document_registry where coalesce(blob_key, r2_key) = p_key) $$;

create or replace function public.t2_r2_dublikat_royxat_v1(p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare r jsonb;
begin
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'SUPERADMIN_REQUIRED'); end if;
  with d as (
    select id, kompaniya_id, sha256, size_bytes, coalesce(blob_key, r2_key) fiz, original_filename
      from public.t2_document_registry
     where canonical_storage_status = 'stored' and sha256_verified and sha256 is not null and size_bytes > 0 and r2_key is not null
  ), g as (
    select kompaniya_id, sha256, size_bytes, count(distinct fiz) obyektlar,
           (array_agg(id order by id))[1] asosiy_id, (array_agg(fiz order by id))[1] asosiy_kalit,
           array_agg(id order by id) idlar, (array_agg(original_filename order by id))[1] nom
      from d group by kompaniya_id, sha256, size_bytes having count(distinct fiz) > 1
  )
  select jsonb_build_object('ok', true,
    'guruhlar', coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', kompaniya_id, 'sha256', sha256, 'size_bytes', size_bytes,
      'asosiy_id', asosiy_id, 'asosiy_kalit', asosiy_kalit, 'nusxa_idlar', idlar[2:], 'nom', nom,
      'tejash_bytes', (obyektlar - 1) * size_bytes) order by (obyektlar - 1) * size_bytes desc), '[]'::jsonb),
    'jami_tejash_bytes', coalesce(sum((obyektlar - 1) * size_bytes), 0),
    'yetim_kutilmoqda', (select count(*) from public.t2_r2_yetim where ochirildi is null))
    into r from g;
  return r;
end $function$;

create or replace function public.t2_r2_dublikat_birlashtir_v1(p_actor_id bigint, p_asosiy_id bigint, p_nusxa_idlar bigint[])
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare a public.t2_document_registry; n public.t2_document_registry; v_fiz text; v_eski text; v_soni int := 0; v_yetim int := 0;
begin
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'SUPERADMIN_REQUIRED'); end if;
  select * into a from public.t2_document_registry where id = p_asosiy_id for update;
  if not found or a.canonical_storage_status <> 'stored' or not a.sha256_verified or a.sha256 is null or coalesce(a.size_bytes, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'ASOSIY_YAROQSIZ');
  end if;
  v_fiz := coalesce(a.blob_key, a.r2_key);
  for n in select * from public.t2_document_registry where id = any(coalesce(p_nusxa_idlar, '{}')) and id <> a.id order by id for update loop
    if n.kompaniya_id <> a.kompaniya_id or n.sha256 is distinct from a.sha256 or n.size_bytes is distinct from a.size_bytes
       or not n.sha256_verified or n.canonical_storage_status <> 'stored' then
      raise exception 'NUSXA_MOS_EMAS: document_id=%', n.id;
    end if;
    v_eski := coalesce(n.blob_key, n.r2_key);
    continue when v_eski = v_fiz;
    update public.t2_document_registry set blob_key = v_fiz, updated_at = now() where id = n.id;
    v_soni := v_soni + 1;
    if not public.t2_r2_kalit_ishlatiladimi(v_eski) then
      insert into public.t2_r2_yetim(kompaniya_id, r2_key, document_id, sha256, size_bytes)
        values (n.kompaniya_id, v_eski, n.id, n.sha256, n.size_bytes) on conflict (r2_key) do nothing;
      v_yetim := v_yetim + 1;
    end if;
    perform public.t2_audit_yoz(n.kompaniya_id, 'document_blob_deduplicated', 'file_truth', n.obyekt_id,
      format('document_id=%s; blob_key=%s; eski=%s; asosiy=%s; actor_id=%s', n.id, v_fiz, v_eski, a.id, p_actor_id),
      'actor:' || p_actor_id, null);
  end loop;
  return jsonb_build_object('ok', true, 'birlashtirildi', v_soni, 'yetim', v_yetim);
end $function$;

create or replace function public.t2_r2_yetim_royxat_v1(p_actor_id bigint, p_limit int default 200)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'SUPERADMIN_REQUIRED'); end if;
  return jsonb_build_object('ok', true, 'yetimlar', coalesce((
    select jsonb_agg(jsonb_build_object('id', y.id, 'r2_key', y.r2_key, 'size_bytes', y.size_bytes, 'sha256', y.sha256) order by y.id)
      from (select * from public.t2_r2_yetim where ochirildi is null order by id limit least(greatest(coalesce(p_limit, 200), 1), 500)) y
     where not public.t2_r2_kalit_ishlatiladimi(y.r2_key)), '[]'::jsonb));
end $function$;

-- Worker R2 dan o'chirgandan keyin chaqiradi. Kalit yana ishlatila boshlagan bo'lsa — rad etadi (worker o'chirmagan bo'ladi:
-- u har kalit uchun avval shu funksiyani p_tekshir=true bilan chaqiradi).
create or replace function public.t2_r2_yetim_ochirildi_v1(p_actor_id bigint, p_yetim_id bigint, p_tekshir boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare y public.t2_r2_yetim;
begin
  if not public.t2_platforma_superadmin(p_actor_id) then return jsonb_build_object('ok', false, 'code', 'SUPERADMIN_REQUIRED'); end if;
  select * into y from public.t2_r2_yetim where id = p_yetim_id for update;
  if not found or y.ochirildi is not null then return jsonb_build_object('ok', false, 'code', 'YETIM_TOPILMADI'); end if;
  if public.t2_r2_kalit_ishlatiladimi(y.r2_key) then return jsonb_build_object('ok', false, 'code', 'KALIT_ISHLATILMOQDA'); end if;
  if p_tekshir then return jsonb_build_object('ok', true, 'r2_key', y.r2_key); end if;
  update public.t2_r2_yetim set ochirildi = now(), ochirgan = p_actor_id where id = y.id;
  perform public.t2_audit_yoz(y.kompaniya_id, 'r2_orphan_deleted', 'file_truth', null,
    format('r2_key=%s; size=%s; actor_id=%s', y.r2_key, y.size_bytes, p_actor_id), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'r2_key', y.r2_key);
end $function$;

do $$ declare f text; begin
  foreach f in array array['t2_r2_kalit_ishlatiladimi(text)', 't2_r2_dublikat_royxat_v1(bigint)', 't2_r2_dublikat_birlashtir_v1(bigint,bigint,bigint[])',
                           't2_r2_yetim_royxat_v1(bigint,integer)', 't2_r2_yetim_ochirildi_v1(bigint,bigint,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
