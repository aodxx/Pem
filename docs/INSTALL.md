# PALM LEDGER — ติดตั้ง Production

## Backend 1.3.0

1. เปิด Apps Script Project เดิม
2. สำรองโค้ดเดิม
3. อัปเดต `apps-script/Code.gs`
4. เพิ่ม/อัปเดต `apps-script/OwnerTemplate.gs` สำหรับ Multi-owner
5. เพิ่ม `apps-script/Backup.gs` สำหรับระบบสำรองข้อมูล
6. ตรวจ `appsscript.json`
7. กดบันทึก
8. รัน `runPhase1Tests()` และตรวจว่า `failed = 0`
9. Deploy เวอร์ชันใหม่โดยแก้ Deployment เดิม เพื่อรักษา Web App URL
10. เปิด URL `?action=health` และตรวจว่า backend ตอบ `ok: true`

## Production Backup

หลังเพิ่ม `Backup.gs`:

1. รัน `createDataBackup()` หนึ่งครั้ง
2. ตรวจ Drive workspace ว่ามีโฟลเดอร์ `Backups`
3. รัน `installDailyBackupTrigger()`
4. รัน `getBackupStatus()` และตรวจ `triggerInstalled: true`
5. อ่านขั้นตอนกู้คืนที่ `docs/BACKUP_RESTORE.md`

ระบบเก็บ backup ล่าสุด 30 ชุด และการกู้คืนจะสร้างสำเนาใหม่สำหรับตรวจสอบก่อนเสมอ ไม่เขียนทับ production อัตโนมัติ

## Frontend/PWA 2.6.1

Frontend เผยแพร่ผ่าน GitHub Pages อัตโนมัติเมื่อ merge เข้า `main` และผ่าน `npm run check`

จุดสำคัญของ 2.6.1:
- ช่อง `timeIn` และ `timeOut` รองรับ `HH:MM:SS` ด้วย `step="1"`
- Service Worker cache: `palm-ledger-v2.6.1`
- Production Smoke ตรวจไฟล์ที่ deploy จริงและ backend health หลัง deploy

## Acceptance หลัง deploy

1. เปิดแอปบนมือถือและยืนยันเวอร์ชัน `2.6.1`
2. ถ่าย/เลือกรูปใบชั่งจริง
3. ตรวจว่า Gemini เติมวันที่ เวลา น้ำหนัก ราคา และยอดเงินถูกต้อง
4. ตรวจว่าเวลาเข้า/ออกที่มีวินาทีสามารถบันทึกได้โดยไม่ถูก browser ปฏิเสธ
5. บันทึกรายการ
6. ตรวจ Google Sheet ว่าค่า `TimeIn` / `TimeOut` ตรงกับใบชั่ง
7. ตรวจภาพใบชั่งเปิดจากรายการย้อนหลังได้
8. ตรวจ Dashboard/History และค่าแรงถ้ามี

เมื่อขั้นตอนนี้ผ่านอย่างน้อยหนึ่งรายการหลังเวอร์ชัน 2.6.1 จึงถือว่า end-to-end production acceptance ผ่าน
