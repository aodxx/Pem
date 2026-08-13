# Palm Yield Ledger — สมุดสวนปาล์ม

เว็บแอปส่วนตัวสำหรับถ่ายหรือเลือกรูปใบชั่งขายผลปาล์ม ให้ Gemini อ่านข้อมูลแบบ Structured JSON ตรวจแก้ก่อนบันทึก แล้วเก็บข้อมูลใน Google Sheets และรูปใน Google Drive

## Version 1

- Mobile-first PWA ติดตั้งบน Android ได้
- กล้องหลังและเลือกรูปจากเครื่อง
- หมุน/ย่อรูปใน Browser ก่อนส่ง
- Gemini Vision Structured Output พร้อม Confidence
- Review Form ภาษาไทยก่อนบันทึก
- ตรวจน้ำหนัก ยอดเงิน และรายการหัก
- Duplicate Detection พร้อมยืนยัน override
- เก็บรูปตามปี/เดือนใน Google Drive
- Sales, Deductions, Buyers, OCRRuns, AuditTrail และ Logs
- ประวัติ ค้นหา กรองรายเดือน และแก้ไขย้อนหลัง
- Dashboard ผลผลิต รายได้ ราคาเฉลี่ย กราฟรายเดือน และเปรียบเทียบลานรับซื้อ
- Access Token ส่วนตัวโดยไม่ฝัง Secret ใน Frontend
- Offline App Shell และเก็บแบบร่างในเครื่อง

## Production resources

- Apps Script Project ID: `1PzG5lE7bxpSMSyO_BOBx9DGuFTZMTw_7mBV7o12c6HoWMKqzLlmwaGaz`
- Apps Script Deployment: `https://script.google.com/macros/s/AKfycbwttI8iFWVls788jXX-nV_7MZsFvwGkwDaIU3JdfcmEqH9zYYzQ5pxGeSza6NLJqmxQGA/exec`
- Google Spreadsheet ID: `1S5WtdhsVUOQ5APZ_EiBKSZBTeyi6VKnVLeaGbWPBAPc`
- Timezone: `Asia/Bangkok`
- Expected PWA URL: `https://aodxx.github.io/Pem/`

## Deploy Backend

1. เปิด Apps Script Project
2. แทนที่ `Code.gs` ด้วย `apps-script/Code.gs`
3. แทนที่ `appsscript.json` ด้วย `apps-script/appsscript.json`
4. Run `setupV1()` แล้วเก็บ `accessToken` ที่แสดงหนึ่งครั้ง
5. Run `runV1SmokeTests()` ต้องได้ `ok: true`
6. Run `testGeminiReceiptFromDrive()` เพื่อทดสอบภาพตัวอย่างจริง
7. Deploy > Manage deployments > Edit > New version > Deploy เพื่อคง URL เดิม

## Deploy Frontend

Workflow `.github/workflows/deploy-pages.yml` เผยแพร่โฟลเดอร์ `frontend` เมื่อ merge เข้า `main`. ตั้ง GitHub Pages Source เป็น **GitHub Actions** หนึ่งครั้ง จากนั้นเปิด PWA URL และใส่ Access Token ที่ได้จาก `setupV1()`.

## Security

Gemini API Key และ Access Token ไม่อยู่ใน Repository. API Key อยู่ใน Apps Script Script Properties; Backend เก็บเฉพาะ SHA-256 ของ Access Token. Frontend เก็บ Token เฉพาะใน `localStorage` ของอุปกรณ์ผู้ใช้.

## Tests

```bash
node --check frontend/app.js
node --check frontend/sw.js
node tests/static-check.mjs
node tests/backend-unit.mjs
```
