# Apps Script Backend

Backend สำหรับ Palm Yield Ledger ทำงานเป็น Google Apps Script Web App

## Project ที่ใช้งานจริง

- Apps Script Project ID: `1PzG5lE7bxpSMSyO_BOBx9DGuFTZMTw_7mBV7o12c6HoWMKqzLlmwaGaz`
- Spreadsheet ID: `1S5WtdhsVUOQ5APZ_EiBKSZBTeyi6VKnVLeaGbWPBAPc`
- Timezone: `Asia/Bangkok`
- Backend version: `0.2.0`

## ไฟล์

- `Main.gs` — `doGet` และ `doPost`
- `Router.gs` — API routing
- `Config.gs` — ค่าเริ่มต้นและ Script Property keys
- `Database.gs` — Google Sheets repository helpers
- `DriveService.gs` — โฟลเดอร์เก็บภาพใบชั่ง
- `HealthService.gs` — health checks
- `LogService.gs` — application logs
- `Setup.gs` — setup/verification functions
- `Tests.gs` — integration tests
- `Errors.gs`, `Response.gs`, `Utils.gs` — shared utilities
- `appsscript.json` — manifest, scopes และ timezone

## ลำดับการติดตั้ง

1. นำไฟล์ทั้งหมดในโฟลเดอร์นี้เข้า Apps Script Project
2. เปิด Project Settings และเลือกแสดง `appsscript.json`
3. ตรวจ manifest ตรงกับไฟล์ใน Repository
4. เลือกฟังก์ชัน `setupProject` แล้วกด Run
5. Authorize Sheets/Drive เมื่อ Google ขอ
6. เลือก `runPhase1Tests` แล้วกด Run
7. ต้องได้ `passed: 7`, `failed: 0`
8. Deploy > New deployment > Web app
9. Execute as: Me
10. Who has access: Anyone
11. เปิด URL ด้วย `?action=health`

## Health ที่คาดหวัง

ก่อนใส่ Gemini API Key ค่า `checks.gemini` จะเป็น `false` ซึ่งถูกต้องสำหรับ Phase 1 ส่วน Spreadsheet, Schema, Settings และ Drive ต้องเป็น `true`.

## Secret

ห้าม commit Gemini API Key ลง GitHub ให้เก็บใน Apps Script > Project Settings > Script Properties เท่านั้น
