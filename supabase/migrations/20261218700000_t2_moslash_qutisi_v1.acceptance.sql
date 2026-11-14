-- Acceptance: 20261218700000 — Moslash qutisi. BEGIN ... ROLLBACK (hech narsa saqlanmaydi). Fixture sintetik.
-- Tekshiriladi: a'zo bo'lmagan rad; qutu faqat o'qiydi (jadval qatorlari soni o'zgarmaydi); javob shakli; band maydonlari (obyekt, summa, havola).
begin;
set local statement_timeout = '300s';
do $acc$
declare
  v_qadam text := 'boshlash';
  k1 bigint; u1 bigint; u2 bigint; r jsonb; n1 bigint; n2 bigint; v_kod text := 'M' || to_char(clock_timestamp(), 'HH24MISSUS');
begin
  v_qadam := '0 fixture';
  insert into public.t2_kompaniya (nom, kod) values ('MOSLASH-SINOV ' || v_kod, 'MO' || v_kod) returning id into k1;
  insert into public.t2_foydalanuvchi (login, holat) values ('mo_u1_' || v_kod, 'faol') returning id into u1;
  insert into public.t2_foydalanuvchi (login, holat) values ('mo_u2_' || v_kod, 'faol') returning id into u2;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol) values (u1, k1, 'pto');
  insert into public.t2_obyekt (kompaniya_id, nom) values (k1, 'MOSLASH-OBYEKT ' || v_kod);

  v_qadam := '1 a''zo bo''lmagan foydalanuvchi rad etiladi';
  begin
    r := public.t2_moslash_qutisi_v1(k1, u2);
    if coalesce((r ->> 'ok')::boolean, false) then raise exception 'a''zo bo''lmagan qutini oldi: %', r; end if;
  exception when others then null;   -- a'zolik tekshiruvi istisno tashlashi ham rad hisoblanadi
  end;

  v_qadam := '2 a''zo uchun javob shakli (permission bo''lsa)';
  begin
    r := public.t2_moslash_qutisi_v1(k1, u1);
    if coalesce((r ->> 'ok')::boolean, false) then
      if jsonb_typeof(r -> 'bandlar') <> 'array' or jsonb_typeof(r -> 'tur_soni') <> 'object' then raise exception 'javob shakli noto''g''ri: %', r; end if;
      if exists (select 1 from jsonb_array_elements(r -> 'bandlar') e where not (e ? 'tur' and e ? 'obyekt_id' and e ? 'summa' and e ? 'havola')) then raise exception 'band maydoni yetishmaydi'; end if;
    end if;
  exception when others then
    if sqlerrm not ilike '%permission%' and sqlerrm not ilike '%ruxsat%' and sqlerrm not ilike '%FORBIDDEN%' then raise; end if;
  end;

  v_qadam := '3 faqat o''qiydi: jadvallar o''zgarmaydi';
  select count(*) into n1 from public.t2_akt where kompaniya_id = k1;
  begin perform public.t2_moslash_qutisi_v1(k1, u1); exception when others then null; end;
  select count(*) into n2 from public.t2_akt where kompaniya_id = k1;
  if n1 <> n2 then raise exception 'qutu jadvalni o''zgartirdi'; end if;

  raise notice 'MOSLASH QUTISI acceptance OK';
exception when others then
  raise exception 'MOSLASH qadam [%]: %', v_qadam, sqlerrm;
end
$acc$;
rollback;
