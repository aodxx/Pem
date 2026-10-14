# PROGRESS

อัปเดตล่าสุด: 2026-10-15

## สถานะ

- Phase 0 — Discovery & Architecture: **Completed**
- Phase 1 — Google Sheets / Apps Script Foundation: **Completed and live verified**
- Phase 2 — Backend API / Validation / Duplicate / Audit: **Completed**
- Phase 3 — Gemini Vision Structured OCR: **Completed and live verified**
- Phase 4 — Mobile Frontend / Review / History / Edit: **Completed**
- Phase 5 — Dashboard / Analytics: **Core completed; monthly insight enhancement in candidate**
- Phase 6 — PWA / Offline App Shell: **Completed**
- Phase 7 — Static / Unit QA: **Passed**
- Phase 8 — Contractor & Labor Management: **Completed and live verified**
- Production Closeout: **In acceptance — one real post-time-fix save remains**

## Live verified foundation

- Backend health status: ready
- Backend version: `1.3.1`
- Spreadsheet / Schema / Settings / Drive / Gemini / Access Token: configured
- Gemini model: `gemini-3.6-flash`
- Apps Script deployment URL recorded
- Production OCR incident `SUCCESS → FAILED` fixed and verified at backend level
- GitHub Pages deployment pipeline active
- Main CI active

## Current production release

- Frontend/PWA ที่ deploy แล้ว: `2.7.0`
- Backend ที่ deploy แล้ว: `1.3.1`
- API: `v1`
- Gemini schema: `1.0.0`
- Service Worker cache: `palm-ledger-v2.7.0`
- Incident history จาก frontend `2.6.6`: เคยมี OCR requests สองครั้งจบด้วย `GEMINI_UNAVAILABLE` จาก HTTP 503 high demand (21:38 และ 21:44 เวลาไทย)

## OCR hardening — live verified

- Frontend/PWA: `2.6.6`; backend: `1.3.1`
- เพิ่ม retry แบบ exponential backoff พร้อม jitter และ fallback `gemini-3.8-flash` / `gemini-3.5-flash-lite` หลังโมเดลหลักล้มชั่วคราว
- เพิ่มภาพขาวดำปรับ contrast สำหรับ OCR ควบคู่ภาพสีต้นฉบับ และยกความละเอียดส่ง OCR สูงสุดเป็น 2400px
- ปรับ prompt ให้รับมือภาพหมุน/เอียง กระดาษยับ ซีด สกปรก มีเงา/แสงสะท้อน และให้ใช้สมการเพื่อตรวจทานโดยไม่เดาตัวเลข
- หน้าเว็บรุ่น 2.6.6 และ backend 1.3.1 ผ่านการตรวจ health/deploy; บัญชีจริงยังควรติดตาม Logs เมื่อมีการทดสอบภาพบิลหลายรูปแบบ

## Dashboard analytics — live verified

- Frontend/PWA: `2.7.0`; backend remains `1.3.1` (ไม่ต้อง deploy Apps Script เพิ่ม)
- เพิ่มกราฟสลับดูรายรับจากใบชั่ง ราคาเฉลี่ยต่อกิโลกรัม และน้ำหนักผลผลิตรายเดือน พร้อมตารางยอดขาย/ค่าแรง/คงเหลือหลังค่าแรง
- เพิ่ม insight เดือนที่รายรับ ราคาเฉลี่ย และผลผลิตสูงสุด รวมถึงการเปลี่ยนแปลงราคาจากเดือนก่อนหน้าที่มีรายการ
- ค่าเริ่มต้นเลือกปีปัจจุบันเพื่อให้กราฟเป็นลำดับเวลา; ตัวเลือก “ทุกปี” รวมเดือนชื่อเดียวกันจากทุกปีเพื่อดูฤดูกาล จึงไม่แสดงเป็นแนวโน้มตามเวลา
- สถิตินับเฉพาะรายการขายที่บันทึกแล้ว ไม่รวมคำขอ OCR ที่ยังไม่ได้ยืนยันบันทึก

## Dashboard monthly export candidate — not yet published

- Frontend source candidate: `2.7.1`; production remains `2.7.0`; backend remains `1.3.1`
- เพิ่ม CSV UTF-8 พร้อม BOM ให้เปิดภาษาไทยใน spreadsheet ได้ และเพิ่มรายงานพิมพ์แนวนอนซึ่งผู้ใช้เลือก “บันทึกเป็น PDF” ใน dialog ของเบราว์เซอร์
- ส่งออกตามปีที่เลือกหรือทุกปี พร้อมตาราง 12 เดือนและยอดรวม; เดือนที่ไม่มีข้อมูลเว้นช่องว่าง และระบุชัดว่า “ทุกปี” รวมเดือนชื่อเดียวกัน
- ไม่เพิ่มการอ่าน/เขียนข้อมูลบน backend และไม่รวมชื่อผู้ซื้อหรือข้อมูลส่วนบุคคลในไฟล์สรุป

## UI polish

- Modernized app chrome and card depth without changing business flow
- Contrast-first correction based on real Android device evidence
- Improved form focus states and mobile readability
- Preserved dark mode and reduced-motion behavior
- Added developer signature in Settings: `Developed by aod`
- Added Facebook action linking to the developer profile/share URL
- Visual layers are separated into `modern-polish.css`, `contrast-fix.css`, `developer-credit.css`, and `dashboard-analytics.css`

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

1. Open the deployed PWA (`2.7.0`) on the real mobile device.
2. Scan a receipt containing seconds in TimeIn/TimeOut.
3. Save the sale normally without manually rounding the times.
4. Verify the new Sales row stores the same `HH:MM:SS` values shown on the receipt.

This cannot be simulated from repository CI because it depends on the real camera/browser/PWA device path and production Access Token. After the user performs the save, the resulting row can be verified directly in Google Sheets.

## Resources

- Apps Script Project: https://script.google.com/u/0/home/projects/1PzG5lE7bxpSMSyO_BOBx9DGuFTZMTw_7mBV7o12c6HoWMKqzLlmwaGaz/edit
- Apps Script Deployment: https://script.google.com/macros/s/AKfycbwttI8iFWVls788jXX-nV_7MZsFvwGkwDaIU3JdfcmEqH9zYYzQ5pxGeSza6NLJqmxQGA/exec
- Spreadsheet: https://docs.google.com/spreadsheets/d/1S5WtdhsVUOQ5APZ_EiBKSZBTeyi6VKnVLeaGbWPBAPc/edit
- GitHub Pages: https://aodxx.github.io/Pem/
