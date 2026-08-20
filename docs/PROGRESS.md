# PROGRESS

อัปเดตล่าสุด: 2026-08-20

## สถานะ

- Phase 0 — Discovery & Architecture: **Completed**
- Phase 1 — Google Sheets / Apps Script Foundation: **Completed and live verified**
- Phase 2 — Backend API / Validation / Duplicate / Audit: **Completed**
- Phase 3 — Gemini Vision Structured OCR: **Completed and live verified**
- Phase 4 — Mobile Frontend / Review / History / Edit: **Completed**
- Phase 5 — Dashboard / Analytics: **Completed**
- Phase 6 — PWA / Offline App Shell: **Completed**
- Phase 7 — Static / Unit QA: **Passed**
- Phase 8 — Contractor & Labor Management: **Completed and live verified**
- Production Closeout: **In acceptance — one real post-time-fix save remains**

## Live verified foundation

- Backend health status: ready
- Backend version: `1.3.0`
- Spreadsheet / Schema / Settings / Drive / Gemini / Access Token: configured
- Gemini model: `gemini-3.6-flash`
- Apps Script deployment URL recorded
- Production OCR incident `SUCCESS → FAILED` fixed and verified at backend level
- GitHub Pages deployment pipeline active
- Main CI active

## Current production release

- Frontend/PWA: `2.6.2`
- Backend: `1.3.0`
- API: `v1`
- Gemini schema: `1.0.0`
- Service Worker cache: `palm-ledger-v2.6.2`

## UI polish 2.6.2

- Modernized app chrome with subtle translucent top/bottom surfaces
- Refined card depth, borders and spacing without changing navigation or business flow
- Improved primary capture action hierarchy and touch feedback
- Improved form focus states for outdoor/mobile readability
- Added light micro-interactions with `prefers-reduced-motion` support
- Preserved dark-mode behavior
- Added `modern-polish.css` as a separate visual-only override layer for safer maintenance

## Production capabilities

- Mobile camera/upload/rotate/review/manual entry
- Gemini Structured JSON receipt extraction
- Confidence and missing-field handling
- Receipt times with seconds (`HH:MM:SS`)
- Server-side weight/amount validation
- Duplicate scoring and override
- Idempotent create requests
- Sales create/list/get/update/void
- Buyers auto-registration
- Receipt image storage and in-app viewing
- Dashboard summary/monthly/buyer comparison
- Audit trail and application logs
- Draft recovery and offline save queue
- Contractor/team/individual labor management
- Per-kilogram, per-person and self-managed calculations
- Labor payment tracking and history
- Multi-owner template isolation
- Access Token hashing and local-device pairing
- Automated repository checks and GitHub Pages deployment
- Production smoke workflow for deployed frontend + backend health
- Operational Spreadsheet backup/recovery module (`Backup.gs`)

## Production backup

`apps-script/Backup.gs` provides:

- `createDataBackup()` — point-in-time Spreadsheet backup
- `installDailyBackupTrigger()` — daily backup trigger
- `getBackupStatus()` — non-secret health/status
- `createRestoreCopyFromBackup()` — safe restore review copy without overwriting production
- Retention: latest 30 backups

Backend backup helpers require one Apps Script update/deploy/setup before they become active in production. See `docs/BACKUP_RESTORE.md`.

## Remaining production acceptance

Only one user-device action remains before marking the project `Production Ready — Closed`:

1. Open the current deployed PWA (`2.6.2`, which includes the `2.6.1` time fix) on the real mobile device.
2. Scan a receipt containing seconds in TimeIn/TimeOut.
3. Save the sale normally without manually rounding the times.
4. Verify the new Sales row stores the same `HH:MM:SS` values shown on the receipt.

This cannot be simulated from repository CI because it depends on the real camera/browser/PWA device path and production Access Token. After the user performs the save, the resulting row can be verified directly in Google Sheets.

## Resources

- Apps Script Project: https://script.google.com/u/0/home/projects/1PzG5lE7bxpSMSyO_BOBx9DGuFTZMTw_7mBV7o12c6HoWMKqzLlmwaGaz/edit
- Apps Script Deployment: https://script.google.com/macros/s/AKfycbwttI8iFWVls788jXX-nV_7MZsFvwGkwDaIU3JdfcmEqH9zYYzQ5pxGeSza6NLJqmxQGA/exec
- Spreadsheet: https://docs.google.com/spreadsheets/d/1S5WtdhsVUOQ5APZ_EiBKSZBTeyi6VKnVLeaGbWPBAPc/edit
- GitHub Pages: https://aodxx.github.io/Pem/
