-- T2-MOLIYA-QARZDORLIK-001 (1/2) - Qarzdorlik (kreditor) asoslari: sxema.
-- Egasi talabi (2026-11-02): postavshik/subpudratchi oldidagi qarz har hujjat bilan asoslanadi.
-- DUBLIKAT YASALMAYDI - mavjud jadvallar kengaytiriladi:
--   * kontragent shartnomasi  = t2_shartnoma (asosiy=false, turi = postavshik | subpudrat | xizmat) + t2_shartnoma_tomon -> t2_kontragent;
--   * obyekt bog'i            = t2_shartnoma_qoshimcha_bog (mavjud);
--   * to'lovlar               = t2_tolov (mavjud; 1C importi keyin to'ldiradi);
--   * ombor kirimi bilan bog' = asos qatoridagi sklad_harakat_id (ixtiyoriy) - t2_sklad_harakat (c11_kontragent_id allaqachon bor).
-- YANGI faqat: t2_qarz_asos (qarz asosi qatorlari) + t2_shartnoma ga ma'lumotnoma (spravka) ustunlari.
-- Qoidalar: summa QQS bilan; minus ruxsat; NULL = noma'lum (0 emas).
begin;

alter table public.t2_shartnoma add column if not exists sana date;
alter table public.t2_shartnoma add column if not exists predmet text;
alter table public.t2_shartnoma add column if not exists spravka_tolangan numeric;
alter table public.t2_shartnoma add column if not exists spravka_qarz numeric;
alter table public.t2_shartnoma add column if not exists spravka_prognoz numeric;
alter table public.t2_shartnoma add column if not exists spravka_sana date;
comment on column public.t2_shartnoma.sana is 'Shartnoma sanasi (kontragent shartnomalari uchun).';
comment on column public.t2_shartnoma.predmet is 'Shartnoma predmeti (nima yetkaziladi / qanday ish).';
comment on column public.t2_shartnoma.spravka_qarz is 'Finansoviy spravkadagi (ma''lumotnoma) qarz, QQS bilan; + biz qarzmiz, - ular qarz. NULL = spravka yo''q. Tizim hisobi bilan solishtiriladi (FARQ).';
comment on column public.t2_shartnoma.spravka_tolangan is 'Spravkadagi to''langan summa (QQS bilan).';
comment on column public.t2_shartnoma.spravka_prognoz is 'Spravkadagi prognoz (QQS bilan).';
comment on column public.t2_shartnoma.spravka_sana is 'Spravka sanasi.';

create table if not exists public.t2_qarz_asos (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  shartnoma_id bigint not null references public.t2_shartnoma(id) on delete cascade,
  tur text not null check (tur in ('yetkazib_berish', 'bajarilgan_ish', 'tolov', 'boshlangich_qoldiq')),
  hujjat_raqam text,
  sana date,
  nomi text,
  birlik text,
  hajm numeric,                -- minus ruxsat (qaytarish/tuzatish)
  narx numeric,                -- QQS bilan birlik narxi
  summa numeric,               -- QQS bilan; NULL = noma'lum; minus ruxsat
  izoh text,
  sklad_harakat_id bigint references public.t2_sklad_harakat(id) on delete set null,
  tolov_id bigint references public.t2_tolov(id) on delete set null,
  tartib integer not null default 0,
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  versiya integer not null default 1,
  operation_id uuid,
  yaratildi timestamptz not null default now(),
  yangilandi timestamptz not null default now(),
  kim text
);
comment on table public.t2_qarz_asos is 'Qarz asosi qatorlari: har kontragent shartnomasi ostida hujjatli asos (nakladnoy/akt/to''lov/boshlang''ich qoldiq). Qarz = boshlang''ich + yetkazilgan + bajarilgan - to''langan.';
comment on column public.t2_qarz_asos.tolov_id is 'Agar to''lov t2_tolov da ham bor bo''lsa - bog''lanadi va ikki marta sanalmaydi.';
create index if not exists t2_qarz_asos_shartnoma_idx on public.t2_qarz_asos(shartnoma_id) where holat = 'faol';
create index if not exists t2_qarz_asos_kompaniya_idx on public.t2_qarz_asos(kompaniya_id);
create index if not exists t2_qarz_asos_sklad_idx on public.t2_qarz_asos(sklad_harakat_id) where sklad_harakat_id is not null;
create index if not exists t2_qarz_asos_tolov_idx on public.t2_qarz_asos(tolov_id) where tolov_id is not null;

alter table public.t2_qarz_asos enable row level security;
revoke all on public.t2_qarz_asos from anon, authenticated;
revoke all on sequence public.t2_qarz_asos_id_seq from anon, authenticated;

commit;
