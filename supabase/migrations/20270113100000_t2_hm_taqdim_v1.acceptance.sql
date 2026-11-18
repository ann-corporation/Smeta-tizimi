-- Qabul sinovi: FAQAT ROLLBACK ichida (rb_run; migratsiyaning o'z begin/commit i yo'q). Haqiqiy faol a'zolar (t2_azolik.holat='faol' + t2_foydalanuvchi.holat='faol')
-- tanlanadi; topilmasa sinov uchun sintetik kompaniya/foydalanuvchi yaratiladi. Hamma yozuv ROLLBACK bilan yo'qoladi. Xato: raise exception 'ACC: ...'.
do $$
declare
  a bigint; k1 bigint; b bigint; k2 bigint; c bigint; r jsonb; al bigint; ro text;
  sha1 text := repeat('a', 64); sha2 text := repeat('b', 64); sha3 text := repeat('c', 64);
  f1 bigint; v1 bigint; f2 bigint; f3 bigint; fp bigint; p1 bigint; p2 bigint; tq1 bigint; tq2 bigint; tq3 bigint; el1 bigint; n integer; kal text; v_op uuid := gen_random_uuid();
begin
  -- A: kompaniya 1 ning faol boshqaruvchisi (taqdim + abadiy o'chirish huquqi); B: BOSHQA kompaniyaning faol a'zosi; C: hech qaysisiga a'zo emas
  select m.foydalanuvchi_id, m.kompaniya_id into a, k1 from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol'
   where m.holat = 'faol' and m.rol in ('admin', 'boss', 'rahbar', 'director') order by m.kompaniya_id, m.foydalanuvchi_id limit 1;
  if a is not null then
    select m.foydalanuvchi_id, m.kompaniya_id into b, k2 from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol'
     where m.holat = 'faol' and m.kompaniya_id <> k1 and not exists (select 1 from public.t2_azolik z where z.foydalanuvchi_id = m.foydalanuvchi_id and z.kompaniya_id = k1 and z.holat = 'faol')
     order by m.kompaniya_id, m.foydalanuvchi_id limit 1;
  end if;
  if a is null or b is null then
    insert into public.t2_foydalanuvchi(login) values ('tq_acc_a') returning id into a;
    insert into public.t2_foydalanuvchi(login) values ('tq_acc_b') returning id into b;
    insert into public.t2_kompaniya(nom, kod) values ('TQ sinov 1', 'TQACC1') returning id into k1;
    insert into public.t2_kompaniya(nom, kod) values ('TQ sinov 2', 'TQACC2') returning id into k2;
    insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (a, k1, 'admin'), (b, k2, 'buyurtmachi');
  end if;
  insert into public.t2_foydalanuvchi(login) values ('tq_acc_c_' || gen_random_uuid()::text) returning id into c;
  if public._t2_hm_taqdim_rol_v1(a, k1, 'taqdim') is null then raise exception 'ACC0 A taqdim huquqiga ega emas'; end if;

  -- 1. SHAXSIY fayl taqdim qilinmaydi
  r := public.t2_hm_yuklash_reserve_v1(a, null, null, 'tq_shaxsiy.pdf', 'application/pdf', 100, sha1, gen_random_uuid());
  fp := (r->>'fayl_id')::bigint; perform public.t2_hm_yuklash_tasdiq_v1(a, (r->>'versiya_id')::bigint);
  insert into public.t2_tomon_aloqa(taklif_kompaniya_id, qabul_kompaniya_id, taklif_rol, qabul_rol, holat, taklif_actor_id) values (k1, k2, 'pudratchi', 'buyurtmachi', 'faol', a) returning id into al;
  r := public.t2_hm_taqdim_yarat_v1(a, 'fayl', fp, al, null, gen_random_uuid());
  if r->>'code' <> 'TAQDIM_SHAXSIY' then raise exception 'ACC1 shaxsiy fayl taqdim qilindi %', r; end if;

  -- 2. KOMPANIYA fayli: yuborish nishonlari, taqdim, oluvchi ko'radi / yuklab oladi, begona ko'rmaydi
  r := public.t2_hm_yuklash_reserve_v1(a, k1, null, 'tq_shartnoma.pdf', 'application/pdf', 1000, sha1, gen_random_uuid());
  f1 := (r->>'fayl_id')::bigint; v1 := (r->>'versiya_id')::bigint; kal := r->>'r2_kalit';
  perform public.t2_hm_yuklash_tasdiq_v1(a, v1);
  if (public.t2_hm_taqdim_nishon_v1(a, k1)->'royxat')::text not like '%"aloqa_id": ' || al || '%' then raise exception 'ACC2 nishon royxatida aloqa yoq %', public.t2_hm_taqdim_nishon_v1(a, k1); end if;
  if (public.t2_hm_taqdim_nishon_v1(c, k1)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC2 begona nishonlarni ko''rdi'; end if;
  r := public.t2_hm_taqdim_yarat_v1(c, 'fayl', f1, al, 'x', gen_random_uuid());
  if r->>'code' <> 'RUXSAT_YOQ' then raise exception 'ACC2 a''zo bo''lmagan taqdim qildi %', r; end if;
  r := public.t2_hm_taqdim_yarat_v1(a, 'fayl', f1, al, 'Imzolangan shartnoma', v_op);
  if r->>'ok' <> 'true' or (r->>'fayl_soni')::int <> 1 then raise exception 'ACC2 taqdim %', r; end if;
  tq1 := (r->>'id')::bigint;
  r := public.t2_hm_taqdim_yarat_v1(a, 'fayl', f1, al, 'Imzolangan shartnoma', v_op);
  if r->>'takror' <> 'true' or (r->>'id')::bigint <> tq1 then raise exception 'ACC2 operation_id takror %', r; end if;
  r := public.t2_hm_taqdim_royxat_v1(b, k2, 'kelgan');
  if r->>'ok' <> 'true' or jsonb_array_length(r->'royxat') <> 1 or (r->'royxat'->0->>'id')::bigint <> tq1 then raise exception 'ACC2 oluvchi royxati %', r; end if;
  if jsonb_array_length(public.t2_hm_taqdim_royxat_v1(a, k1, 'yuborilgan')->'royxat') <> 1 then raise exception 'ACC2 yuboruvchi royxati'; end if;
  if (public.t2_hm_taqdim_royxat_v1(b, k1, 'kelgan')->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC2 B k1 royxatini ko''rdi'; end if;
  r := public.t2_hm_taqdim_tafsilot_v1(b, tq1);
  if r->>'ok' <> 'true' or (r->>'oluvchi')::boolean is not true or jsonb_array_length(r->'fayllar') <> 1 or (r->>'qaytarish_mumkin')::boolean then raise exception 'ACC2 tafsilot %', r; end if;
  el1 := (r->'fayllar'->0->>'id')::bigint;
  if (public.t2_hm_taqdim_tafsilot_v1(c, tq1)->>'code') <> 'TAQDIM_TOPILMADI' then raise exception 'ACC2 begona tafsilot ko''rdi'; end if;
  r := public.t2_hm_taqdim_yuklab_v1(b, tq1, el1);
  if r->>'ok' <> 'true' or r->>'kalit' <> kal then raise exception 'ACC2 oluvchi yuklab olmadi %', r; end if;
  if (public.t2_hm_taqdim_yuklab_v1(c, tq1, el1)->>'code') <> 'TAQDIM_TOPILMADI' then raise exception 'ACC2 begona yuklab oldi'; end if;
  -- oluvchi faqat o'qiydi: oluvchining fayl RPC lari yuboruvchi faylini ko'rmaydi
  if (public.t2_hm_yuklab_v1(b, f1)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC2 oluvchi asl faylni ko''ra oldi'; end if;
  if (public.t2_hm_fayl_amal_v1(b, f1, 'nomla', null, 'x.pdf')->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC2 oluvchi tahrir qildi'; end if;
  if (public.t2_hm_taqdim_qaytar_v1(b, tq1, 'x')->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC2 oluvchi qaytardi'; end if;

  -- 3. O'ZGARMAS SURAT: yuboruvchi yangi versiya yuklasa ham oluvchi taqdim qilingan versiyani oladi
  r := public.t2_hm_yuklash_reserve_v1(a, k1, null, 'tq_shartnoma.pdf', 'application/pdf', 1200, sha2, gen_random_uuid());
  if (r->>'raqam')::int <> 2 then raise exception 'ACC3 v2 %', r; end if;
  perform public.t2_hm_yuklash_tasdiq_v1(a, (r->>'versiya_id')::bigint);
  r := public.t2_hm_taqdim_yuklab_v1(b, tq1, el1);
  if r->>'kalit' <> kal or (r->>'raqam')::int <> 1 or r->>'sha256' <> sha1 then raise exception 'ACC3 surat o''zgardi %', r; end if;

  -- 4. HIMOYA (pin): taqdimdagi fayl savatda 30 kundan oshsa ham tozalanmaydi; eski versiya (v1) o'chirilmaydi; abadiy o'chirish rad
  perform public.t2_hm_fayl_amal_v1(a, f1, 'savat');
  update public.t2_hm_fayl set savatda = now() - interval '40 days' where id = f1;
  if (public.t2_hm_tozala_ol_v1(null, null, 100)->'fayllar')::text like '%"id": ' || f1 || ',%' then raise exception 'ACC4 pinli fayl tozalash ro''yxatida'; end if;
  if (public.t2_hm_tozala_ol_v1(a, f1, 1)->>'code') <> 'TAQDIMDA' then raise exception 'ACC4 pinli faylni abadiy o''chirdi'; end if;
  if (public.t2_hm_bosh_ol_v1(a, k1, 'savat')->'fayllar')::text like '%"id": ' || f1 || ',%' then raise exception 'ACC4 savatni bo''shatish pinli faylni oldi'; end if;
  perform public.t2_hm_fayl_amal_v1(a, f1, 'tikla');
  update public.t2_hm_fayl set savatda = null where id = f1;
  if (public.t2_hm_bosh_ol_v1(a, k1, 'eski_versiyalar')->'eski')::text like '%' || kal || '%' then raise exception 'ACC4 pinli eski versiya o''chirish ro''yxatida'; end if;
  perform public.t2_hm_tozala_tasdiq_v1('{}', '{}', array[v1]);
  if not exists (select 1 from public.t2_hm_versiya where id = v1) then raise exception 'ACC4 tasdiq pinli versiyani o''chirdi'; end if;

  -- 5. PAPKA surati: ichma-ich fayllar yo'l bilan; savatdagi fayl kirmaydi
  insert into public.t2_fayl_papka(kompaniya_id, nom, yaratdi) values (k1, 'TQ Obyekt-1', a) returning id into p1;
  insert into public.t2_fayl_papka(kompaniya_id, ota_id, nom, yaratdi) values (k1, p1, 'Aktlar', a) returning id into p2;
  r := public.t2_hm_yuklash_reserve_v1(a, null, p1, 'a.xlsx', 'application/octet-stream', 300, sha1, gen_random_uuid());
  perform public.t2_hm_yuklash_tasdiq_v1(a, (r->>'versiya_id')::bigint);
  r := public.t2_hm_yuklash_reserve_v1(a, null, p2, 'b.xlsx', 'application/octet-stream', 400, sha2, gen_random_uuid());
  f2 := (r->>'fayl_id')::bigint; perform public.t2_hm_yuklash_tasdiq_v1(a, (r->>'versiya_id')::bigint);
  r := public.t2_hm_yuklash_reserve_v1(a, null, p2, 'savatda.xlsx', 'application/octet-stream', 500, sha3, gen_random_uuid());
  f3 := (r->>'fayl_id')::bigint; perform public.t2_hm_yuklash_tasdiq_v1(a, (r->>'versiya_id')::bigint);
  perform public.t2_hm_fayl_amal_v1(a, f3, 'savat');
  r := public.t2_hm_taqdim_yarat_v1(a, 'papka', p1, al, null, gen_random_uuid());
  if r->>'ok' <> 'true' or (r->>'fayl_soni')::int <> 2 or (r->>'jami_bayt')::bigint <> 700 then raise exception 'ACC5 papka surati %', r; end if;
  tq2 := (r->>'id')::bigint;
  r := public.t2_hm_taqdim_tafsilot_v1(b, tq2);
  if (select string_agg(x->>'yol', '|' order by x->>'yol') from jsonb_array_elements(r->'fayllar') x) <> 'TQ Obyekt-1|TQ Obyekt-1/Aktlar' then raise exception 'ACC5 yollar %', r; end if;
  r := public.t2_hm_taqdim_yarat_v1(a, 'papka', p1 + 999999, al, null, gen_random_uuid());
  if r->>'code' <> 'PAPKA_TOPILMADI' then raise exception 'ACC5 yoq papka %', r; end if;

  -- 6. AUDIT: o'zgarmas tomon jurnali + ikkala kompaniya lentasi + oluvchiga bildirishnoma
  select count(*) into n from public.t2_tomon_hodisa where aloqa_id = al and tur = 'taqdim' and (meta->>'hm_taqdim_id')::bigint in (tq1, tq2);
  if n <> 2 then raise exception 'ACC6 hodisa soni %', n; end if;
  if not exists (select 1 from public.t2_hm_faoliyat where kompaniya_id = k1 and amal = 'taqdim') or not exists (select 1 from public.t2_hm_faoliyat where kompaniya_id = k2 and amal = 'taqdim_keldi')
     or not exists (select 1 from public.t2_hm_faoliyat where kompaniya_id = k2 and amal = 'taqdim_ochildi') then raise exception 'ACC6 faoliyat lentasi'; end if;

  -- 7. QAYTARISH: faqat yuboruvchi; keyin oluvchi ichini ko'rmaydi/yuklay olmaydi, himoya olinadi; aloqa yopilsa ham ko'rinish yopiladi
  r := public.t2_hm_taqdim_qaytar_v1(a, tq1, 'Xato versiya');
  if r->>'ok' <> 'true' then raise exception 'ACC7 qaytar %', r; end if;
  if jsonb_array_length(public.t2_hm_taqdim_tafsilot_v1(b, tq1)->'fayllar') <> 0 or (public.t2_hm_taqdim_tafsilot_v1(b, tq1)->>'holat') <> 'qaytarilgan' then raise exception 'ACC7 qaytarilgan ichi ko''rinadi'; end if;
  if (public.t2_hm_taqdim_yuklab_v1(b, tq1, el1)->>'code') <> 'TAQDIM_TOPILMADI' then raise exception 'ACC7 qaytarilgan yuklandi'; end if;
  if not exists (select 1 from public.t2_tomon_hodisa where aloqa_id = al and tur = 'qaytarish') then raise exception 'ACC7 qaytarish hodisasi'; end if;
  if not (public.t2_hm_bosh_ol_v1(a, k1, 'eski_versiyalar')->'eski')::text like '%' || kal || '%' then raise exception 'ACC7 pin olinmadi'; end if;
  r := public.t2_hm_taqdim_tafsilot_v1(b, tq2);
  if jsonb_array_length(r->'fayllar') <> 2 then raise exception 'ACC7 boshqa taqdim ta''sirlandi'; end if;
  update public.t2_tomon_aloqa set holat = 'yopilgan' where id = al;
  if jsonb_array_length(public.t2_hm_taqdim_tafsilot_v1(b, tq2)->'fayllar') <> 0 then raise exception 'ACC7 yopilgan aloqada ko''rinadi'; end if;
  if (public.t2_hm_taqdim_yuklab_v1(b, tq2, (select min(id) from public.t2_hm_taqdim_el where taqdim_id = tq2))->>'code') <> 'TAQDIM_TOPILMADI' then raise exception 'ACC7 yopilgan aloqada yuklandi'; end if;
  r := public.t2_hm_taqdim_yarat_v1(a, 'fayl', f1, al, null, gen_random_uuid());
  if r->>'code' <> 'TAQDIM_ALOQA_YOQ' then raise exception 'ACC7 yopiq aloqaga yuborildi %', r; end if;

  raise notice 'ACC OK: t2_hm_taqdim_v1 (A=%, B=%, K1=%, K2=%)', a, b, k1, k2;
end $$;
