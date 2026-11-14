-- READ-ONLY (qo'llanmaydi, yozmaydi): a'zoligi 0 bo'lgan FAOL hisoblar ro'yxati — kompaniyasiz qolgan self-registratsiya hisoblari.
-- Ular tizimga kirganda «Kompaniyangizni oching» ekranini ko'radi (20261217210000 + frontend); MAJBURIY kompaniya yaratilmaydi.
-- Shaxsiy ma'lumot (ism/email/telefon) CHIQARILMAYDI — faqat id, kirish usuli belgilari va sanasi.
select u.id as foydalanuvchi_id,
       u.yaratildi,
       (u.google_sub is not null) as google,
       (u.email_tasdiqlandi_at is not null) as email_tasdiqlangan,
       (u.parol_hash is not null) as parolli,
       (u.telefon_manba is not null) as telefon_bilan,
       exists (select 1 from public.t2_ozi_royxat_log l where l.foydalanuvchi_id = u.id) as ozi_royxatdan_otgan
  from public.t2_foydalanuvchi u
 where u.holat = 'faol'
   and not exists (select 1 from public.t2_azolik a where a.foydalanuvchi_id = u.id and a.holat = 'faol')
 order by u.id;