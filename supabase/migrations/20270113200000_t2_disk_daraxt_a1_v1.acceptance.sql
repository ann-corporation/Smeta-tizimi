-- Qabul sinovi: FAQAT ROLLBACK ichida (rb_run; migratsiyaning o'z begin/commit i yo'q). Haqiqiy ma'lumot: faol a'zo (t2_azolik.holat='faol') va faol
-- shartnoma bog'i + loyihasi bor obyekt tanlanadi; sinov qatorlari ROLLBACK bilan yo'qoladi. Xato: raise exception 'ACC: ...'.
do $$
declare
  k bigint; a bigint; o bigint; sh bigint; l bigint; r1 bigint; r2 bigint; r3 bigint; r4 bigint; r5 bigint; r6 bigint; x jsonb; y jsonb; n integer; n0 integer; used0 bigint; kal text;
  f1 bigint; p1 bigint; yol text; bt boolean; r7 bigint; r8 bigint; r9 bigint; ft bigint; fc integer; pid bigint; vsum bigint; k2 bigint; sha_a text := repeat('a', 64); sha_b text := repeat('b', 64); sha_c text := repeat('c', 64); sha_d text := repeat('d', 64);
begin
  -- 0. BACKFILL invarianti: har saqlangan hujjat t2_hm_versiya ga bog'langan yoki shu hujjatning bir xil sha256 li versiyasi bor; R2 ga tegilmagan
  select count(*) into n from public.t2_document_registry d where d.canonical_storage_status = 'stored'
     and not exists (select 1 from public.t2_hm_versiya v where v.registry_id = d.id)
     and not exists (select 1 from public.t2_hm_versiya v where v.sha256 = d.sha256 and v.tashqi_kalit);
  if n <> 0 then raise exception 'ACC0 backfill: % ta hujjat daraxtga ulanmagan', n; end if;
  if exists (select 1 from public.t2_hm_versiya v where v.registry_id is not null and not v.tashqi_kalit) then raise exception 'ACC0 tashqi_kalit belgisi yo''q'; end if;
  if exists (select 1 from public.t2_hm_versiya v join public.t2_document_registry d on d.id = v.registry_id where v.r2_kalit is distinct from coalesce(d.blob_key, d.r2_key)) then raise exception 'ACC0 R2 kaliti registry bilan mos emas (nusxa/o''zgarish)'; end if;
  if exists (select 1 from public.t2_fayl_papka p where p.tizim and (p.tizim_kalit is null or p.kompaniya_id is null)) then raise exception 'ACC0 tizim papkasi noto''g''ri'; end if;
  select count(*) into n0 from public.t2_hm_versiya where registry_id is not null;

  -- sinov muhiti
  select b.obyekt_id, s.id, s.kompaniya_id, ob.loyiha_id into o, sh, k, l from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id
    join public.t2_obyekt ob on ob.id = b.obyekt_id and ob.kompaniya_id = s.kompaniya_id and ob.loyiha_id is not null
   where b.holat = 'faol' and exists (select 1 from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol' where m.kompaniya_id = s.kompaniya_id and m.holat = 'faol')
   order by b.obyekt_id limit 1;
  if o is null then raise exception 'ACC: sinov uchun faol shartnoma bog''li, loyihali obyekt topilmadi'; end if;
  select m.foydalanuvchi_id into a from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol'
   where m.kompaniya_id = k and m.holat = 'faol' and m.rol in ('admin', 'boss', 'rahbar', 'director') order by m.foydalanuvchi_id limit 1;
  if a is null then select m.foydalanuvchi_id into a from public.t2_azolik m join public.t2_foydalanuvchi u on u.id = m.foydalanuvchi_id and u.holat = 'faol' where m.kompaniya_id = k and m.holat = 'faol' limit 1; end if;
  select kompaniya_id into k2 from public.t2_azolik where holat = 'faol' and kompaniya_id <> k limit 1;
  select (public._t2_hm_kvota_v1(k, null)->>'ishlatilgan')::bigint into used0;

  -- 1. Obyekt darajasidagi hujjat: Loyiha -> Shartnoma -> Obyekt -> Tur -> Oy (hamma papka tizim=true); aniq nom
  insert into public.t2_document_registry(kompaniya_id, loyiha_id, obyekt_id, document_type, revision, original_filename, mime_type, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, null, o, 'f2_hujjat', '2026-11', 'acc_f2_v1.xlsx', 'application/octet-stream', 1000, sha_a, 99101, 'stored', 'active', now() - interval '2 hour', 'docs/acc/r1', a) returning id into r1;
  x := public.t2_disk_tizim_yoz_v1(a, k, r1, 'f2', 41, 'f2:acc:41', null, 'F-2 ' || chr(8470) || '5 ' || chr(8212) || ' ACC ' || chr(8212) || ' 2026-11');
  if x->>'ok' <> 'true' or (x->>'raqam')::int <> 1 or (x->>'yangi')::boolean is not true then raise exception 'ACC1 birinchi yozuv %', x; end if;
  f1 := (x->>'fayl_id')::bigint; p1 := (x->>'papka_id')::bigint;
  with recursive z(id, ota_id, nom, tizim, d) as (select id, ota_id, nom, tizim, 0 from public.t2_fayl_papka where id = p1
    union all select p.id, p.ota_id, p.nom, p.tizim, z.d + 1 from public.t2_fayl_papka p join z on p.id = z.ota_id)
  select string_agg(nom, ' > ' order by d desc), bool_and(tizim) into yol, bt from z;
  if bt is not true or yol not like '%Shartnoma %' or yol not like '% > F-2 hujjatlari > 2026-11' or split_part(yol, ' > ', 3) <> (select nom from public.t2_obyekt where id = o)
     or split_part(yol, ' > ', 1) <> (select nom from public.t2_loyiha where id = l) then raise exception 'ACC1 daraxt yo''li: %', yol; end if;
  select 1 into n from public.t2_hm_fayl where id = f1 and manba_turi = 'f2' and manba_id = 41 and hujjat_kalit = 'f2:acc:41' and nom like 'F-2 %' and kompaniya_id = k and egasi_foydalanuvchi_id is null;
  if n is null then raise exception 'ACC1 fayl metama''lumoti'; end if;
  if (select r2_kalit from public.t2_hm_versiya where registry_id = r1) <> 'docs/acc/r1' or not (select tashqi_kalit from public.t2_hm_versiya where registry_id = r1) then raise exception 'ACC1 tashqi kalit'; end if;

  -- 2. Qayta yasalsa = YANGI VERSIYA (bir hujjat); bir xil mazmun/qayta chaqirish = o'zgarish yo'q
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'f2_hujjat', '2026-11', 'acc_f2_v2.xlsx', 2000, sha_b, 99102, 'stored', 'active', now() - interval '1 hour', 'docs/acc/r2', a) returning id into r2;
  x := public.t2_disk_tizim_yoz_v1(a, k, r2, 'f2', 41, 'f2:acc:41', null, null);
  if (x->>'fayl_id')::bigint <> f1 or (x->>'raqam')::int <> 2 or (x->>'yangi')::boolean is not false then raise exception 'ACC2 ikkinchi versiya yangi fayl bo''ldi %', x; end if;
  if (select joriy_versiya_id from public.t2_hm_fayl where id = f1) <> (x->>'versiya_id')::bigint then raise exception 'ACC2 joriy versiya'; end if;
  if (public.t2_disk_tizim_yoz_v1(a, k, r2, 'f2', 41, 'f2:acc:41', null, null)->>'takror') <> 'true' then raise exception 'ACC2 takroriy chaqiruv'; end if;
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'f2_hujjat', '2026-11', 'acc_f2_nusxa.xlsx', 2000, sha_b, 99103, 'stored', 'active', now(), 'docs/acc/r3', a) returning id into r3;
  y := public.t2_disk_tizim_yoz_v1(a, k, r3, 'f2', 41, 'f2:acc:41', null, null);
  if y->>'takror' <> 'true' or y->>'dedup' <> 'true' or (select count(*) from public.t2_hm_versiya where fayl_id = f1) <> 2 then raise exception 'ACC2 bir xil mazmun versiya qo''shdi %', y; end if;
  -- foydalanuvchi faylni ko'chirsa/nomlasa: yangi versiya o'sha joyda qoladi
  update public.t2_hm_fayl set nom = 'Mening nomim ACC' where id = f1;
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'f2_hujjat', '2026-11', 'acc_f2_v3.xlsx', 500, sha_c, 99104, 'stored', 'active', now(), 'docs/acc/r4', a) returning id into r4;
  x := public.t2_disk_tizim_yoz_v1(a, k, r4, 'f2', 41, 'f2:acc:41', null, null);
  if (x->>'raqam')::int <> 3 or (select nom from public.t2_hm_fayl where id = f1) <> 'Mening nomim ACC' then raise exception 'ACC2 nom saqlanmadi %', x; end if;

  -- 3. Shartnoma darajasidagi hujjat (F-3): Loyiha -> Shartnoma -> F-3 -> Oy (obyekt papkasi YO'Q)
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'f3', '2026-08', 'acc_f3.xlsx', 700, sha_d, 99105, 'stored', 'active', now(), 'docs/acc/r5', a) returning id into r5;
  x := public.t2_disk_tizim_yoz_v1(a, k, r5, 'forma3', 9, 'forma3:acc:9', null, null);
  with recursive z(id, ota_id, nom, d) as (select id, ota_id, nom, 0 from public.t2_fayl_papka where id = (x->>'papka_id')::bigint
    union all select p.id, p.ota_id, p.nom, z.d + 1 from public.t2_fayl_papka p join z on p.id = z.ota_id)
  select string_agg(nom, ' > ' order by d desc) into yol from z;
  if yol not like '%Shartnoma %' or yol not like '% > F-3 > 2026-08' or array_length(string_to_array(yol, ' > '), 1) <> 4 then raise exception 'ACC3 F-3 shartnoma darajasida emas: %', yol; end if;

  -- 4. Loyihasiz/obyektsiz hujjat: "Biriktirilmagan" (tizim papkasi), faylning o'zi shu papkada
  insert into public.t2_document_registry(kompaniya_id, document_type, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, 'nashr', 'acc_reestr_2026-11-13.xlsx', 300, repeat('e', 64), 99106, 'stored', 'active', now(), 'docs/acc/r6', a) returning id into r6;
  x := public.t2_disk_tizim_yoz_v1(a, k, r6, null, null, null, null, null);
  if (select tizim_kalit from public.t2_fayl_papka where id = (x->>'papka_id')::bigint) <> 'biriktirilmagan' then raise exception 'ACC4 Biriktirilmagan %', x; end if;

  -- 5. Tizim papkasi himoyasi (server majburlaydi); ichiga foydalanuvchi o'z papkasi va faylini qo'sha oladi
  if (public.t2_hm_papka_amal_v1(a, k, 'ochir', p1)->>'code') <> 'TIZIM_PAPKA' then raise exception 'ACC5 tizim papkasi o''chirildi'; end if;
  if (public.t2_hm_papka_amal_v1(a, k, 'nomla', p1, 'Boshqa nom')->>'code') <> 'TIZIM_PAPKA' then raise exception 'ACC5 tizim papkasi nomlandi'; end if;
  if (public.t2_hm_papka_amal_v1(a, k, 'kochir', p1, null, null)->>'code') <> 'TIZIM_PAPKA' then raise exception 'ACC5 tizim papkasi ko''chirildi'; end if;
  x := public.t2_hm_papka_amal_v1(a, k, 'yarat', null, 'ACC mening papkam', p1);
  if x->>'ok' <> 'true' then raise exception 'ACC5 tizim papkasi ichida papka yaratilmadi %', x; end if;
  if (public.t2_hm_papka_amal_v1(a, k, 'ochir', (x->>'papka_id')::bigint)->>'ok') <> 'true' then raise exception 'ACC5 o''z papkasi o''chmadi'; end if;
  x := public.t2_hm_yuklash_reserve_v1(a, k, p1, 'acc_qolda.pdf', 'application/pdf', 100, repeat('1', 64), gen_random_uuid());
  if x->>'ok' <> 'true' then raise exception 'ACC5 tizim papkasiga fayl qo''shib bo''lmadi %', x; end if;
  perform public.t2_hm_yuklash_tasdiq_v1(a, (x->>'versiya_id')::bigint);
  y := public.t2_hm_royxat_v1(a, k, null, false);
  if y->>'ok' <> 'true' or not exists (select 1 from jsonb_array_elements(y->'papkalar') e where (e->>'tizim')::boolean) then raise exception 'ACC5 royxatda tizim belgisi yo''q %', y; end if;

  -- 6. Hajm BIR marta: faqat t2_hm_versiya (tizim hujjatlari: 1000 + 2000 + 500 + 700 + 300; nusxa va qo'lda yuklangan 100 qo'shiladi, registry ikkinchi marta sanalmaydi)
  select coalesce(sum(v.bayt), 0) into vsum from public.t2_hm_versiya v join public.t2_hm_fayl f on f.id = v.fayl_id where f.kompaniya_id = k;
  if (public._t2_hm_kvota_v1(k, null)->>'ishlatilgan')::bigint <> vsum then raise exception 'ACC6 hajm t2_hm_versiya yig''indisiga teng emas: % vs %', public._t2_hm_kvota_v1(k, null), vsum; end if;
  if (public._t2_hm_kvota_v1(k, null)->>'ishlatilgan')::bigint <> used0 + 1000 + 2000 + 500 + 700 + 300 + 100 then raise exception 'ACC6 hajm o''sishi: % -> %', used0, public._t2_hm_kvota_v1(k, null); end if;

  -- 7. Tashqi (registry) R2 kalitlari tozalashda HECH QACHON qaytarilmaydi: savatdagi 40 kunlik tizim fayli / eski versiyalar / savatni bo'shatish
  perform public.t2_hm_fayl_amal_v1(a, f1, 'savat');
  update public.t2_hm_fayl set savatda = now() - interval '40 days' where id = f1;
  if (public.t2_hm_tozala_ol_v1(null, null, 500)::text) like '%docs/acc/r%' then raise exception 'ACC7 tozala tashqi kalitni qaytardi'; end if;
  if (public.t2_hm_tozala_ol_v1(a, f1, 1)::text) like '%docs/acc/r%' then raise exception 'ACC7 abadiy o''chirish tashqi kalitni qaytardi'; end if;
  if (public.t2_hm_bosh_ol_v1(a, k, 'savat')::text) like '%docs/acc/r%' then raise exception 'ACC7 savatni bo''shatish tashqi kalitni qaytardi'; end if;
  if (public.t2_hm_bosh_ol_v1(a, k, 'eski_versiyalar')::text) like '%docs/acc/r%' then raise exception 'ACC7 eski versiyalar tashqi kalitni qaytardi'; end if;
  perform public.t2_hm_tozala_tasdiq_v1(array[f1], '{}', '{}');
  if not exists (select 1 from public.t2_document_registry where id in (r1, r2, r3, r4)) then raise exception 'ACC7 registry qatori o''chdi'; end if;

  -- 8. Ruxsat va izolyatsiya; backfill idempotent
  begin perform public.t2_disk_tizim_yoz_v1(-1, k, r5, null, null, null, null, null); raise exception 'ACC8 a''zo bo''lmagan yozdi';
  exception when others then if sqlerrm like 'ACC8%' then raise; end if; end;
  if k2 is not null then
    insert into public.t2_document_registry(kompaniya_id, document_type, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, r2_key)
    values (k2, 'nashr', 'acc_begona.xlsx', 10, repeat('f', 64), 99107, 'stored', 'active', 'docs/acc/begona') returning id into r6;
    if (public.t2_disk_tizim_yoz_v1(a, k, r6, null, null, null, null, null)->>'code') <> 'HUJJAT_TOPILMADI' then raise exception 'ACC8 begona kompaniya hujjati yozildi'; end if;
  end if;
  select count(*) into n from public.t2_hm_versiya where registry_id is not null;
  perform public._t2_disk_tizim_yoz_ich_v1(0, d.kompaniya_id, d.id, null, null, null, null, null) from public.t2_document_registry d where d.canonical_storage_status = 'stored' and d.id not in (r1, r2, r3, r4, r5, r6);
  if (select count(*) from public.t2_hm_versiya where registry_id is not null) <> n then raise exception 'ACC8 backfill idempotent emas'; end if;

  -- 9. KALIT NOMUVOFIQLIGI YO'Q: backfill A2 bilan BIR XIL kalit formatini ishlatadi; aniqlanmagan hujjat A2 da kalit kelganda O'SHA faylga versiya bo'lib ulanadi
  -- 9a. kalit funksiyalari vektorlari (frontend/src/lib/disk-kalit-vektor.json bilan bir xil; vitest shu faylni tekshiradi)
  if public._t2_disk_kalit_v1('f2', 5, 'f2_hujjat', 80, '2026-11', 'x.xlsx', null) <> 'f2:5' then raise exception 'ACC9 vektor f2'; end if;
  if public._t2_disk_kalit_v1('forma3', 9, 'f3', 80, '2026-08', 'x.xlsx', null) <> 'f3:9' then raise exception 'ACC9 vektor f3'; end if;
  if public._t2_disk_kalit_v1(null, null, 'nakopitelniy', 80, '2026-08', 'x.xlsx', null) <> 'nakopitelniy:80:2026-08' then raise exception 'ACC9 vektor nakopitelniy'; end if;
  if public._t2_disk_kalit_v1(null, null, 'slichitelniy', 80, null, 'x.xlsx', null) <> 'slichitelniy:80:-' then raise exception 'ACC9 vektor slichitelniy'; end if;
  if public._t2_disk_vaqtincha_kalit_v1('f2_hujjat', 80, '36', null, '2026-05') <> 'tmp:f2:80:36:2026-05' then raise exception 'ACC9 vektor tmp f2'; end if;
  if public._t2_disk_vaqtincha_kalit_v1('f3', null, null, 5, '2026-08') <> 'tmp:f3:5:2026-08' then raise exception 'ACC9 vektor tmp f3'; end if;
  if public._t2_disk_raqam_v1('Obyekt_' || chr(8470) || '1_AKT_F-2_' || chr(8470) || '36_2026-05.xlsx') <> '36' or public._t2_disk_raqam_v1('SINOV_F-2_2026-11.xlsx') is not null then raise exception 'ACC9 raqam'; end if;
  -- 9b. backfill qilingan haqiqiy kalitlar akt/forma3 ga mos (aniqlanmaganlari vaqtinchalik)
  if exists (select 1 from public.t2_hm_fayl f where f.hujjat_kalit ~ '^f2:\d+$' and (f.manba_turi <> 'f2' or not exists (select 1 from public.t2_akt a where a.id = substr(f.hujjat_kalit, 4)::bigint and a.kompaniya_id = f.kompaniya_id))) then raise exception 'ACC9 f2 kalit akt_id ga mos emas'; end if;
  if exists (select 1 from public.t2_hm_fayl f where f.hujjat_kalit ~ '^f3:\d+$' and (f.manba_turi <> 'forma3' or not exists (select 1 from public.t2_forma3 a where a.id = substr(f.hujjat_kalit, 4)::bigint and a.kompaniya_id = f.kompaniya_id))) then raise exception 'ACC9 f3 kalit forma3_id ga mos emas'; end if;
  -- 9c. F-2: backfill (kalit berilmaydi) aniqlay olmasa vaqtinchalik kalit; keyin A2 haqiqiy kalit bilan keladi -> shu fayl, yangi versiya, yangi fayl YO'Q
  select count(*) into fc from public.t2_hm_fayl where kompaniya_id = k;
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'f2_hujjat', '2027-01', 'ACC_AKT_F-2_' || chr(8470) || '9991_2027-01.xlsx', 400, repeat('1', 64), 99201, 'stored', 'active', now() - interval '3 hour', 'docs/acc/t1', a) returning id into r7;
  x := public._t2_disk_tizim_yoz_ich_v1(0, k, r7, null, null, null, null, null);
  ft := (x->>'fayl_id')::bigint;
  if x->>'kalit' <> 'tmp:f2:' || o || ':9991:2027-01' then raise exception 'ACC9 vaqtinchalik f2 kalit %', x; end if;
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'f2_hujjat', '2027-01', 'ACC_AKT_F-2_' || chr(8470) || '9991_2027-01.xlsx', 450, repeat('2', 64), 99202, 'stored', 'active', now() - interval '2 hour', 'docs/acc/t2', a) returning id into r8;
  x := public.t2_disk_tizim_yoz_v1(a, k, r8, 'f2', 880001, 'f2:880001', null, null);
  if (x->>'fayl_id')::bigint <> ft or (x->>'raqam')::int <> 2 or (x->>'yangi')::boolean is not false then raise exception 'ACC9 F-2: yangi fayl yaratildi yoki versiya bo''lib ulanmadi %', x; end if;
  select 1 into n from public.t2_hm_fayl where id = ft and hujjat_kalit = 'f2:880001' and manba_id = 880001 and manba_turi = 'f2';
  if n is null then raise exception 'ACC9 F-2 fayl qayta kalitlanmadi'; end if;
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'f2_hujjat', '2027-01', 'ACC_AKT_F-2_' || chr(8470) || '9991_2027-01.xlsx', 470, repeat('3', 64), 99203, 'stored', 'active', now() - interval '1 hour', 'docs/acc/t3', a) returning id into r9;
  x := public.t2_disk_tizim_yoz_v1(a, k, r9, 'f2', 880001, 'f2:880001', null, null);
  if (x->>'fayl_id')::bigint <> ft or (x->>'raqam')::int <> 3 then raise exception 'ACC9 F-2 uchinchi versiya %', x; end if;
  if (select count(*) from public.t2_hm_fayl where kompaniya_id = k) <> fc + 1 then raise exception 'ACC9 F-2 uchun bittadan ortiq fayl yaratildi'; end if;
  -- 9d. F-3: shartnoma bo'yicha vaqtinchalik kalit -> forma3_id bilan ulanadi
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'f3', '2027-01', 'acc_f3_2027-01.xlsx', 300, repeat('4', 64), 99204, 'stored', 'active', now() - interval '2 hour', 'docs/acc/t4', a) returning id into r7;
  x := public._t2_disk_tizim_yoz_ich_v1(0, k, r7, null, null, null, null, null);
  ft := (x->>'fayl_id')::bigint;
  if x->>'kalit' <> 'tmp:f3:' || sh || ':2027-01' then raise exception 'ACC9 vaqtinchalik f3 kalit %', x; end if;
  insert into public.t2_document_registry(kompaniya_id, obyekt_id, document_type, revision, original_filename, size_bytes, sha256, revision_seq, canonical_storage_status, status, finalized_at, r2_key, actor_id)
  values (k, o, 'f3', '2027-01', 'acc_f3_2027-01_qayta.xlsx', 320, repeat('5', 64), 99205, 'stored', 'active', now() - interval '1 hour', 'docs/acc/t5', a) returning id into r8;
  x := public.t2_disk_tizim_yoz_v1(a, k, r8, 'forma3', 880002, 'f3:880002', sh, null);
  if (x->>'fayl_id')::bigint <> ft or (x->>'raqam')::int <> 2 then raise exception 'ACC9 F-3 forma3_id bilan ulanmadi %', x; end if;
  select 1 into n from public.t2_hm_fayl where id = ft and hujjat_kalit = 'f3:880002' and manba_id = 880002 and manba_turi = 'forma3';
  if n is null then raise exception 'ACC9 F-3 fayl qayta kalitlanmadi'; end if;
  raise notice 'ACC OK: t2_disk_daraxt_a1_v1 (K=%, A=%, O=%, SH=%, backfill versiyalar=%)', k, a, o, sh, n0;
end $$;
