# QURAI native Android: CI and release

## CI (`.github/workflows/android-native.yml`)

| Trigger | What runs | Signing |
| --- | --- | --- |
| `pull_request` (paths `android-native/**`, the workflow) | `testDebugUnitTest lintDebug assembleRelease`, permission policy, manifest JSON | never (APK stays unsigned, `signed:false`) |
| `push` to `main`, `workflow_dispatch` | same, plus `zipalign` + `apksigner sign` + `apksigner verify --print-certs` | yes, if all four secrets exist |
| `push`/dispatch, job `instrumented` | `connectedDebugAndroidTest` on API 34 x86_64 emulator | n/a; skipped while no `androidTest` sources exist |

Secrets (same names as `mobile.yml`): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. They enter only the sign step via `env:`; the keystore is decoded into `$RUNNER_TEMP` and deleted right after signing. Only the public certificate SHA-256 digest is printed.

Permission policy (`aapt2 dump permissions`): allowed `INTERNET`, `CAMERA`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`, `USE_BIOMETRIC`/`USE_FINGERPRINT` (qulf), plus what WorkManager/AndroidX merge in (`WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`, `uz.anncorp.smeta.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`). Anything else fails the build. When a feature needs a new permission, update the allow-list in the workflow in the same PR.

Artifact `android-native-apk` contains `qurai-<versionName>-native-release.apk` and `android-native-manifest.json`:
`{version, generatedAtUtc, file, bytes, sha256, signed, minSdk}` (the input format of `frontend/scripts/generate-mobile-release.mjs android`). `versionName` must match `d{1,4}.d{1,4}.d{1,6}` (server `ilovaVersiya()` rule); CI fails otherwise.

Local pre-flight: `cd android-native; .\gradlew.bat testDebugUnitTest lintDebug assembleRelease` (needs `local.properties` with `sdk.dir`, ignored by git).

## Upgrade continuity from the Tauri APK

- The Tauri Android app (`frontend/src-tauri/tauri.conf.json`, `identifier`) and the native app share `applicationId = uz.anncorp.smeta`.
- Both are signed with the same release keystore (the `ANDROID_KEYSTORE_*` secrets), so Android treats the native APK as an update of the installed Tauri app and keeps the install in place.
- Requirement: native `versionCode` must be higher than any shipped Tauri one. Tauri uses `major*1e6 + minor*1e3 + patch` (0.1.1 -> 1001); native starts at `2_000_000`. Never lower it; bump by at least 1 on every release.
- Hard rules: never sign a published native build with another key (install fails with a signature mismatch and users must uninstall, losing local data). Debug builds use `uz.anncorp.smeta.debug` and install side by side.
- Unsigned or PR artifacts (`signed:false`) must never be uploaded to R2.

## Release steps (L0, manual)

1. Run the workflow on `main` (push or `workflow_dispatch`), download artifact `android-native-apk` (Actions UI or `gh run download <run-id> -n android-native-apk -D C:\Temp\qurai-android`).
2. Check the manifest: `signed` must be `true`, `version` the intended one.
3. Upload to R2 (key `reliz/android/<ver>/<sha>/<file>`, bucket `smeta-tizimi-canonical`):
   - Preferred: `frontend\scripts\reliz-yukla.ps1 -Platform android -File C:\Temp\qurai-android\qurai-<ver>-native-release.apk -Version <ver> -Signed $true -MinSdk 26` (add `-DryRun` first). It prints the manifest input.
   - Raw equivalent: `npx --yes wrangler@4 r2 object put "smeta-tizimi-canonical/reliz/android/<ver>/<sha>/<file>" --file <apk> --content-type application/vnd.android.package-archive --remote`
4. Generate the public manifest: `node frontend/scripts/generate-mobile-release.mjs android <path-to-android-native-manifest.json>` (writes `frontend/public/mobile-release.json`).
5. Add a `public/yangiliklar.json` entry, open a PR, merge on green CI.

Note: `reliz-yukla.ps1` computes version from `tauri.conf.json` unless `-Version` is given; always pass `-Version` for native builds and `-MinSdk 26`.

## Retiring the Tauri Android job

When the native app ships (first signed native release uploaded and `mobile-release.json` points to it), remove the `android` job from `.github/workflows/mobile.yml`: delete the job, the `ANDROID_PLATFORM/BUILD_TOOLS/NDK` env entries, and change `release.needs` to `[ios, macos]`. The prepared change is a separate commit titled "chore(mobile): Tauri android jobini olib tashlash (native relizdan keyin)" on `claude/android-ci`; drop it until native has shipped. Do not delete `frontend/src-tauri` Android overlay files yet (desktop/iOS share the Tauri crate).