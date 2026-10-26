-- Acceptance: 20261111500000 — obyekt imzochilari. SINTETIK obyekt (real ma'lumot yo'q). BEGIN … ROLLBACK.
-- S6 meros razdel → obyekt → loyiha va darajalar bir-biriga siljimaydi; S7 tarix eslab qoladi.
-- S1 rol normallashtirish; S2 egasi pudratchini 'ozi', zakazchikni 'kiritilgan' yozadi; S3 idempotentlik;
-- S4 a'zosi bo'lmagan / grantsiz kompaniya o'qiy olmaydi; S5 bo'sh maydonlar qatorni o'chiradi.
begin;
do $acc$
declare
  v_k bigint; v_a bigint; v_k2 bigint; v_o bigint; v_rz bigint; r jsonb; v_op uuid := gen_random_uuid(); v_n int;
begin
  -- S1
  if public._t2_imzochi_rol_norm('Buyurtmachi') <> 'zakazchik' or public._t2_imzochi_rol_norm('Заказчик') <> 'zakazchik'
     or public._t2_imzochi_rol_norm('Texnik nazorat') <> 'texnadzor' or public._t2_imzochi_rol_norm('Технадзор') <> 'texnadzor'
     or public._t2_imzochi_rol_norm('Subpudratchi') <> 'subpudratchi' or public._t2_imzochi_rol_norm('Субподрядчик') <> 'subpudratchi'
     or public._t2_imzochi_rol_norm('Bosh pudratchi') <> 'pudratchi' or public._t2_imzochi_rol_norm('Подрядчик') <> 'pudratchi'
     or public._t2_imzochi_rol_norm('Loyihachi') <> 'loyihachi' or public._t2_imzochi_rol_norm('Проектировщик') <> 'loyihachi'
     or public._t2_imzochi_rol_norm('Laboratoriya') is not null or public._t2_imzochi_rol_norm(null) is not null then
    raise exception 'rol normallashtirish xato';
  end if;

  select z.kompaniya_id, z.foydalanuvchi_id into v_k, v_a from public.t2_azolik z
   where z.holat = 'faol' and z.rol in ('boss','pto') order by z.kompaniya_id desc limit 1;
  if v_k is null then raise notice 'faol a''zo yo''q — S2..S5 o''tkazib yuborildi'; return; end if;
  select id into v_k2 from public.t2_kompaniya where id <> v_k order by id limit 1;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('SINOV imzochi', v_k) returning id into v_o;

  -- S2
  r := public.t2_obyekt_imzochi_saqla_v1(v_a, v_k, v_o, 'pudratchi', 'obyekt', null, 'SINOV MChJ', 'Direktor', 'Aliyev A.', v_op);
  if r->>'ok' <> 'true' or r->>'manba' <> 'ozi' then raise exception 'pudratchi ozi emas: %', r; end if;
  r := public.t2_obyekt_imzochi_saqla_v1(v_a, v_k, v_o, 'zakazchik', 'obyekt', null, 'BUYURTMA MChJ', null, 'Valiyev V.', gen_random_uuid());
  if r->>'ok' <> 'true' or r->>'manba' <> 'kiritilgan' then raise exception 'zakazchik qoralama emas: %', r; end if;
  -- S3
  if public.t2_obyekt_imzochi_saqla_v1(v_a, v_k, v_o, 'texnadzor', 'obyekt', null, 'BOSHQA', null, null, v_op) <> public.t2_obyekt_imzochi_saqla_v1(v_a, v_k, v_o, 'pudratchi', 'obyekt', null, 'SINOV MChJ', 'Direktor', 'Aliyev A.', v_op) then
    raise exception 'idempotent emas';
  end if;
  select count(*) into v_n from public.t2_obyekt_imzochi where obyekt_id = v_o and daraja = 'obyekt';
  if v_n <> 2 then raise exception 'qatorlar soni % (2 kutilgan)', v_n; end if;
  r := public.t2_obyekt_imzochilar_v1(v_a, v_k, v_o);
  if r->>'ok' <> 'true' or (r->>'egasi')::boolean is not true or r->>'mening_tomonim' <> 'pudratchi' or jsonb_array_length(r->'imzochilar') <> 5 then
    raise exception 'o''qish xato: %', r;
  end if;
  -- S4: begona kompaniya (aloqa/grant yo'q) obyektni ko'rmaydi
  if v_k2 is not null then
    declare v_b bigint; begin
      select z.foydalanuvchi_id into v_b from public.t2_azolik z where z.kompaniya_id = v_k2 and z.holat = 'faol' limit 1;
      if v_b is not null then
        r := public.t2_obyekt_imzochilar_v1(v_b, v_k2, v_o);
        if r->>'code' is distinct from 'OBYEKT_TOPILMADI' then raise exception 'begona kompaniya ko''rdi: %', r; end if;
        r := public.t2_obyekt_imzochi_saqla_v1(v_b, v_k2, v_o, 'zakazchik', 'obyekt', null, 'X', null, null, gen_random_uuid());
        if r->>'ok' = 'true' then raise exception 'begona kompaniya yozdi'; end if;
      end if;
    end;
  end if;
  -- S5
  r := public.t2_obyekt_imzochi_saqla_v1(v_a, v_k, v_o, 'zakazchik', 'obyekt', null, ' ', '', null, gen_random_uuid());
  select count(*) into v_n from public.t2_obyekt_imzochi where obyekt_id = v_o and rol = 'zakazchik';
  if r->>'ok' <> 'true' or v_n <> 0 then raise exception 'bo''sh maydon o''chirmadi'; end if;
  -- S6: razdel yozuvi obyekt yozuvini o'zgartirmaydi; razdel kontekstida effektiv = razdel, aks holda obyekt.
  select id into v_rz from public.t2_qator where obyekt_id = v_o and tur = 'rz' limit 1;
  if v_rz is null then insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom) values (v_o, v_k, 'rz', 'РАЗДЕЛ СИНОВ') returning id into v_rz; end if;
  r := public.t2_obyekt_imzochi_saqla_v1(v_a, v_k, v_o, 'pudratchi', 'razdel', v_rz, 'RAZDEL MChJ', null, null, gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'razdel yozilmadi: %', r; end if;
  r := public.t2_obyekt_imzochilar_v1(v_a, v_k, v_o, v_rz);
  if (select e->'effektiv'->>'tashkilot' from jsonb_array_elements(r->'imzochilar') e where e->>'rol' = 'pudratchi') <> 'RAZDEL MChJ' then raise exception 'razdel effektiv emas'; end if;
  r := public.t2_obyekt_imzochilar_v1(v_a, v_k, v_o, null);
  if (select e->'effektiv'->>'tashkilot' from jsonb_array_elements(r->'imzochilar') e where e->>'rol' = 'pudratchi') <> 'SINOV MChJ' then raise exception 'razdel obyektga siljidi'; end if;
  -- S7: tarix
  r := public.t2_imzochi_tarix_v1(v_a, v_k);
  if not exists (select 1 from jsonb_array_elements(r->'tarix') e where e->>'tashkilot' = 'RAZDEL MChJ') then raise exception 'tarix eslamadi'; end if;
end
$acc$;
rollback;
