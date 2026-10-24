-- 20261108100000 - P4 yengil izoh ipi: QATOR DARAJASIDAGI izoh (E3 §4.10, E7 §3). Egasi: tomon-buyurtmachi; hamma tomon ishlatadi.
-- Maqsad: buyurtmachi pudratchi yuborgan F2 aktning HAR QATORIGA izoh yozadi; pudratchi (PTO) o'z F2 ekranida ko'radi,
-- javob yozadi, "hal qilindi" deb belgilaydi. Asl akt qatori O'ZGARMAYDI (izoh alohida qatlam). Hard delete yo'q.
-- KO'RINISH QOIDASI (deny-by-default):
--   * yozuvchi kompaniya o'z izohini ko'radi (aloqa_id IS NULL = ichki izoh, faqat yozuvchi tenanti);
--   * aloqa_id berilgan izohni aloqaning ikkinchi tomoni ham ko'radi (yozuvchi shu aloqada tomon bo'lgani uchun);
--   * buyurtmachi (egasi bo'lmagan tomon) izoh yoza oladi FAQAT unga TAQDIM qilingan akt qatorlariga (t2_tomon_taqdim, ochiq/qabul holat);
--     yangi grant amali kerak emas - huquq taqdimdan kelib chiqadi. Egasi tenant o'z aktlariga ichki yoki aloqa izohi yozadi.
-- Hozir faqat manba_jadval='t2_akt_qator' qo'llanadi; qolganlari (t2_qator, t2_chizma_revizya, t2_aosr) allow-list da, resolver
-- (_t2_izoh_manba) ga tarmoq qo'shilgach yoqiladi (xato kodi MANBA_QOLLANMAYDI).
-- Barcha RPC faqat service_role; actor shlyuzdan. Hodisa: t2_tomon_hodisa (tur='izoh', taqdim_id bilan) + t2_outbox_yoz bo'lsa 'izoh.yozildi'.

create table if not exists public.t2_izoh (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),          -- yozuvchi tenant
  aloqa_id bigint references public.t2_tomon_aloqa(id),                     -- NULL = ichki izoh
  manba_jadval text not null check (manba_jadval in ('t2_akt_qator','t2_qator','t2_chizma_revizya','t2_aosr')),
  manba_id bigint not null,
  akt_id bigint,                                                            -- kontekst (t2_akt_qator uchun), ro'yxat indeksi
  egasi_kompaniya_id bigint not null references public.t2_kompaniya(id),    -- manba (akt) egasi tenant
  ota_izoh_id bigint references public.t2_izoh(id),
  matn text not null check (length(btrim(matn)) between 1 and 4000),
  holat text not null default 'faol' check (holat in ('faol','hal_qilingan')),
  hal_actor_id bigint,
  hal_vaqti timestamptz,
  versiya integer not null default 1,
  operation_id uuid not null,
  yaratdi_actor_id bigint not null,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  unique (kompaniya_id, operation_id)
);
create index if not exists t2_izoh_manba_idx on public.t2_izoh (manba_jadval, manba_id, id);
create index if not exists t2_izoh_akt_idx on public.t2_izoh (akt_id, id) where akt_id is not null;
create index if not exists t2_izoh_aloqa_idx on public.t2_izoh (aloqa_id, id desc) where aloqa_id is not null;
alter table public.t2_izoh enable row level security;
revoke all on table public.t2_izoh from anon, authenticated;

-- Manba resolveri: (manba egasi tenant, akt_id, obyekt_id). Tarmoq qo'shish = bitta WHEN.
create or replace function public._t2_izoh_manba(p_jadval text, p_id bigint)
returns table (egasi_kompaniya_id bigint, akt_id bigint, obyekt_id bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_jadval = 't2_akt_qator' then
    return query select a.kompaniya_id, a.id, a.obyekt_id
                   from public.t2_akt_qator q join public.t2_akt a on a.id = q.akt_id where q.id = p_id;
  end if;
end $$;

-- Taqdim orqali huquq: p_kompaniya shu aktning qabul qiluvchisi (aloqa faol/to'xtatilgan emas, taqdim ochiq yoki qabul).
create or replace function public._t2_izoh_taqdim(p_kompaniya_id bigint, p_aloqa_id bigint, p_egasi bigint, p_akt_id bigint)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select t.id from public.t2_tomon_taqdim t join public.t2_tomon_aloqa a on a.id = t.aloqa_id and a.holat = 'faol'
   where t.aloqa_id = p_aloqa_id and t.manba_jadval = 't2_akt' and t.manba_id = p_akt_id
     and t.taqdim_etuvchi_kompaniya_id = p_egasi and t.qabul_qiluvchi_kompaniya_id = p_kompaniya_id
     and t.holat in ('yuborilgan','ko_rilmoqda','tuzatish','qabul')
   order by t.id desc limit 1
$$;

create or replace function public.t2_izoh_yoz_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_aloqa_id bigint,
  p_manba_jadval text, p_manba_id bigint, p_matn text, p_ota_izoh_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old public.t2_izoh; m record; v_matn text := btrim(coalesce(p_matn, '')); v_row public.t2_izoh; v_taqdim bigint; v_ota public.t2_izoh; v_aloqa public.t2_tomon_aloqa;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'izoh');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v_old from public.t2_izoh where kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'id', v_old.id, 'versiya', v_old.versiya); end if;
  if length(v_matn) not between 1 and 4000 then return jsonb_build_object('ok', false, 'code', 'MATN_NOTOGRI'); end if;
  if p_manba_jadval is distinct from 't2_akt_qator' then
    return jsonb_build_object('ok', false, 'code', 'MANBA_QOLLANMAYDI');
  end if;
  select * into m from public._t2_izoh_manba(p_manba_jadval, p_manba_id);
  if m.egasi_kompaniya_id is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if m.egasi_kompaniya_id = p_kompaniya_id then
    -- egasi: ichki (aloqa_id NULL) yoki aloqa izohi (faol aloqada tomon bo'lishi shart)
    if p_aloqa_id is not null and not exists (select 1 from public.t2_tomon_aloqa a where a.id = p_aloqa_id and a.holat = 'faol'
         and (a.taklif_kompaniya_id = p_kompaniya_id or a.qabul_kompaniya_id = p_kompaniya_id)) then
      return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ');
    end if;
  else
    -- begona tomon: faqat unga taqdim qilingan aktga va faqat aloqa izohi
    if p_aloqa_id is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
    v_taqdim := public._t2_izoh_taqdim(p_kompaniya_id, p_aloqa_id, m.egasi_kompaniya_id, m.akt_id);
    if v_taqdim is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  end if;
  if p_ota_izoh_id is not null then
    select * into v_ota from public.t2_izoh where id = p_ota_izoh_id and manba_jadval = p_manba_jadval and manba_id = p_manba_id;
    if not found or (v_ota.kompaniya_id <> p_kompaniya_id and (v_ota.aloqa_id is null or v_ota.aloqa_id is distinct from p_aloqa_id)) then
      return jsonb_build_object('ok', false, 'code', 'OTA_IZOH_YOQ');
    end if;
  end if;
  insert into public.t2_izoh (kompaniya_id, aloqa_id, manba_jadval, manba_id, akt_id, egasi_kompaniya_id, ota_izoh_id, matn, operation_id, yaratdi_actor_id)
  values (p_kompaniya_id, p_aloqa_id, p_manba_jadval, p_manba_id, m.akt_id, m.egasi_kompaniya_id, p_ota_izoh_id, v_matn, p_operation_id, p_actor_id)
  returning * into v_row;
  if p_aloqa_id is not null then
    if v_taqdim is null then   -- egasi yozdi: taqdim qabul qiluvchisi = aloqaning qarshi tomoni
      select * into v_aloqa from public.t2_tomon_aloqa where id = p_aloqa_id;
      v_taqdim := public._t2_izoh_taqdim(public._t2_tomon_qarshi(v_aloqa, p_kompaniya_id), p_aloqa_id, m.egasi_kompaniya_id, m.akt_id);
    end if;
    perform public._t2_tomon_hodisa_yoz(p_aloqa_id, v_taqdim,
      p_kompaniya_id, p_actor_id, 'izoh', 'Qator izohi: ' || left(v_matn, 300),
      jsonb_build_object('izoh_id', v_row.id, 'manba_jadval', p_manba_jadval, 'manba_id', p_manba_id, 'akt_id', m.akt_id));
  end if;
  -- Outbox (F1 qo'llangach) - bo'lmasa jim o'tadi
  if to_regprocedure('public.t2_outbox_yoz(bigint,text,text,bigint,jsonb,bigint,uuid)') is not null then
    execute 'select public.t2_outbox_yoz($1,$2,$3,$4,$5,$6,$7)'
      using p_kompaniya_id, 'izoh.yozildi', 't2_izoh', v_row.id,
            jsonb_build_object('aloqa_id', p_aloqa_id, 'akt_id', m.akt_id, 'obyekt_id', m.obyekt_id, 'manba_jadval', p_manba_jadval, 'manba_id', p_manba_id),
            p_actor_id, p_operation_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'versiya', v_row.versiya);
end $$;

-- "Hal qilindi" belgisi: izoh egasi yoki aloqaning ikkinchi tomoni. Versiya bilan (VERSIYA_ESKI).
create or replace function public.t2_izoh_hal_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_operation_id uuid, p_izoh_id bigint, p_kutilgan_versiya integer, p_hal boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.t2_izoh; n integer;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'izoh');
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_KERAK'); end if;
  select * into v from public.t2_izoh where id = p_izoh_id;
  if not found or not (v.kompaniya_id = p_kompaniya_id or v.egasi_kompaniya_id = p_kompaniya_id
        or (v.aloqa_id is not null and exists (select 1 from public.t2_tomon_aloqa a where a.id = v.aloqa_id and a.holat = 'faol'
              and (a.taklif_kompaniya_id = p_kompaniya_id or a.qabul_kompaniya_id = p_kompaniya_id)))) then
    return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ');
  end if;
  update public.t2_izoh set holat = case when p_hal then 'hal_qilingan' else 'faol' end, hal_actor_id = p_actor_id,
         hal_vaqti = now(), versiya = versiya + 1, yangilandi = now()
   where id = p_izoh_id and versiya = p_kutilgan_versiya;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'code', 'VERSIYA_ESKI'); end if;
  return jsonb_build_object('ok', true, 'versiya', p_kutilgan_versiya + 1);
end $$;

-- Akt bo'yicha barcha qator izohlari (F2 ekrani / buyurtmachi taqdimi). Keyset sahifalash (p_keyin_id).
create or replace function public.t2_izohlar_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_akt_id bigint, p_aloqa_id bigint default null, p_limit integer default 500, p_keyin_id bigint default 0)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_egasi bigint; v jsonb; v_lim integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select a.kompaniya_id into v_egasi from public.t2_akt a where a.id = p_akt_id;
  if v_egasi is null then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  if v_egasi <> p_kompaniya_id and public._t2_izoh_taqdim(p_kompaniya_id, p_aloqa_id, v_egasi, p_akt_id) is null then
    return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'manba_jadval', i.manba_jadval, 'manba_id', i.manba_id, 'ota_izoh_id', i.ota_izoh_id, 'matn', i.matn,
           'holat', i.holat, 'versiya', i.versiya, 'yaratildi', i.yaratildi, 'meniki', i.kompaniya_id = p_kompaniya_id,
           'ichki', i.aloqa_id is null, 'kompaniya_nom', c.nom) order by i.id), '[]'::jsonb)
    into v
    from (select * from public.t2_izoh i0
           where i0.akt_id = p_akt_id and i0.id > coalesce(p_keyin_id, 0)
             and (i0.kompaniya_id = p_kompaniya_id
                  or (i0.aloqa_id is not null and (p_aloqa_id is null or i0.aloqa_id = p_aloqa_id)
                      and exists (select 1 from public.t2_tomon_aloqa a where a.id = i0.aloqa_id
                                   and (a.taklif_kompaniya_id = p_kompaniya_id or a.qabul_kompaniya_id = p_kompaniya_id))))
           order by i0.id limit v_lim) i
    join public.t2_kompaniya c on c.id = i.kompaniya_id;
  return jsonb_build_object('ok', true, 'izohlar', v);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    '_t2_izoh_manba(text,bigint)', '_t2_izoh_taqdim(bigint,bigint,bigint,bigint)',
    't2_izoh_yoz_v1(bigint,bigint,uuid,bigint,text,bigint,text,bigint)', 't2_izoh_hal_v1(bigint,bigint,uuid,bigint,integer,boolean)',
    't2_izohlar_v1(bigint,bigint,bigint,bigint,integer,bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
