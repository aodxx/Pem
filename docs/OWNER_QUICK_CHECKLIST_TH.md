# PALM LEDGER — Checklist ติดตั้งเจ้าของใหม่

ใช้หน้านี้เมื่อต้องติดตั้ง PALM LEDGER ให้เจ้าของใหม่แบบรวดเร็ว

- [ ] ทำสำเนา Google Sheet Template ที่ไม่มีข้อมูลจริง
- [ ] เปิด **ส่วนขยาย > Apps Script**
- [ ] ตรวจว่ามี `Code.gs` และ `OwnerTemplate.gs`
- [ ] รัน `setupOwnerInstance()`
- [ ] ใส่ชื่อสวน/ชื่อเจ้าของ
- [ ] เก็บ `Access Token` ที่ระบบสร้างให้ทันที
- [ ] เพิ่ม `GEMINI_API_KEY` ใน Script Properties
- [ ] รัน `getOwnerInstanceStatus()`
- [ ] ตรวจว่า `installed`, `spreadsheetConfigured`, `projectFolderConfigured`, `receiptsFolderConfigured`, `accessTokenConfigured`, `geminiConfigured` เป็น `true`
- [ ] Deploy Apps Script เป็น **Web app**
- [ ] คัดลอก Web App URL
- [ ] เปิด PALM LEDGER > ตั้งค่า
- [ ] ใส่ Web App URL + Access Token
- [ ] กดบันทึกและทดสอบการเชื่อมต่อ
- [ ] ทดลองบันทึกใบชั่ง 1 ใบ
- [ ] ตรวจว่าข้อมูลเข้า Google Sheet ของเจ้าของใหม่
- [ ] ตรวจว่ารูปเข้า Google Drive ของเจ้าของใหม่

กฎประจำระบบ:

**1 เจ้าของ = 1 Apps Script Deployment = 1 Google Sheet = 1 Drive workspace**

คู่มือฉบับเต็ม: `docs/OWNER_GUIDE_TH.md`
