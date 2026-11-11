-- acceptance 20261211300000_t2_forma3_shartnoma_v1
-- BEGIN..ROLLBACK ichida migratsiyadan KEYIN ishga tushiriladi; o'z ma'lumotini o'zi seed qiladi (mavjud F2 ga tegmaydi).
-- Faqat bitta mavjud ruxsatli aktor (rahbar/bugalter/boss) va uning kompaniyasi kerak; qolgan hamma narsa seed.
-- versiya: tarix
begin;
do $$
declare v_act bigint; v_komp bigint; v_sh bigint; v_sh2 bigint; v_o1 bigint; v_o2 bigint; v_o3 bigint;
        v_a1 bigint; v_a2 bigint; v_a3 bigint; v_a4 bigint; v_oy date := date '2099-03-01';
        r jsonb; v_f3 bigint;
begin
  select z.foydalanuvchi_id, z.kompaniya_id into v_act, v_komp
    from public.t2_azolik z
    join public.t2_kompaniya k on k.id = z.kompaniya_id and k.faol = true
    join public.t2_foydalanuvchi u on u.id = z.foydalanuvchi_id and u.holat = 'faol'
   where z.holat = 'faol' and z.rol in ('boss','superadmin','rahbar','bugalter')
   order by z.id limit 1;
  if v_act is null then raise notice 'SKIP: ruxsatli aktor yo''q'; return; end if;

  -- Seed: 2 shartnoma, 3 obyekt (o1,o2 — 1-shartnomada; o3 — 2-shartnomada), 4 ta tasdiqlangan F2.
  insert into public.t2_shartnoma (kompaniya_id, raqam, holat) values (v_komp, 'ACC-SH-1', 'faol') returning id into v_sh;
  insert into public.t2_shartnoma (kompaniya_id, raqam, holat) values (v_komp, 'ACC-SH-2', 'faol') returning id into v_sh2;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('ACC-OBYEKT-1', v_komp) returning id into v_o1;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('ACC-OBYEKT-2', v_komp) returning id into v_o2;
  insert into public.t2_obyekt (nom, kompaniya_id) values ('ACC-OBYEKT-3', v_komp) returning id into v_o3;
  insert into public.t2_shartnoma_bog (obyekt_id, shartnoma_id, holat) values (v_o1, v_sh, 'faol'), (v_o2, v_sh, 'faol'), (v_o3, v_sh2, 'faol');
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, oy, holat, raqam) values (v_o1, v_komp, 'f2', v_oy, 'tasdiqlangan', 'ACC-A1') returning id into v_a1;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, oy, holat, raqam) values (v_o2, v_komp, 'f2', v_oy, 'tasdiqlangan', 'ACC-A2') returning id into v_a2;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, oy, holat, raqam) values (v_o3, v_komp, 'f2', v_oy, 'tasdiqlangan', 'ACC-A3') returning id into v_a3;
  insert into public.t2_akt (obyekt_id, kompaniya_id, tur, oy, holat, raqam) values (v_o1, v_komp, 'f2', v_oy + interval '1 month', 'tasdiqlangan', 'ACC-A4') returning id into v_a4;

  -- 0) O'qish RPC: 1-shartnoma, mart 2099 — aktlar A1, A2 (A3 boshqa shartnoma, A4 boshqa oy); hech biri band emas.
  r := public.t2_forma3_shartnoma_aktlar_v1(v_sh, v_act, v_oy, v_oy);
  if not coalesce((r->>'ok')::boolean,false) then raise exception 'FAIL royxat: %', r; end if;
  if jsonb_array_length(r->'aktlar') <> 2 or jsonb_array_length(r->'obyektlar') <> 2 then raise exception 'FAIL royxat soni: %', r; end if;
  if exists (select 1 from jsonb_array_elements(r->'aktlar') e where (e->>'band')::boolean) then raise exception 'FAIL band erta: %', r; end if;

  -- 1) Shartnoma rejimi: obyekt NULL + shartnoma_id → bitta F3, ikkala obyekt aktlari bog'lanadi.
  r := public.t2_forma3_yarat_v1(v_act, null, null, v_sh, v_oy, v_oy, array[v_a1, v_a2], 'ACC-F3-1', gen_random_uuid());
  if not coalesce((r->>'ok')::boolean,false) then raise exception 'FAIL shartnoma yarat: %', r; end if;
  if (r->>'rejim') is distinct from 'shartnoma' then raise exception 'FAIL rejim: %', r; end if;
  v_f3 := (r->>'forma3_id')::bigint;
  if (select obyekt_id from public.t2_forma3 where id = v_f3) is not null
     or (select shartnoma_id from public.t2_forma3 where id = v_f3) is distinct from v_sh then raise exception 'FAIL f3 qatori'; end if;
  if (select count(*) from public.t2_forma3_akt where forma3_id = v_f3) <> 2 then raise exception 'FAIL link soni'; end if;
  if (select count(*) from public.t2_akt where id in (v_a1, v_a2) and forma3_id = v_f3) <> 2 then raise exception 'FAIL akt.forma3_id'; end if;

  -- 2) Bir xil operation_id — takror (ikkinchi yozuv yo'q).
  -- (operation_id yuqorida tasodifiy; shuning uchun mavjud f3 operation_id sini qayta ishlatamiz)
  r := public.t2_forma3_yarat_v1(v_act, null, null, v_sh, v_oy, v_oy, array[v_a1, v_a2], 'ACC-F3-1',
         (select operation_id from public.t2_forma3 where id = v_f3));
  if not coalesce((r->>'takror')::boolean,false) then raise exception 'FAIL takror: %', r; end if;

  -- 3) Boshqa F3 dagi akt (band) qayta kirmaydi; o'qish RPC band=true ko'rsatadi.
  r := public.t2_forma3_yarat_v1(v_act, null, null, v_sh, v_oy, v_oy, array[v_a1], 'ACC-F3-2', gen_random_uuid());
  if (r->>'code') is distinct from 'FORMA3_AKT_BAND' then raise exception 'FAIL band: %', r; end if;
  r := public.t2_forma3_shartnoma_aktlar_v1(v_sh, v_act, v_oy, v_oy);
  if (select count(*) from jsonb_array_elements(r->'aktlar') e where (e->>'band')::boolean) <> 2 then raise exception 'FAIL band belgisi: %', r; end if;

  -- 4) Boshqa shartnoma obyekti aktini kiritib bo'lmaydi (A3 — 2-shartnoma obyekti).
  r := public.t2_forma3_yarat_v1(v_act, null, null, v_sh, v_oy, v_oy, array[v_a3], 'ACC-F3-3', gen_random_uuid());
  if (r->>'code') is distinct from 'FORMA3_AKT_INVALID' then raise exception 'FAIL begona obyekt: %', r; end if;

  -- 5) Davrdan tashqari akt (A4 — keyingi oy) kiritib bo'lmaydi.
  r := public.t2_forma3_yarat_v1(v_act, null, null, v_sh, v_oy, v_oy, array[v_a4], 'ACC-F3-4', gen_random_uuid());
  if (r->>'code') is distinct from 'FORMA3_AKT_INVALID' then raise exception 'FAIL davr: %', r; end if;

  -- 6) Mavjud bo'lmagan shartnoma — SCOPE_NOT_FOUND.
  r := public.t2_forma3_yarat_v1(v_act, null, null, -1, v_oy, v_oy, array[v_a4], 'ACC-F3-5', gen_random_uuid());
  if (r->>'code') is distinct from 'SCOPE_NOT_FOUND' then raise exception 'FAIL scope: %', r; end if;

  -- 7) Obyekt rejimi o'zgarmagan: o3 aktini obyekt bo'yicha yaratish ishlaydi.
  r := public.t2_forma3_yarat_v1(v_act, null, v_o3, null, v_oy, v_oy, array[v_a3], 'ACC-F3-6', gen_random_uuid());
  if not coalesce((r->>'ok')::boolean,false) or (r->>'rejim') is distinct from 'obyekt' then raise exception 'FAIL obyekt rejimi: %', r; end if;

  raise notice 'PASS forma3 shartnoma rejimi: F3 % (shartnoma %), aktlar A1,A2; band/begona/davr/obyekt rejimi tekshirildi', v_f3, v_sh;
end $$;
rollback;
