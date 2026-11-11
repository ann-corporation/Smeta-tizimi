-- acceptance 20261215300000_t2_esf_tayyorlash_v1
-- Migratsiyadan KEYIN, BEGIN..ROLLBACK ichida. O'z ma'lumotini seed qiladi (mavjud yozuvlarga tegmaydi). Real ma'lumot yo'q.
-- versiya: tarix
begin;
set local statement_timeout = '300s';
do $$
declare v_act bigint; v_komp bigint; v_sh bigint; v_f3 bigint; r jsonb;
begin
  select z.foydalanuvchi_id, z.kompaniya_id into v_act, v_komp
    from public.t2_azolik z
    join public.t2_kompaniya k on k.id = z.kompaniya_id and k.faol = true
    join public.t2_foydalanuvchi u on u.id = z.foydalanuvchi_id and u.holat = 'faol'
   where z.holat = 'faol' and z.rol in ('boss','superadmin','rahbar','bugalter')
   order by z.id limit 1;
  if v_act is null then raise notice 'SKIP: ruxsatli aktor yo''q'; return; end if;

  insert into public.t2_shartnoma (kompaniya_id, raqam, holat) values (v_komp, 'ACC-ESF-1', 'faol') returning id into v_sh;
  insert into public.t2_forma3 (kompaniya_id, shartnoma_id, raqam, davr_boshi, davr_oxiri, holat)
    values (v_komp, v_sh, 'ACC-ESF-F3', date '2099-03-01', date '2099-03-31', 'qoralama') returning id into v_f3;

  -- 1) ID yozish
  r := public.t2_shartnoma_esf_id_v1(v_act, v_sh, 'my3', ' TEST-123 ', '', null);
  if not coalesce((r->>'ok')::boolean,false) then raise exception 'FAIL id yozish: %', r; end if;
  if (select my3_shartnoma_id from public.t2_shartnoma where id = v_sh) is distinct from 'TEST-123'
     or (select kapital_imv_id from public.t2_shartnoma where id = v_sh) is not null
     or (select esf_id_turi from public.t2_shartnoma where id = v_sh) is distinct from 'my3' then
    raise exception 'FAIL id qiymatlari';
  end if;
  -- 2) noto'g'ri tur
  r := public.t2_shartnoma_esf_id_v1(v_act, v_sh, 'xxx', null, null, null);
  if (r->>'code') is distinct from 'ESF_ID_TURI_INVALID' then raise exception 'FAIL tur: %', r; end if;
  -- 3) ESF holat
  r := public.t2_forma3_esf_holat_v1(v_act, v_f3, 'yuborildi', 'EXT-1');
  if not coalesce((r->>'ok')::boolean,false) then raise exception 'FAIL holat: %', r; end if;
  if (select esf_tashqi_id from public.t2_forma3 where id = v_f3) is distinct from 'EXT-1' then raise exception 'FAIL tashqi id'; end if;
  r := public.t2_forma3_esf_holat_v1(v_act, v_f3, 'noto''g''ri', null);
  if (r->>'code') is distinct from 'ESF_HOLAT_INVALID' then raise exception 'FAIL holat tur: %', r; end if;
  -- 4) mavjud bo'lmagan F3
  r := public.t2_forma3_esf_holat_v1(v_act, -1, 'tayyor', null);
  if (r->>'code') is distinct from 'SCOPE_NOT_FOUND' then raise exception 'FAIL scope: %', r; end if;
  raise notice 'OK t2_esf_tayyorlash_v1';
end $$;
rollback;
