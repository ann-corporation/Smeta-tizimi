-- Qabul sinovi: FAQAT ROLLBACK ichida. Yoyish: preview, farq bloklaydi, majburiy, idempotent; F-2 tasdiq himoyasi; audit yo'li o'zgarmagan.
do $$
declare k bigint; a bigint; o bigint; rz bigint; bl bigint; m1 bigint; m2 bigint; r jsonb; n int; akt bigint; kutilgan_tkm numeric;
begin
  insert into public.t2_kompaniya (nom, kod, faol) values ('ACC TY', 'ACCTY' || floor(random() * 1e6), true) returning id into k;
  insert into public.t2_foydalanuvchi (login, holat) values ('acc_ty_' || floor(random() * 1e9), 'faol') returning id into a;
  insert into public.t2_azolik (foydalanuvchi_id, kompaniya_id, rol, holat) values (a, k, 'pto', 'faol');
  insert into public.t2_obyekt (nom, kompaniya_id) values ('_ACC_TY_', k) returning id into o;
  insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, tartib) values (o, k, 'rz', '_ACC_RZ_', 940001) returning id into rz;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, nom, birlik, hajm, summa, tartib) values (o, k, rz, 'bl', '_ACC_ISH_', 'm3', 1, 0, 940002) returning id into bl;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib)
    values (o, k, bl, 'rs', 'С12303', 'ГПС ACC', 'm3', 100, 10, 1000, 'МАТ', 940003) returning id into m1;
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, kod, nom, birlik, hajm, narx, summa, kat, tartib)
    values (o, k, bl, 'rs', '12303', 'ГПС ACC 2', 'm3', 50, 10, 500, 'МАТ', 940004) returning id into m2;

  -- Y1: preview (yozmaydi): 150 m3 x 1.5 t/m3 x 10 km = 2250 t·km
  r := public.t2_qator_transport_yoy_v1(a, o, rz, 1000, '[{"material":"ГПС","miqdor":150,"zichlik":1.5,"km":10,"hisob_tkm":2250,"kodlar":["12303"]}]'::jsonb, false, false);
  if (r->>'ok')::boolean is not true or (r->>'yozildi')::boolean or (r->>'bloklangan')::boolean
     or (r->'guruhlar'->0->>'topilgan_soni')::int <> 2 or (r->'guruhlar'->0->>'holat') <> 'tayyor' then raise exception 'ACC: Y1 preview: %', r; end if;
  if exists (select 1 from public.t2_qator where transport_manba_qator_id is not null and obyekt_id = o) then raise exception 'ACC: Y1 preview yozdi'; end if;

  -- Y2: farq 0.5% dan ortiq bloklaydi, yozish rad (majburiy yo'q)
  r := public.t2_qator_transport_yoy_v1(a, o, rz, 1000, '[{"material":"ГПС","miqdor":150,"zichlik":1.5,"km":10,"hisob_tkm":2400,"kodlar":["12303"]}]'::jsonb, false, true);
  if r->>'code' <> 'TASDIQ_KERAK' or exists (select 1 from public.t2_qator where transport_manba_qator_id is not null and obyekt_id = o) then raise exception 'ACC: Y2 farq bloklamadi: %', r; end if;

  -- Y3: yozish; ikkita t·km qatori, materiallar tkm, bl summasi oshdi, audit toza
  r := public.t2_qator_transport_yoy_v1(a, o, rz, 1000, '[{"material":"ГПС","miqdor":150,"zichlik":1.5,"km":10,"hisob_tkm":2250,"kodlar":["12303"]}]'::jsonb, false, true);
  if (r->>'ok')::boolean is not true or (r->>'yaratildi')::int <> 2 then raise exception 'ACC: Y3 yozish: %', r; end if;
  select count(*) into n from public.t2_qator where obyekt_id = o and transport_manba_qator_id in (m1, m2) and kod = 'Т·КМ' and kat = 'МАШ' and birlik = 'Т·КМ' and narx = 1000;
  if n <> 2 or (select transport_usul from public.t2_qator where id = m1) <> 'tkm' then raise exception 'ACC: Y3 qatorlar: %', n; end if;
  if (select hajm from public.t2_qator where transport_manba_qator_id = m1) <> 1500 then raise exception 'ACC: Y3 hajm'; end if;
  if (public.t2_qator_transport_audit_v1(a, o)->'xulosa'->>'xato_soni')::int <> 0 then raise exception 'ACC: Y3 audit'; end if;

  -- Y4: idempotent (qayta yurgizish dublikat yaratmaydi)
  r := public.t2_qator_transport_yoy_v1(a, o, rz, 1000, '[{"material":"ГПС","miqdor":150,"zichlik":1.5,"km":10,"hisob_tkm":2250,"kodlar":["12303"]}]'::jsonb, false, true);
  if (r->>'yaratildi')::int <> 0 or r->'guruhlar'->0->>'holat' <> 'allaqachon' then raise exception 'ACC: Y4 idempotent emas: %', r; end if;
  select count(*) into n from public.t2_qator where obyekt_id = o and transport_manba_qator_id is not null; if n <> 2 then raise exception 'ACC: Y4 dublikat %', n; end if;

  -- Y5: topilmagan guruh + majburiy
  r := public.t2_qator_transport_yoy_v1(a, o, rz, 1000, '[{"material":"YOQ","miqdor":1,"zichlik":1,"km":1,"hisob_tkm":1,"kodlar":["99999"]}]'::jsonb, false, true);
  if r->>'code' <> 'TASDIQ_KERAK' then raise exception 'ACC: Y5 topilmadi bloklamadi: %', r; end if;

  -- F1: transport xatosi bor obyektda F-2 tasdiqlanmaydi (planted: t·km qatorisiz tkm material)
  insert into public.t2_qator (obyekt_id, kompaniya_id, ota_id, tur, nom, hajm, summa, kat, tartib, transport_usul) values (o, k, bl, 'rs', '_ACC_YETIM_', 1, 1, 'МАТ', 940010, 'tkm');
  insert into public.t2_akt (obyekt_id, tur, holat, oy) values (o, 'f2', 'qoralama', date '2031-05-01') returning id into akt;
  begin
    update public.t2_akt set holat = 'tasdiqlangan' where id = akt;
    raise exception 'ACC: F1 xatoli obyektda F-2 tasdiqlandi';
  exception when check_violation then null; end;
  raise notice 'OK: transport_yoy acceptance';
end $$;