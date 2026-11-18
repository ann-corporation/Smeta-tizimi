-- Qabul sinovi: FAQAT ROLLBACK ichida (rb_run; migratsiyaning o'z begin/commit i yo'q). Haqiqiy faol a'zolar tanlanadi (t2_azolik.holat='faol'),
-- topilmasa sintetik yaratiladi. Xato: raise exception 'ACC: ...'.
do $$
declare
  a bigint; k1 bigint; b bigint; r jsonb; f1 bigint; v1 bigint; v2 bigint; f2 bigint; kal text; kal2 text; n integer;
  sha1 text := repeat('a', 64); sha2 text := repeat('b', 64);
begin
  -- A: kompaniya 1 ning faol a'zosi (tahrir darajasi); B: shu kompaniyaga a'zo EMAS bo'lgan boshqa faol foydalanuvchi
  select m.foydalanuvchi_id, m.kompaniya_id into a, k1 from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol'
   where m.holat = 'faol' and m.rol in ('admin', 'boss', 'rahbar', 'director') order by m.kompaniya_id, m.foydalanuvchi_id limit 1;
  if a is not null then
    select u.id into b from public.t2_foydalanuvchi u where u.holat = 'faol' and u.id <> a
       and not exists (select 1 from public.t2_azolik z where z.foydalanuvchi_id = u.id and z.kompaniya_id = k1 and z.holat = 'faol') order by u.id limit 1;
  end if;
  if a is null or b is null then
    insert into public.t2_foydalanuvchi(login) values ('mq_acc_a') returning id into a;
    insert into public.t2_foydalanuvchi(login) values ('mq_acc_b') returning id into b;
    insert into public.t2_kompaniya(nom, kod) values ('MQ sinov', 'MQACC1') returning id into k1;
    insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (a, k1, 'admin');
  end if;

  -- 1. Kompaniya fayli yuklanadi; indeks yoziladi (faqat joriy 'tayyor' versiya, versiya kaliti + '.txt')
  r := public.t2_hm_yuklash_reserve_v1(a, k1, null, 'MQ Smeta hisoboti.pdf', 'application/pdf', 1000, sha1, gen_random_uuid());
  f1 := (r->>'fayl_id')::bigint; v1 := (r->>'versiya_id')::bigint; kal := r->>'r2_kalit';
  r := public.t2_hm_matn_yoz_v1(a, v1, 'beton armatura sement fundament', 30, kal || '.txt');
  if r->>'code' <> 'VERSIYA_TOPILMADI' then raise exception 'ACC1 kutish versiya indekslandi %', r; end if;
  perform public.t2_hm_yuklash_tasdiq_v1(a, v1);
  r := public.t2_hm_matn_yoz_v1(a, v1, 'beton armatura sement fundament', 30, kal || '.txt');
  if r->>'ok' <> 'true' or r->>'eski_kalit' is not null then raise exception 'ACC1 indeks %', r; end if;
  if (public.t2_hm_matn_yoz_v1(a, v1, 'x yy', 3, 'boshqa/kalit.txt')->>'code') <> 'KALIT_NOTOGRI' then raise exception 'ACC1 ixtiyoriy kalit qabul qilindi'; end if;
  if (public.t2_hm_matn_yoz_v1(b, v1, 'beton', 5, kal || '.txt')->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC1 begona indeksladi'; end if;
  if (public.t2_hm_matn_yoz_v1(a, v1, ' ', 1, kal || '.txt')->>'code') <> 'MATN_BOSH' then raise exception 'ACC1 bo''sh matn'; end if;

  -- 2. Qidiruv: fayl ichidagi so'z (prefiks, hammasi birga) topadi; matn_kalit qaytadi (API parcha uchun), nom bo'yicha topilsa kalitsiz
  r := public.t2_hm_qidir_v1(a, k1, 'armatu', 'armatu');
  if jsonb_array_length(r->'royxat') <> 1 or r->'royxat'->0->>'mos' <> 'matn' or r->'royxat'->0->>'matn_kalit' <> kal || '.txt' then raise exception 'ACC2 mazmun qidiruvi %', r; end if;
  r := public.t2_hm_qidir_v1(a, k1, 'beton sement', 'beton sement');
  if jsonb_array_length(r->'royxat') <> 1 then raise exception 'ACC2 ikki so''z (AND) %', r; end if;
  r := public.t2_hm_qidir_v1(a, k1, 'beton ko''prik', 'beton koprik');
  if jsonb_array_length(r->'royxat') <> 0 then raise exception 'ACC2 yo''q so''z bilan topildi %', r; end if;
  r := public.t2_hm_qidir_v1(a, k1, 'smeta hisob', 'smeta hisob');
  if jsonb_array_length(r->'royxat') <> 1 or r->'royxat'->0->>'mos' <> 'nom' or (r->'royxat'->0->'matn_kalit') <> 'null'::jsonb then raise exception 'ACC2 nom qidiruvi %', r; end if;
  r := public.t2_hm_qidir_v1(a, k1, 'a', 'a');
  if jsonb_array_length(r->'royxat') <> 0 then raise exception 'ACC2 1 belgi'; end if;
  r := public.t2_hm_qidir_v1(a, k1, 'beton"; drop table x; --', null);
  if r->>'ok' <> 'true' then raise exception 'ACC2 xavfli kirish %', r; end if;

  -- 3. Huquq: begona kompaniya diskini qidira olmaydi; shaxsiy qidiruvda kompaniya fayli chiqmaydi
  if (public.t2_hm_qidir_v1(b, k1, 'beton', 'beton')->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC3 begona qidirdi'; end if;
  if jsonb_array_length(public.t2_hm_qidir_v1(a, null, 'beton', 'beton')->'royxat') <> 0 then raise exception 'ACC3 shaxsiy qidiruvda kompaniya fayli'; end if;

  -- 4. Yangi versiya: indeks almashtiriladi (eski kalit qaytadi - API R2 dan o'chiradi); versiya indekslanmaguncha eski mazmun topilmaydi (joriy versiya mos emas)
  r := public.t2_hm_yuklash_reserve_v1(a, k1, null, 'MQ Smeta hisoboti.pdf', 'application/pdf', 1200, sha2, gen_random_uuid());
  v2 := (r->>'versiya_id')::bigint; kal2 := r->>'r2_kalit';
  perform public.t2_hm_yuklash_tasdiq_v1(a, v2);
  if jsonb_array_length(public.t2_hm_qidir_v1(a, k1, 'armatu', 'armatu')->'royxat') <> 0 then raise exception 'ACC4 eski mazmun joriy versiyada topildi'; end if;
  if (public.t2_hm_matn_yoz_v1(a, v1, 'eski', 5, kal || '.txt')->>'code') <> 'VERSIYA_ESKIRGAN' then raise exception 'ACC4 eski versiya indekslandi'; end if;
  r := public.t2_hm_matn_yoz_v1(a, v2, 'gidroizolyatsiya tom membrana', 30, kal2 || '.txt');
  if r->>'ok' <> 'true' or r->>'eski_kalit' <> kal || '.txt' then raise exception 'ACC4 almashtirish %', r; end if;
  if (select count(*) from public.t2_hm_matn where fayl_id = f1) <> 1 then raise exception 'ACC4 fayl boshiga bitta qator'; end if;
  if jsonb_array_length(public.t2_hm_qidir_v1(a, k1, 'gidroiz', 'gidroiz')->'royxat') <> 1 then raise exception 'ACC4 yangi mazmun'; end if;
  -- versiyaga qaytarilsa indeks mos kelmaydi, fayl nomi bilan topiladi
  perform public.t2_hm_fayl_amal_v1(a, f1, 'versiya_qaytar', null, null, 1);
  if jsonb_array_length(public.t2_hm_qidir_v1(a, k1, 'gidroiz', 'gidroiz')->'royxat') <> 0 then raise exception 'ACC4 qaytarilgan versiyada eski indeks'; end if;
  if jsonb_array_length(public.t2_hm_qidir_v1(a, k1, 'smeta', 'smeta')->'royxat') <> 1 then raise exception 'ACC4 nom bo''yicha'; end if;
  perform public.t2_hm_fayl_amal_v1(a, f1, 'versiya_qaytar', null, null, 2);

  -- 5. Savat: indekslangan fayl qidiruvda ko'rinmaydi; kaskad: fayl o'chsa indeks qatori ham o'chadi
  perform public.t2_hm_fayl_amal_v1(a, f1, 'savat');
  if jsonb_array_length(public.t2_hm_qidir_v1(a, k1, 'gidroiz', 'gidroiz')->'royxat') <> 0 then raise exception 'ACC5 savatdagi topildi'; end if;
  update public.t2_hm_fayl set savatda = now() - interval '40 days' where id = f1;
  perform public.t2_hm_tozala_tasdiq_v1(array[f1], '{}', '{}');
  select count(*) into n from public.t2_hm_matn where fayl_id = f1;
  if n <> 0 then raise exception 'ACC5 indeks qatori qoldi'; end if;

  raise notice 'ACC OK: t2_hm_matn_qidiruv_v1 (A=%, B=%, K1=%)', a, b, k1;
end $$;
