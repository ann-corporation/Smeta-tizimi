-- Rollback: 20270120100000_t2_nakrutka_shartnoma_doira_v1 (saqla funksiyasi asl holatiga qaytadi; yangi funksiya/triggerlar olinadi).
begin;
drop trigger if exists t2_nakrutka_koef_sinxron on public.t2_nakrutka_koef;
drop trigger if exists t2_nakrutka_podval_sinxron on public.t2_nakrutka_podval;
drop function if exists public._t2_nakrutka_koef_sinxron_trg_v1();
drop function if exists public._t2_nakrutka_podval_sinxron_trg_v1();
drop function if exists public._t2_akt_podval_nakrutka_sinxron_v1(bigint[]);
drop function if exists public.t2_podval_shartnoma_farq_v1(bigint, jsonb);
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
    return jsonb_build_object('ok', false, 'error', 'Podval juda uzun (<= 80 qator)');
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
  values (p_kompaniya_id, p_obyekt_id, p_shartnoma_id, coalesce(nullif(trim(p_nom), ''), U&'\041F\043E\0434\0432\0430\043B'), p_qatorlar, p_operation_id, p_kim)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'versiya', 1);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'Bu doira uchun podval allaqachon bor - uni tahrirlang');
end;
$$;

-- (saqla funksiyasi grant'lari o'zgarmagan; create or replace ularni saqlaydi)
commit;
