-- P1 «Kundalik ish jurnali» (общий журнал работ): faqat prorab IZOHI saqlanadi.
-- Jurnalning qolgan hamma qismi (bajarilgan ishlar, sklad kirimi, АОСР, murojaat) o'qishda fakt/sklad/АОСР/murojaat
-- jadvallaridan HOSIL QILINADI — ikkinchi nusxa saqlanmaydi (yagona haqiqat manbai).
--   t2_ish_jurnal_izoh      - obyekt x kun: izoh, odamlar (qo'lda, qisqa matn), ob-havo SNAPSHOT (tasdiq paytidagi), tasdiq belgisi.
--   t2_ish_jurnal_saqla_v1  - YOZISH: a'zolik + fakt.write, versiya CAS, operation_id idempotent.
-- DB hajmi: qator ~0.3 KB; 100 obyekt x 365 kun = ~11 MB/yil (eng yomon), real: kuniga bir necha obyekt -> 1-2 MB/yil.
-- Izoh: forward faylda BEGIN/COMMIT yo'q (runner o'zi tranzaksiya ochadi).

create table if not exists public.t2_ish_jurnal_izoh (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint not null references public.t2_obyekt(id),
  sana date not null,
  izoh text,
  odamlar text,
  ob_havo jsonb,
  tasdiqlandi boolean not null default false,
  tasdiqlagan_actor_id bigint,
  versiya integer not null default 1,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  constraint t2_ish_jurnal_izoh_uq unique (obyekt_id, sana),
  constraint t2_ish_jurnal_izoh_izoh_len check (izoh is null or char_length(izoh) <= 2000),
  constraint t2_ish_jurnal_izoh_odamlar_len check (odamlar is null or char_length(odamlar) <= 300),
  constraint t2_ish_jurnal_izoh_obhavo_tur check (ob_havo is null or jsonb_typeof(ob_havo) = 'object')
);

create index if not exists t2_ish_jurnal_izoh_kompaniya_idx on public.t2_ish_jurnal_izoh (kompaniya_id, sana desc);

alter table public.t2_ish_jurnal_izoh enable row level security;
revoke all on public.t2_ish_jurnal_izoh from anon, authenticated;

create or replace function public.t2_ish_jurnal_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_sana date,
  p_izoh text, p_odamlar text, p_ob_havo jsonb, p_tasdiqlash boolean,
  p_kutilgan_versiya integer, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_row public.t2_ish_jurnal_izoh%rowtype; v_res jsonb; v_izoh text; v_odam text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'fakt.write');
  if p_sana is null then return jsonb_build_object('ok', false, 'code', 'SANA_REQUIRED'); end if;
  -- Kelajak kunga jurnal yozilmaydi (bugun — ruxsat; vaqt zonasi uchun +1 kun zaxira).
  if p_sana > (current_date + 1) then return jsonb_build_object('ok', false, 'code', 'SANA_KELAJAK'); end if;
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND');
  end if;
  v_izoh := nullif(btrim(coalesce(p_izoh, '')), '');
  v_odam := nullif(btrim(coalesce(p_odamlar, '')), '');
  if v_izoh is not null and char_length(v_izoh) > 2000 then return jsonb_build_object('ok', false, 'code', 'IZOH_UZUN'); end if;
  if v_odam is not null and char_length(v_odam) > 300 then return jsonb_build_object('ok', false, 'code', 'ODAMLAR_UZUN'); end if;
  if p_ob_havo is not null and (jsonb_typeof(p_ob_havo) <> 'object' or char_length(p_ob_havo::text) > 1000) then
    return jsonb_build_object('ok', false, 'code', 'OB_HAVO_YAROQSIZ');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_jurnal:' || p_obyekt_id || ':' || p_sana, 0));
  select * into v_row from public.t2_ish_jurnal_izoh where obyekt_id = p_obyekt_id and sana = p_sana for update;
  if not found then
    if p_kutilgan_versiya is not null and p_kutilgan_versiya <> 0 then
      return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', 0);
    end if;
    insert into public.t2_ish_jurnal_izoh (kompaniya_id, obyekt_id, sana, izoh, odamlar, ob_havo, tasdiqlandi, tasdiqlagan_actor_id)
    values (p_kompaniya_id, p_obyekt_id, p_sana, v_izoh, v_odam, p_ob_havo, coalesce(p_tasdiqlash, false),
            case when coalesce(p_tasdiqlash, false) then p_actor_id end)
    returning * into v_row;
  else
    if p_kutilgan_versiya is distinct from v_row.versiya then
      return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_row.versiya);
    end if;
    update public.t2_ish_jurnal_izoh set
      izoh = v_izoh, odamlar = v_odam, ob_havo = coalesce(p_ob_havo, ob_havo),
      tasdiqlandi = coalesce(p_tasdiqlash, false),
      tasdiqlagan_actor_id = case when coalesce(p_tasdiqlash, false) then p_actor_id end,
      versiya = versiya + 1, yangilandi = now()
     where id = v_row.id
    returning * into v_row;
  end if;
  v_res := jsonb_build_object('ok', true, 'id', v_row.id, 'versiya', v_row.versiya, 'tasdiqlandi', v_row.tasdiqlandi);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_jurnal_saqla_v1', v_res);
  return v_res;
end $$;

revoke all on function public.t2_ish_jurnal_saqla_v1(bigint, bigint, bigint, date, text, text, jsonb, boolean, integer, uuid) from public, anon, authenticated;
