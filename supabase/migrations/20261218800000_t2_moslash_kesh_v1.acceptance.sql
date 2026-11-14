-- Acceptance: 20261218800000 — Moslash qutisi keshi. BEGIN ... ROLLBACK. Sintetik fixture. 700000 oldin qo'llangan bo'lishi shart.
-- Tekshiriladi: kesh yo'q -> hisoblanmagan:true (0 ta DEMAYDI); yangilash keshni yozadi; qutu keshdan o'qiydi; a'zo bo'lmagan rad; kunlik cron faqat service_role ishlatadi.
begin;
do $acc$
declare
  v_qadam text := 'boshlash'; k1 bigint; u1 bigint; u2 bigint; r jsonb; v_kod text := 'M' || to_char(clock_timestamp(), 'HH24MISSUS');
begin
  v_qadam := '0 fixture';
  insert into public.t2_kompaniya (nom, kod) values ('MOSLASH-KESH ' || v_kod, 'MK' || v_kod) returning id into k1;
  insert into public.t2_foydalanuvchi (login, holat) values ('mk_u1_' || v_kod, 'faol') returning id into u1;
  insert into public.t2_foydalanuvchi (login, holat) values ('mk_u2_' || v_kod, 'faol') returning id into u2;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol) values (u1, k1, 'boss');
  insert into public.t2_obyekt (kompaniya_id, nom) values (k1, 'MOSLASH-KESH-OBYEKT ' || v_kod);

  v_qadam := '1 kesh yo''q: hisoblanmagan';
  r := public.t2_moslash_qutisi_v1(k1, u1);
  if (r ->> 'hisoblanmagan')::boolean is not true or (r ->> 'jami')::int <> 0 then raise exception 'kesh yo''q javobi noto''g''ri: %', r; end if;

  v_qadam := '2 yangilash keshni yozadi, qutu undan o''qiydi';
  r := public.t2_moslash_yangila_v1(k1, u1);
  if (r ->> 'ok')::boolean is not true then raise exception 'yangilash ok emas: %', r; end if;
  if not exists (select 1 from public.t2_moslash_kesh where kompaniya_id = k1) then raise exception 'kesh yozilmadi'; end if;
  r := public.t2_moslash_qutisi_v1(k1, u1);
  if r ->> 'hisoblanmagan' is not null or r ->> 'hisoblandi' is null or (r ->> 'eskirgan')::boolean is not false then raise exception 'keshdan o''qilmadi: %', r; end if;

  v_qadam := '3 a''zo bo''lmagan rad etiladi';
  begin
    r := public.t2_moslash_qutisi_v1(k1, u2);
    raise exception 'u2 qutini oldi: %', r;
  exception when others then if sqlerrm like 'u2 qutini oldi%' then raise; end if; end;

  v_qadam := '4 kunlik cron javob shakli';
  r := public.t2_moslash_kunlik_v1(1);
  if (r ->> 'ok')::boolean is not true then raise exception 'kunlik ok emas: %', r; end if;
  raise notice 'MOSLASH KESH acceptance OK';
exception when others then
  raise exception 'MOSLASH-KESH qadam [%]: %', v_qadam, sqlerrm;
end
$acc$;
rollback;
