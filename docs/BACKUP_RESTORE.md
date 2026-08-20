# PALM LEDGER — Backup & Restore

ระบบสำรองข้อมูลอยู่ใน `apps-script/Backup.gs` และออกแบบให้ไม่เขียนทับ Spreadsheet production อัตโนมัติ

## เปิดใช้งานครั้งแรก

1. เพิ่ม `Backup.gs` เข้า Apps Script Project เดิม
2. บันทึกโครงการ
3. รัน `createDataBackup()` หนึ่งครั้งและอนุญาตสิทธิ์ Drive หากระบบถาม
4. ตรวจผลลัพธ์ว่ามี `ok: true` และได้ `backupFileId`
5. เปิด Drive workspace ของ PALM LEDGER แล้วตรวจว่ามีโฟลเดอร์ `Backups`
6. รัน `installDailyBackupTrigger()`
7. รัน `getBackupStatus()` และตรวจว่า `triggerInstalled: true`

## นโยบายสำรอง

- สำรอง Google Spreadsheet ทั้งไฟล์วันละครั้งประมาณ 02:00 ตาม timezone ของ Apps Script
- เก็บสำเนาล่าสุด 30 ชุด
- ชื่อไฟล์ขึ้นต้น `PALM_LEDGER_BACKUP_`
- สำเนาเก็บในโฟลเดอร์ `Backups` ภายใน Drive workspace ของเจ้าของ
- รูปใบชั่งใน Drive ไม่ถูกคัดลอกซ้ำ แต่ Spreadsheet backup ยังคงเก็บ `ImageFileID` ที่อ้างถึงรูปเดิม

## กู้คืนอย่างปลอดภัย

ห้ามเขียนทับ production โดยตรงจาก backup

1. หา File ID ของ backup ที่ต้องการ
2. รัน `createRestoreCopyFromBackup('<BACKUP_FILE_ID>')`
3. ระบบจะสร้างไฟล์ใหม่ชื่อ `PALM_LEDGER_RESTORE_REVIEW_...`
4. เปิดไฟล์ใหม่และเปรียบเทียบ Sales, LaborEntries, LaborPayments และ Settings กับ production
5. ถ้าจำเป็นต้องกู้ข้อมูล ให้คัดลอกเฉพาะแถวที่ยืนยันแล้วหรือเปลี่ยน Spreadsheet ID หลังตรวจสอบโดยผู้ดูแล

วิธีนี้ทำให้ความผิดพลาดในการเลือก backup ไม่สามารถลบหรือเขียนทับข้อมูลจริงได้ทันที

## ตรวจสุขภาพระบบสำรอง

รัน `getBackupStatus()` แล้วตรวจ:

```json
{
  "ok": true,
  "triggerInstalled": true,
  "triggerCount": 1,
  "lastBackupFileId": "...",
  "lastBackupAt": "...",
  "retentionCount": 30
}
```

ถ้า `lastBackupAt` เก่ากว่า 48 ชั่วโมง ให้ตรวจ Apps Script > Triggers > Executions ก่อนสร้าง trigger ใหม่
