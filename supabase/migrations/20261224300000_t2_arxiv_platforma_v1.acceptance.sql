-- Acceptance 20261224100000 (yengil, sintetik; tranzaksiya ichida va ROLLBACK). Real ma'lumotga tegmaydi: vaqtinchalik jadval siyosati yo'q,
-- shuning uchun faqat strukturaviy va rad etish tekshiruvlari + bo'sh partiya.
begin;
do $$
declare r jsonb;
begin
  -- 1) reyestr to'liq va qator-arxiv jadvallarida kalit/vaqt bor
  if (select count(*) from public.t2_arxiv_siyosat where rejim = 'qator-arxiv') <> 5 then raise exception 'ACC1: 5 ta qator-arxiv kutilgan'; end if;
  -- 2) noma'lum jadval rad etiladi
  begin perform public.t2_arxiv_batch_v1('t2_qator', 10, null); raise exception 'ACC2: ruxsatsiz jadval o''tdi';
  exception when sqlstate '22023' then null; end;
  -- 3) manifestsiz o'chirish rad etiladi
  r := public.t2_arxiv_ochir_v1('t2_ozgarish', 'arxiv/t2_ozgarish/2026/01/yoq.ndjson.gz', array['1']);
  if (r->>'ok')::boolean or r->>'code' <> 'MANIFEST_YOQ' then raise exception 'ACC3: manifestsiz o''chirish rad etilmadi'; end if;
  -- 4) sintetik manifest + son mos kelmasa rad etiladi, mos kelsa (yo'q idlar) 0 qator o'chiradi
  r := public.t2_arxiv_yoz_v1('t2_ozgarish', '-1..-2', 'arxiv/t2_ozgarish/2026/01/acc-test.ndjson.gz', 2, repeat('a', 64), 10);
  if not (r->>'ok')::boolean then raise exception 'ACC4: manifest yozilmadi'; end if;
  r := public.t2_arxiv_ochir_v1('t2_ozgarish', 'arxiv/t2_ozgarish/2026/01/acc-test.ndjson.gz', array['-1']);
  if r->>'code' <> 'SON_MOS_EMAS' then raise exception 'ACC5: son nomosligi rad etilmadi'; end if;
  r := public.t2_arxiv_ochir_v1('t2_ozgarish', 'arxiv/t2_ozgarish/2026/01/acc-test.ndjson.gz', array['-1', '-2']);
  if not (r->>'ok')::boolean or (r->>'ochirildi')::int <> 0 then raise exception 'ACC6: sintetik idlar o''chirilmasligi kerak edi'; end if;
  -- 5) manifest zid sha256 bilan qayta yozilsa rad etiladi
  r := public.t2_arxiv_yoz_v1('t2_ozgarish', '-1..-2', 'arxiv/t2_ozgarish/2026/01/acc-test.ndjson.gz', 2, repeat('b', 64), 10);
  if r->>'code' <> 'MANIFEST_ZIDDIYAT' then raise exception 'ACC7: ziddiyat rad etilmadi'; end if;
  -- 6) holat funksiyasi
  if (public.t2_arxiv_holat_v1()->>'db_bytes')::bigint <= 0 then raise exception 'ACC8: holat'; end if;
end $$;
rollback;
