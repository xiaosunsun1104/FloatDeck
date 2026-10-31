# Windows installer

The Windows x64 installer is built with Electron Builder's NSIS target. Run `npm ci` followed by `npm run build:installer` on Windows x64. The output is `dist/FloatDeck-Setup-1.0.0-x64.exe`. It contains the Electron runtime and an explicit allowlist of application files; build dependencies, test artifacts and local website profiles are excluded.

The installer uses a per-user setup wizard with a configurable destination, desktop and Start menu shortcuts, and a Windows uninstall entry. It does not launch the app automatically after setup. Its stable application ID is `org.floatdeck.app`. No signing certificate is configured, so the current installer and executable are unsigned.

Both installation formats explicitly use `%APPDATA%\duoview` for user data and session data, with the same persistent website partition. Installation and removal do not migrate, bundle or erase website data. `deleteAppDataOnUninstall` is disabled. A website can still expire or revoke a session independently.

## Validation on 2026-10-31

- `npm test`: all 15 tests passed.
- `npm run test:session`: restart, changed installation path, packaged/development launch, separate profiles, interrupted-save recovery, server receipt of cookies, localStorage, IndexedDB, final close writes and logout checks passed.
- `npm run test:installer`: built a separate NSIS fixture with a unique application ID, executable and shortcut names. Silent install and reinstall to an isolated directory passed; installed executable and session source hashes matched the prepared payload. Desktop and Start menu shortcuts were present. Uninstall removed the test payload and shortcuts. The fixture never launched the user's actual profile.

The installer fixture uses the production setup options except for its test identity and output paths. No second physical computer, Windows restart or reputation/signature prompt has been tested. Existing always-on-top and website compatibility limits described in the README still apply.

At this change, `npm audit` reports a minimatch denial-of-service advisory in Electron Builder's development dependency tree. These build dependencies are not included in the installed application. Do not apply the suggested forced downgrade of Electron Builder or a global incompatible minimatch override; reassess the build-tool dependency updates separately.

The original `v1.0.0` tag and portable ZIP remain unchanged. The installer is an additional packaging format for the same application runtime. Its packaging helpers are added on `main` after the original tag.
