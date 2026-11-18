-- Qabul sinovi: FAQAT ROLLBACK ichida (rb_run). O'z ma'lumotini yaratadi (prodga bog'liq emas). Xato bo'lsa raise exception 'ACC: ...'.
do $$
declare a bigint; b bigint; c bigint; k1 bigint; k2 bigint; r jsonb; f1 bigint; v1 bigint; f2 bigint; f3 bigint; v bigint; n integer; tok0 numeric; tok1 numeric; hk integer; ulash bigint;
  sha1 text := repeat('a', 64); sha2 text := repeat('b', 64); sha3 text := repeat('c', 64); h text := repeat('d', 64);
begin
  insert into public.t2_foydalanuvchi(login) values ('hm_acc_a') returning id into a;
  insert into public.t2_foydalanuvchi(login) values ('hm_acc_b') returning id into b;
  insert into public.t2_foydalanuvchi(login) values ('hm_acc_c') returning id into c;
  insert into public.t2_kompaniya(nom, kod) values ('HM sinov 1', 'HMACC1') returning id into k1;
  insert into public.t2_kompaniya(nom, kod) values ('HM sinov 2', 'HMACC2') returning id into k2;
  insert into public.t2_azolik(foydalanuvchi_id, kompaniya_id, rol) values (a, k1, 'admin'), (b, k1, 'pto'), (c, k2, 'admin');

  -- 1. SHAXSIY fayl: yuklash -> tasdiq; boshqa foydalanuvchi ko'rmaydi
  r := public.t2_hm_yuklash_reserve_v1(a, null, null, 'shaxsiy.pdf', 'application/pdf', 1000, sha1, gen_random_uuid());
  if r->>'ok' <> 'true' or r->>'r2_kalit' not like 'docs/u' || a || '/0/0/f%/r1' then raise exception 'ACC1 reserve %', r; end if;
  f1 := (r->>'fayl_id')::bigint; v1 := (r->>'versiya_id')::bigint;
  r := public.t2_hm_yuklash_tasdiq_v1(a, v1); if r->>'ok' <> 'true' then raise exception 'ACC1 tasdiq %', r; end if;
  if (public.t2_hm_yuklab_v1(a, f1)->>'ok') <> 'true' then raise exception 'ACC1 owner yuklab'; end if;
  if (public.t2_hm_yuklab_v1(b, f1)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC1 begona ko''rdi'; end if;
  if (public.t2_hm_royxat_v1(b, null)->'fayllar')::text <> '[]' then raise exception 'ACC1 begona royxat'; end if;

  -- 2. ULASHISH: foydalanuvchi ko'rish -> yuklab oladi, nomlay olmaydi; bekor qilingach yopiladi
  r := public.t2_hm_ulash_v1(a, 'bering', 'fayl', f1, 'foydalanuvchi', b, null, 'korish'); if r->>'ok' <> 'true' then raise exception 'ACC2 ulash %', r; end if;
  ulash := (r->>'ulash_id')::bigint;
  if (public.t2_hm_yuklab_v1(b, f1)->>'ok') <> 'true' then raise exception 'ACC2 ulashilgan yuklab'; end if;
  if (public.t2_hm_fayl_amal_v1(b, f1, 'nomla', null, 'x.pdf')->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC2 korish nomladi'; end if;
  if (public.t2_hm_ulash_v1(b, 'bering', 'fayl', f1, 'foydalanuvchi', c, null, 'korish')->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC2 boshqa ulashdi'; end if;
  perform public.t2_hm_ulash_v1(a, 'bekor', null, null, null, null, null, null, null, null, ulash);
  if (public.t2_hm_yuklab_v1(b, f1)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC2 bekor ishlamadi'; end if;

  -- 3. KOMPANIYA fayli: a'zo bor, a'zo emas yo'q; versiyalar; qaytarish; takroriy operation_id
  r := public.t2_hm_yuklash_reserve_v1(c, k1, null, 'a.xlsx', 'application/octet-stream', 500, sha1, gen_random_uuid());
  if r->>'code' <> 'RUXSAT_YOQ' then raise exception 'ACC3 a''zo emas yukladi %', r; end if;
  r := public.t2_hm_yuklash_reserve_v1(b, k1, null, 'a.xlsx', 'application/octet-stream', 500, sha1, gen_random_uuid());
  f2 := (r->>'fayl_id')::bigint; perform public.t2_hm_yuklash_tasdiq_v1(b, (r->>'versiya_id')::bigint);
  h := gen_random_uuid()::text;
  r := public.t2_hm_yuklash_reserve_v1(b, k1, null, 'A.xlsx', 'application/octet-stream', 700, sha2, h::uuid);
  if (r->>'raqam')::int <> 2 or (r->>'fayl_id')::bigint <> f2 then raise exception 'ACC3 versiya %', r; end if;
  perform public.t2_hm_yuklash_tasdiq_v1(b, (r->>'versiya_id')::bigint);
  r := public.t2_hm_yuklash_reserve_v1(b, k1, null, 'A.xlsx', 'application/octet-stream', 700, sha2, h::uuid);
  if r->>'takror' <> 'true' then raise exception 'ACC3 operation_id takror %', r; end if;
  r := public.t2_hm_yuklash_reserve_v1(b, k1, null, 'a.xlsx', 'application/octet-stream', 700, sha2, gen_random_uuid());
  if r->>'ozgarmadi' <> 'true' then raise exception 'ACC3 bir xil mazmun yangi versiya yaratdi %', r; end if;
  r := public.t2_hm_fayl_amal_v1(b, f2, 'versiya_qaytar', null, null, 1); if r->>'ok' <> 'true' then raise exception 'ACC3 qaytar %', r; end if;
  if (public.t2_hm_yuklab_v1(b, f2)->>'raqam')::int <> 1 then raise exception 'ACC3 joriy versiya 1 emas'; end if;
  if (select count(*) from public.t2_hm_versiya where fayl_id = f2) <> 2 then raise exception 'ACC3 versiya soni'; end if;

  -- 4. QULF (check-out)
  r := public.t2_hm_fayl_amal_v1(a, f2, 'qulf'); if r->>'ok' <> 'true' then raise exception 'ACC4 qulf %', r; end if;
  r := public.t2_hm_yuklash_reserve_v1(b, k1, null, 'a.xlsx', 'application/octet-stream', 900, sha3, gen_random_uuid());
  if r->>'code' <> 'QULFLANGAN' then raise exception 'ACC4 qulfda yuklandi %', r; end if;
  perform public.t2_hm_fayl_amal_v1(a, f2, 'qulf_och');
  r := public.t2_hm_yuklash_reserve_v1(b, k1, null, 'a.xlsx', 'application/octet-stream', 900, sha3, gen_random_uuid());
  if r->>'ok' <> 'true' then raise exception 'ACC4 qulf ochilgach %', r; end if;
  perform public.t2_hm_yuklash_bekor_v1(b, (r->>'versiya_id')::bigint);

  -- 5. KVOTA: shaxsiy 200 MB; limitdan oshgan yuklash serverda bloklanadi; o'qish davom etadi
  r := public.t2_hm_yuklash_reserve_v1(a, null, null, 'katta.bin', 'application/octet-stream', 209715200, sha2, gen_random_uuid());
  if r->>'code' <> 'KVOTA_TUGADI' then raise exception 'ACC5 kvota %', r; end if;
  update public.t2_token_sozlama set disk_bepul_kompaniya_bayt = 1500 where id = 1;
  r := public.t2_hm_yuklash_reserve_v1(b, k1, null, 'b.bin', 'application/octet-stream', 1000, sha3, gen_random_uuid());
  if r->>'code' <> 'KVOTA_TUGADI' then raise exception 'ACC5 kompaniya kvota (1500 chegara, 1200 bor) %', r; end if;
  if (public.t2_hm_yuklab_v1(b, f2)->>'ok') <> 'true' then raise exception 'ACC5 kvotada yuklab olish bloklandi'; end if;

  -- 6. HAVOLA: sukut bo'yicha o'chiq; admin yoqadi; muddatli; o'chirilgach bekor
  r := public.t2_hm_ulash_v1(a, 'bering', 'fayl', f2, 'havola', null, null, 'korish', repeat('f', 64), 24);
  if r->>'code' <> 'HAVOLA_YOQILMAGAN' then raise exception 'ACC6 havola sukut %', r; end if;
  if (public.t2_hm_sozlama_v1(b, k1, true)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC6 oddiy a''zo yoqdi'; end if;
  perform public.t2_hm_sozlama_v1(a, k1, true);
  h := repeat('e', 64);
  r := public.t2_hm_ulash_v1(a, 'bering', 'fayl', f2, 'havola', null, null, 'korish', h, 24); if r->>'ok' <> 'true' then raise exception 'ACC6 havola %', r; end if;
  if (public.t2_hm_havola_ol_v1(h)->>'ok') <> 'true' then raise exception 'ACC6 havola ol'; end if;
  update public.t2_hm_ulashish set tugaydi = now() - interval '1 hour' where havola_xesh = h;
  if (public.t2_hm_havola_ol_v1(h)->>'code') <> 'HAVOLA_YOQ' then raise exception 'ACC6 muddat'; end if;
  update public.t2_hm_ulashish set tugaydi = now() + interval '1 hour' where havola_xesh = h;
  perform public.t2_hm_sozlama_v1(a, k1, false);
  if (public.t2_hm_havola_ol_v1(h)->>'code') <> 'HAVOLA_YOQ' then raise exception 'ACC6 o''chirilgach ishladi'; end if;

  -- 7. TRAFIK hisobi
  if coalesce((select chiqish from public.t2_hm_trafik where kalit = 'k' || k1 || ':' || to_char(now(), 'YYYY-MM')), 0) <= 0 then raise exception 'ACC7 trafik yozilmadi'; end if;

  -- 8. SAVAT 30 kun + tozalash
  perform public.t2_hm_fayl_amal_v1(a, f1, 'savat');
  update public.t2_hm_fayl set savatda = now() - interval '31 days' where id = f1;
  r := public.t2_hm_tozala_ol_v1(null, null, 100);
  if jsonb_array_length(r->'fayllar') < 1 then raise exception 'ACC8 tozala nomzod %', r; end if;
  perform public.t2_hm_tozala_tasdiq_v1(array[f1], '{}', '{}');
  if exists (select 1 from public.t2_hm_fayl where id = f1) then raise exception 'ACC8 o''chmadi'; end if;

  -- 9. KUNLIK HISOB: ortiqcha xotira tokenda, idempotent (ikki marta chaqirilsa bitta yechim); fayllar saqlanadi
  update public.t2_token_sozlama set disk_bepul_kompaniya_bayt = 1000 where id = 1;
  update public.t2_token_narx set birlik_som = 1000000 where amal = 'hujjat_xotira';
  insert into public.t2_token_harakat(kompaniya_id, miqdor, tur, operation_id) values (k1, 100000, 'toldirish', gen_random_uuid());
  tok0 := public.t2_token_balans(k1);
  perform public.t2_hm_hisobla_v1(current_date); tok1 := public.t2_token_balans(k1);
  if tok1 >= tok0 then raise exception 'ACC9 token yechilmadi % %', tok0, tok1; end if;
  perform public.t2_hm_hisobla_v1(current_date);
  if public.t2_token_balans(k1) <> tok1 then raise exception 'ACC9 ikki marta yechildi'; end if;
  select count(*) into hk from public.t2_hm_hisob where kompaniya_id = k1 and tur = 'xotira' and sana = current_date;
  if hk <> 1 then raise exception 'ACC9 hisob yozuvlari %', hk; end if;
  if (public.t2_hm_yuklab_v1(b, f2)->>'ok') <> 'true' then raise exception 'ACC9 hisobdan keyin yuklab olish'; end if;
  if (public.t2_hm_royxat_v1(b, k1)->'kvota'->>'foiz') is null then raise exception 'ACC9 foiz'; end if;

  -- 10. ADMIN: joy bo'shatish faqat boshqaruvchi
  if (public.t2_hm_admin_v1(b, k1)->>'code') <> 'RUXSAT_YOQ' then raise exception 'ACC10 oddiy a''zo admin'; end if;
  if (public.t2_hm_admin_v1(a, k1)->>'ok') <> 'true' then raise exception 'ACC10 admin'; end if;
  r := public.t2_hm_bosh_ol_v1(a, k1, 'eski_versiyalar'); if r->>'ok' <> 'true' then raise exception 'ACC10 bosh %', r; end if;
  perform public.t2_hm_tozala_tasdiq_v1('{}', '{}', array(select (x->>'id')::bigint from jsonb_array_elements(r->'eski') x));
  if not exists (select 1 from public.t2_hm_fayl f join public.t2_hm_versiya vv on vv.id = f.joriy_versiya_id where f.id = f2) then raise exception 'ACC10 joriy versiya o''chdi'; end if;

  -- 11. egalik cheki: ikkala yoki hech biri bo'lmasin
  begin insert into public.t2_hm_fayl(kompaniya_id, egasi_foydalanuvchi_id, nom, yaratdi_id) values (k1, a, 'x', a); raise exception 'ACC11 check ishlamadi';
  exception when check_violation then null; end;
  raise notice 'ACC OK hujjat_maydoni';
end $$;