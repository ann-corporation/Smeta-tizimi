-- Hujjat maydoni - 2-faza: TO'LIQ MATNLI QIDIRUV (fayl ichidagi matn). Egasi 2026-11-18: qidiruv nom + mazmun bo'yicha.
-- Baza kichik qoladi: matnning o'zi R2 da (versiya r2 kaliti + '.txt'; server pdf/docx/xlsx/pptx/matndan ajratadi, <= 1 MB), Postgres'da FAYL BOSHIGA BITTA
-- ixcham qator: pozitsiyasiz tsvector ('simple', lotin/kirill farqsiz normallashgan so'zlar, <= 200 000 belgi) + R2 kaliti. Faqat JORIY versiya indekslanadi:
-- yangi versiya yuklansa qator almashtiriladi (eski matn obyekti API tomonidan R2 dan o'chiriladi); versiyaga qaytarilsa indeks mos kelmaydi - fayl nomi bilan topilaveradi.
-- Qidiruv huquqi o'zgarmaydi: kompaniya diski - a'zolik darajasi >= 1; shaxsiy - faqat egasi; savatdagi fayllar ko'rinmaydi.
-- t2_hm_qidir_v1: eski 3 parametrli shakl o'chiriladi, yangisi (p_q_norm - serverda normallashgan so'rov) bilan almashtiriladi.

create table if not exists public.t2_hm_matn (
  fayl_id bigint primary key references public.t2_hm_fayl(id) on delete cascade,
  versiya_id bigint not null references public.t2_hm_versiya(id) on delete cascade,
  tsv tsvector not null,
  belgi integer not null check (belgi >= 0),
  r2_kalit text not null,
  yangilandi timestamptz not null default now()
);
create index if not exists t2_hm_matn_tsv_ix on public.t2_hm_matn using gin (tsv);
create index if not exists t2_hm_matn_versiya_ix on public.t2_hm_matn(versiya_id);
alter table public.t2_hm_matn enable row level security;
revoke all on table public.t2_hm_matn from anon, authenticated;

-- Indeks yozish (API yuklashdan keyin chaqiradi). Faqat JORIY 'tayyor' versiya, tahrir darajasi (>= 3); R2 kaliti faqat versiya kaliti + '.txt' bo'lishi mumkin.
create or replace function public.t2_hm_matn_yoz_v1(p_actor bigint, p_versiya_id bigint, p_norm text, p_belgi integer, p_r2_kalit text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.t2_hm_versiya%rowtype; f public.t2_hm_fayl%rowtype; v_eski text;
begin
  select * into v from public.t2_hm_versiya where id = p_versiya_id and holat = 'tayyor';
  if not found then return jsonb_build_object('ok', false, 'code', 'VERSIYA_TOPILMADI'); end if;
  select * into f from public.t2_hm_fayl where id = v.fayl_id;
  if not found or f.savatda is not null then return jsonb_build_object('ok', false, 'code', 'FAYL_TOPILMADI'); end if;
  if public._t2_hm_daraja_v1(p_actor, f.kompaniya_id, f.egasi_foydalanuvchi_id, f.papka_id, f.id) < 3 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if f.joriy_versiya_id is distinct from v.id then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKIRGAN'); end if;
  if p_r2_kalit is distinct from v.r2_kalit || '.txt' then return jsonb_build_object('ok', false, 'code', 'KALIT_NOTOGRI'); end if;
  if p_norm is null or length(btrim(p_norm)) < 2 then return jsonb_build_object('ok', false, 'code', 'MATN_BOSH'); end if;
  select r2_kalit into v_eski from public.t2_hm_matn where fayl_id = f.id;
  insert into public.t2_hm_matn(fayl_id, versiya_id, tsv, belgi, r2_kalit)
  values (f.id, v.id, strip(to_tsvector('simple', left(p_norm, 200000))), greatest(coalesce(p_belgi, 0), 0), p_r2_kalit)
  on conflict (fayl_id) do update set versiya_id = excluded.versiya_id, tsv = excluded.tsv, belgi = excluded.belgi, r2_kalit = excluded.r2_kalit, yangilandi = now();
  return jsonb_build_object('ok', true, 'eski_kalit', v_eski);
end $$;

-- Qidiruv: nom (qismi) YOKI fayl ichidagi so'zlar (prefiks, hammasi birga). Natija: id, nom, mime, yangilandi, papka_id, mos ('nom'|'matn'),
-- matn_kalit (faqat mazmun bo'yicha topilganda - API R2 dan parcha oladi va mijozga CHIQARMAYDI).
drop function if exists public.t2_hm_qidir_v1(bigint, bigint, text);
create or replace function public.t2_hm_qidir_v1(p_actor bigint, p_kompaniya bigint default null, p_q text default null, p_q_norm text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', ''), '%', ''), '_', ''); v_w text[]; v_tsq tsquery;
begin
  if length(v_q) < 2 then return jsonb_build_object('ok', true, 'royxat', '[]'::jsonb); end if;
  if p_kompaniya is not null and public._t2_hm_daraja_v1(p_actor, p_kompaniya, null, null, null) < 1 then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if p_kompaniya is null and not exists (select 1 from public.t2_foydalanuvchi where id = p_actor and holat = 'faol') then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  v_w := array(select w from unnest(regexp_split_to_array(lower(coalesce(p_q_norm, '')), '[^a-z0-9]+')) w where length(w) >= 2 limit 6);
  if cardinality(v_w) > 0 then v_tsq := to_tsquery('simple', array_to_string(array(select w || ':*' from unnest(v_w) w), ' & ')); end if;
  return jsonb_build_object('ok', true, 'royxat', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'nom', x.nom, 'mime', x.mime, 'yangilandi', x.yangilandi, 'papka_id', x.papka_id,
        'mos', case when x.nom_mos then 'nom' else 'matn' end, 'matn_kalit', case when x.nom_mos then null else x.kalit end)
        order by x.nom_mos desc, x.yangilandi desc)
      from (select f.id, f.nom, f.mime, f.yangilandi, f.papka_id, (lower(f.nom) like '%' || v_q || '%') as nom_mos, m.r2_kalit as kalit
              from public.t2_hm_fayl f
              left join public.t2_hm_matn m on m.fayl_id = f.id and m.versiya_id = f.joriy_versiya_id and v_tsq is not null and m.tsv @@ v_tsq
             where f.savatda is null
               and ((p_kompaniya is not null and f.kompaniya_id = p_kompaniya) or (p_kompaniya is null and f.egasi_foydalanuvchi_id = p_actor))
               and (lower(f.nom) like '%' || v_q || '%' or m.fayl_id is not null)
             order by (lower(f.nom) like '%' || v_q || '%') desc, f.yangilandi desc limit 50) x), '[]'::jsonb));
end $$;

do $g$ declare s text; begin
  foreach s in array array['t2_hm_matn_yoz_v1(bigint, bigint, text, integer, text)', 't2_hm_qidir_v1(bigint, bigint, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', s);
    execute format('grant execute on function public.%s to service_role', s);
  end loop;
end $g$;
