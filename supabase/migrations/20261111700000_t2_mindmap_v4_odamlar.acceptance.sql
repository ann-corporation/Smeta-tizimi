-- Acceptance: 20261111700000 — mindmap v4 (odamlar, mas'ullar, ko'rish doirasi). SINTETIK obyekt. BEGIN … ROLLBACK.
-- S1 masul_v1 so'rov tekshiruvi; S2 boss biriktiradi + idempotent; S3 olib tashlash = 'bekor' (o'chirilmaydi);
-- S4 boshqaruv ruxsati yo'q a'zo biriktira olmaydi; S5 v4 grafi: odam tugunlari + korinish; S6 a'zo bo'lmagan — 42501.
begin;
do $acc$
declare
  v_k bigint; v_boss bigint; v_azo bigint; v_oddiy bigint; v_begona bigint; v_o bigint;
  r jsonb; r2 jsonb; v_op uuid := gen_random_uuid(); v_holat text; g jsonb;
begin
  select z.kompaniya_id, z.foydalanuvchi_id into v_k, v_boss from public.t2_azolik z
   where z.holat = 'faol' and z.rol = 'boss' order by z.kompaniya_id desc limit 1;
  if v_k is null then raise notice 'faol boss yo''q — acceptance o''tkazib yuborildi'; return; end if;

  -- S1
  r := public.t2_mindmap_masul_v1(v_boss, v_k, 1, null, v_boss, 'read', null);
  if r->>'code' <> 'OPERATION_ID_REQUIRED' then raise exception 'S1 op: %', r; end if;
  r := public.t2_mindmap_masul_v1(v_boss, v_k, 1, 1, v_boss, 'read', gen_random_uuid());
  if r->>'code' <> 'TARGET_INVALID' then raise exception 'S1 target: %', r; end if;
  r := public.t2_mindmap_masul_v1(v_boss, v_k, 1, null, v_boss, 'admin', gen_random_uuid());
  if r->>'code' <> 'RUXSAT_INVALID' then raise exception 'S1 ruxsat: %', r; end if;

  insert into public.t2_obyekt (nom, kompaniya_id) values ('SINOV mindmap mas''ul', v_k) returning id into v_o;
  select z.foydalanuvchi_id into v_azo from public.t2_azolik z
   where z.kompaniya_id = v_k and z.holat = 'faol' and z.foydalanuvchi_id <> v_boss order by z.foydalanuvchi_id limit 1;
  v_azo := coalesce(v_azo, v_boss);

  -- S2
  r := public.t2_mindmap_masul_v1(v_boss, v_k, v_o, null, v_azo, 'write', v_op);
  if r->>'ok' <> 'true' or r->>'tur' <> 'obyekt' then raise exception 'S2 biriktirish: %', r; end if;
  r2 := public.t2_mindmap_masul_v1(v_boss, v_k, v_o, null, v_azo, 'read', v_op);
  if r2 <> r then raise exception 'S2 idempotent emas: % / %', r, r2; end if;
  select holat into v_holat from public.t2_obyekt_foydalanuvchi_ruxsat where obyekt_id = v_o and foydalanuvchi_id = v_azo;
  if v_holat is distinct from 'faol' then raise exception 'S2 qator faol emas: %', v_holat; end if;
  r := public.t2_mindmap_masul_v1(v_boss, v_k, v_o, null, v_boss + 1000000000, 'read', gen_random_uuid());
  if r->>'code' <> 'TARGET_NOT_MEMBER' then raise exception 'S2 a''zo bo''lmagan: %', r; end if;

  -- S3
  r := public.t2_mindmap_masul_v1(v_boss, v_k, v_o, null, v_azo, null, gen_random_uuid());
  select holat into v_holat from public.t2_obyekt_foydalanuvchi_ruxsat where obyekt_id = v_o and foydalanuvchi_id = v_azo;
  if r->>'ok' <> 'true' or v_holat is distinct from 'bekor' then raise exception 'S3 olib tashlash: % / %', r, v_holat; end if;

  -- S4: kuzatuvchi / pudratchi kabi boshqaruv ruxsatsiz a'zo
  select z.foydalanuvchi_id into v_oddiy from public.t2_azolik z
   where z.kompaniya_id = v_k and z.holat = 'faol' and z.rol in ('kuzatuvchi', 'pudratchi', 'buyurtmachi', 'prorab') limit 1;
  if v_oddiy is not null then
    r := public.t2_mindmap_masul_v1(v_oddiy, v_k, v_o, null, v_azo, 'read', gen_random_uuid());
    if r->>'code' <> 'AUTHORIZATION_DENIED' then raise exception 'S4 ruxsatsiz biriktirdi: %', r; end if;
  else raise notice 'S4: ruxsatsiz a''zo yo''q — o''tkazib yuborildi'; end if;

  -- S5
  g := public.t2_mindmap_grafi_v4(v_boss, v_k);
  if g->'korinish' is null or (g->'korinish'->>'toliq')::boolean is not true then raise exception 'S5 korinish: %', g->'korinish'; end if;
  if not exists (select 1 from jsonb_array_elements(g->'tugunlar') t where t->>'id' like 'foydalanuvchi:%') then
    raise exception 'S5 odam tugunlari yo''q';
  end if;

  -- S6
  select f.id into v_begona from public.t2_foydalanuvchi f
   where not exists (select 1 from public.t2_azolik z where z.foydalanuvchi_id = f.id and z.kompaniya_id = v_k and z.holat = 'faol')
     and not coalesce(public.t2_platforma_superadmin(f.id), false) limit 1;
  if v_begona is not null then
    begin
      g := public.t2_mindmap_grafi_v4(v_begona, v_k);
      raise exception 'S6 begona grafni ko''rdi';
    exception when insufficient_privilege then null;
    end;
  end if;
  raise notice 'mindmap v4 acceptance: OK';
end
$acc$;
rollback;
