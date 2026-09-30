-- T2-NAKRUTKA-PODVAL-001 — nakrutka podvali konstruktori (egasi Q6, 2026-10-01).
-- Har kompaniya (sukut), shartnoma yoki obyekt (smeta) uchun qatorma-qator podval.
-- Qatorlar tuzilmasi: frontend/src/lib/nakrutka-konstruktor.ts (`Podval.qatorlar`).
-- Hal qilish tartibi (frontend): obyekt → shartnoma → kompaniya → standart (koeffitsientlardan).
-- Faqat ADDITIV. Har saqlash oldingi holatni tarixga yozadi (audit — pul hujjati).

begin;

create table if not exists public.t2_nakrutka_podval (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  obyekt_id bigint references public.t2_obyekt(id) on delete cascade,
  shartnoma_id bigint references public.t2_shartnoma(id) on delete cascade,
  nom text not null default 'Подвал',
  qatorlar jsonb not null check (jsonb_typeof(qatorlar) = 'array' and jsonb_array_length(qatorlar) between 1 and 80),
  faol boolean not null default true,
  versiya integer not null default 1,
  operation_id uuid unique,
  kim text,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now()
);
create unique index if not exists t2_nakrutka_podval_doira_uq
  on public.t2_nakrutka_podval (kompaniya_id, coalesce(obyekt_id, 0), coalesce(shartnoma_id, 0))
  where faol;

create table if not exists public.t2_nakrutka_podval_tarix (
  id bigint generated always as identity primary key,
  podval_id bigint not null references public.t2_nakrutka_podval(id) on delete cascade,
  kompaniya_id bigint not null,
  versiya integer not null,
  nom text,
  qatorlar jsonb not null,
  faol boolean not null,
  kim text,
  vaqt timestamptz not null default now()
);

alter table public.t2_nakrutka_podval enable row level security;
alter table public.t2_nakrutka_podval_tarix enable row level security;
revoke all on public.t2_nakrutka_podval, public.t2_nakrutka_podval_tarix from anon, authenticated;

create or replace view public.t2_nakrutka_podval_royxat as
select p.id, p.kompaniya_id, p.obyekt_id, o.nom as obyekt, p.shartnoma_id, s.raqam as shartnoma,
       p.nom, p.qatorlar, p.versiya, p.kim, p.yaratildi, p.yangilandi
from public.t2_nakrutka_podval p
left join public.t2_obyekt o on o.id = p.obyekt_id
left join public.t2_shartnoma s on s.id = p.shartnoma_id
where p.faol;
revoke all on public.t2_nakrutka_podval_royxat from anon, authenticated;

-- Saqlash: id yo'q — yangi (doira bo'yicha bitta faol), id bor — tahrir (versiya majburiy).
create or replace function public.t2_nakrutka_podval_saqla_v1(
  p_kompaniya_id bigint, p_obyekt_id bigint, p_shartnoma_id bigint, p_nom text, p_qatorlar jsonb,
  p_id bigint default null, p_kutilgan_versiya integer default null, p_operation_id uuid default null, p_kim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id bigint; v_bordagi integer; v_eski record; v_q jsonb;
begin
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Podval qatorlari bo''sh');
  end if;
  if jsonb_array_length(p_qatorlar) > 80 then
    return jsonb_build_object('ok', false, 'error', 'Podval juda uzun (≤ 80 qator)');
  end if;
  for v_q in select value from jsonb_array_elements(p_qatorlar) loop
    if coalesce(v_q->>'kod', '') !~ '^[A-Za-z0-9_]{1,40}$' or coalesce(v_q->>'tur', '') not in ('foiz', 'summa', 'jami') then
      return jsonb_build_object('ok', false, 'error', 'Qator tuzilmasi noto''g''ri: ' || coalesce(v_q->>'kod', '?'));
    end if;
  end loop;
  if p_obyekt_id is not null and not exists (select 1 from t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'error', 'Obyekt bu kompaniyaga tegishli emas');
  end if;
  if p_shartnoma_id is not null and not exists (select 1 from t2_shartnoma where id = p_shartnoma_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'error', 'Shartnoma bu kompaniyaga tegishli emas');
  end if;

  if p_id is not null then
    select * into v_eski from t2_nakrutka_podval where id = p_id and kompaniya_id = p_kompaniya_id and faol for update;
    if v_eski.id is null then
      return jsonb_build_object('ok', false, 'error', 'Podval topilmadi');
    end if;
    if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_eski.versiya then
      return jsonb_build_object('ok', false, 'sabab', 'versiya', 'bordagi_versiya', v_eski.versiya);
    end if;
    insert into t2_nakrutka_podval_tarix (podval_id, kompaniya_id, versiya, nom, qatorlar, faol, kim)
      values (v_eski.id, v_eski.kompaniya_id, v_eski.versiya, v_eski.nom, v_eski.qatorlar, v_eski.faol, v_eski.kim);
    update t2_nakrutka_podval set nom = coalesce(nullif(trim(p_nom), ''), nom), qatorlar = p_qatorlar,
      versiya = versiya + 1, kim = p_kim, yangilandi = now() where id = p_id;
    return jsonb_build_object('ok', true, 'id', p_id, 'versiya', v_eski.versiya + 1);
  end if;

  if p_operation_id is null then
    return jsonb_build_object('ok', false, 'error', 'operation_id majburiy');
  end if;
  select id into v_id from t2_nakrutka_podval where operation_id = p_operation_id;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'takror', true);
  end if;
  insert into t2_nakrutka_podval (kompaniya_id, obyekt_id, shartnoma_id, nom, qatorlar, operation_id, kim)
  values (p_kompaniya_id, p_obyekt_id, p_shartnoma_id, coalesce(nullif(trim(p_nom), ''), 'Подвал'), p_qatorlar, p_operation_id, p_kim)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'versiya', 1);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'Bu doira uchun podval allaqachon bor — uni tahrirlang');
end;
$$;

-- O'chirish o'rniga faolsizlantirish (standartga qaytish); tarix saqlanadi.
create or replace function public.t2_nakrutka_podval_ochir_v1(p_kompaniya_id bigint, p_id bigint, p_kutilgan_versiya integer, p_kim text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_eski record;
begin
  select * into v_eski from t2_nakrutka_podval where id = p_id and kompaniya_id = p_kompaniya_id and faol for update;
  if v_eski.id is null then return jsonb_build_object('ok', false, 'error', 'Podval topilmadi'); end if;
  if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_eski.versiya then
    return jsonb_build_object('ok', false, 'sabab', 'versiya', 'bordagi_versiya', v_eski.versiya);
  end if;
  insert into t2_nakrutka_podval_tarix (podval_id, kompaniya_id, versiya, nom, qatorlar, faol, kim)
    values (v_eski.id, v_eski.kompaniya_id, v_eski.versiya, v_eski.nom, v_eski.qatorlar, v_eski.faol, v_eski.kim);
  update t2_nakrutka_podval set faol = false, versiya = versiya + 1, kim = p_kim, yangilandi = now() where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

revoke all on function public.t2_nakrutka_podval_saqla_v1(bigint, bigint, bigint, text, jsonb, bigint, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.t2_nakrutka_podval_ochir_v1(bigint, bigint, integer, text) from public, anon, authenticated;
grant execute on function public.t2_nakrutka_podval_saqla_v1(bigint, bigint, bigint, text, jsonb, bigint, integer, uuid, text) to service_role;
grant execute on function public.t2_nakrutka_podval_ochir_v1(bigint, bigint, integer, text) to service_role;

commit;
