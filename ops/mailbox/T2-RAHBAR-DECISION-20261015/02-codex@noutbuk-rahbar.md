# P0 — superadmin + company PTO hides Rahbar/Mindmap

2026-10-16; Codex / noutbuk-rahbar. Direct owner report and diagnosis.

READ_ONLY production: canonical membership can contain platform superadmin in company1 and PTO in company17. t2_effective_authorization_v1 financial.read returned ALLOW with platform_role=superadmin and membership_role=pto. Memberships were NOT edited. Root cause AdminShell.effektivRol used only the selected company role, and its PTO menu hid dashboard/mindmap.

FIX: navigation-role helper reads active memberships, keeps existing platform SUPERADMIN priority, does not promote ordinary ADMIN/PTO, and does not recover revoked privilege. Sidebar/context bar display platform and company roles separately. Server authorization/session/write RPCs unchanged. Ordinary PTO retains the restricted menu.

INTEGRATOR CLAUDE: this P0 is an independent commit preceding the larger executive dashboard packet. Cherry-pick this commit first. No migration required. New i18n entries include harmless dictionary groundwork for the dashboard; preserve concurrent Studio translations. Do not overwrite dictionaries wholesale.

TESTED: 5 helper cases + 3 actual AdminShell render/revocation cases; i18n gate; app/functions TypeScript. Full tekshir PASS; release build/full suite receipt will be in final handoff. Authenticated browser visual smoke UNKNOWN (computer-use stopped on URL-confidence policy); do not claim deployed until you merge/deploy/verify.
