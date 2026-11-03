# Desktop D1b object authorization

M3 adds a client adapter for the PR237 ObyektRuxsatPort. The requested base
c7f437e0 predates the PR237 session manager. The adapter matches its port
structurally so integration can happen after both branches are combined.

## Online decision

For each open, the adapter reads GET /api/sessiya, checks the expected actor
and unexpired server session, and rejects fallback signing-key mode. It then
requests an unconditional GET /api/obyekt-paket?obyekt_id=N. The BFF derives
the actor from its session, checks the object's tenant and requires smeta.read,
f2.read and narx.read under its existing policy. The adapter checks the returned
package format, tenant and object, discards the package body, and reads the
session again to confirm the actor and expiry. Both routes use no-store and
reject redirects. The extra package fetch is the cost of using the existing
full-package permission gate. A 304 cannot authorize.

Only a package 403 is passed through as 403. PR237 may use it to permit one
separate legacy server read under that endpoint's own authorization. Other
failures leave the cache closed. Network failure or malformed JSON yields
status 0. The adapter never touches cache, native credentials or key storage.

Bind the adapter's joriy callback to an immutable auth generation and
invalidate it synchronously before logout, refresh, revoke, or actor/company
switch. Use the same authenticated transport for all three requests. The
session reads check continuity but the package does not identify its actor
or session version. They cannot detect an out-of-band A→B→A credential
change. Atomic proof requires the BFF to return the actor and session version
with the package decision, or a transport that pins the credential for the
sequence and invalidates it on auth changes.

The base BFF routes authenticate via Cookie. The Desktop fetch shim strips
cookies and sends Bearer. Installed Desktop therefore still needs a reviewed
BFF transport that authenticates both routes, including origin/preflight policy,
or an approved cookie bridge. The adapter does not convert or persist tokens.
Login/bootstrap and the PR237 loader are integration work. Endpoints are
tested through mocked HTTP responses in this change.

## Key and credential lifecycle

Use the PR237 manager after a verified online session. Start with the BFF
expiry in Unix milliseconds and create an in-memory non-extractable AES-GCM
key. Refresh and tenant/actor switches close the previous generation before
creating a fresh key. Logout, revoke and expiry immediately invalidate cache
handles and clear displayed data. Wait for outstanding writes before deleting
ciphertext and before opening a new cache. A failed cleanup leaves the manager
closed. Restart requires online authorization and a fresh key.

The trusted bootstrap must verify server authorization before exposing cache
or committing a credential. PR237 native IPC is local-origin restricted and
uses a generation ticket for credential writes. Capture the ticket before
starting the authorized login/refresh flow and reject a late save after logout.
Close JS access synchronously before awaiting native credential deletion.
The credential expiry and IPC ticket provide local lifecycle controls.

## Offline lease and revocation

Offline access stays closed. The current BFF does not issue a signed object
lease and the client has no verifier, durable key binding, or revocation sync.
The server session expiry is only an online session bound. A future lease
needs signed issuer, audience, actor, tenant, object, device/key binding,
permission scope, issue and expiry times, and a revocation identifier or epoch.
Verify signature and scope before decrypting. Expiry must withstand clock
rollback and restart. The issuer must define a maximum offline lifetime and
refresh/revocation policy. A disconnected client can enforce local expiry
but learns remote revocations only when it reconnects. Reconnect must recheck
authority before showing cached rows and invalidate keys/data when denied.
The issuer, verifier, trusted time, revocation and device-bound key storage
remain open.
