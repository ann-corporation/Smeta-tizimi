# Windows x64 release

Run from the repository root on Windows with Node.js, Rust MSVC and the Windows SDK.

```powershell
.\frontend\src-tauri\desktop-build.ps1 -ReleaseDir C:\Temp\smeta-release-0.1.0
.\frontend\src-tauri\desktop-release-r2.ps1 -ReleaseDir C:\Temp\smeta-release-0.1.0
```

Use a new release directory for each build. The build stages the NSIS installer,
`INSTALL_RU.md` and a UTF-8 `installer-manifest.json` with UTC generation time and
the final installer SHA-256. `NotSigned` is the unsigned release policy.

To sign the installer, supply `-SignerThumbprint` for a code-signing certificate
in the current user's Windows certificate store. Put Windows SDK SignTool on
PATH and set `SMETA_SIGN_TIMESTAMP_URL` to the approved HTTPS RFC 3161 endpoint.
The manifest is generated after signing and verification. For a signed release,
also pass `-ApprovedSignerThumbprint` to the R2 script.

For an existing installer, `desktop-release-manifest.ps1 -InstallerPath <path>
-ExpectedSha256 <trusted-hash>` emits the manifest JSON after verification.
Use the hash from an independent release receipt.

The R2 script defaults to local validation without requiring AWS CLI or credentials.
For publication, the release owner supplies `R2_ACCOUNT_ID`, `R2_BUCKET`,
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in the process environment,
installs AWS CLI and adds `-Upload`. The object prefix is
`windows/<version>/<sha256>/`. The manifest is uploaded last so retries with the
same package reuse the same keys. See the [Cloudflare R2 CLI guide](https://developers.cloudflare.com/r2/get-started/cli/).
