# Apps Script Backend

PALM LEDGER รองรับ 2 รูปแบบใน Repository เดียวกัน:

- **Production owner เดิม** — ใช้ `Code.gs` และ Deployment เดิมต่อได้
- **Multi-owner Template** — เจ้าของแต่ละคนมี Google Sheet, Apps Script Deployment, Drive workspace, Access Token และ Gemini API Key แยกจากกัน

## ไฟล์

- `Code.gs` — API, Gemini OCR, Google Sheets/Drive, ทีมและค่าแรง รวมถึงฟังก์ชันทดสอบ
- `OwnerTemplate.gs` — ตัวติดตั้ง Owner Instance และฟังก์ชันหมุน Access Token สำหรับสำเนาใหม่
- `appsscript.json` — timezone, runtime และ OAuth scopes
- `.clasp.json.example` — ตัวอย่างสำหรับผู้พัฒนาที่ต้องการใช้ Clasp (ห้าม commit `.clasp.json` จริง)

Backend production ปัจจุบันคือ `1.3.0` ส่วน Multi-owner Template installer คือ `1.0.0`

## อัปเกรด Owner เดิม

1. รัน `npm run check` ที่ root ของ Repository
2. สำรอง `Code.gs` ใน Apps Script Project เดิม
3. วางเนื้อหาจาก `apps-script/Code.gs` แทนไฟล์เดิม และตรวจ `appsscript.json`
4. หากเป็นฐานข้อมูลที่ยังไม่เคยอัปเกรด ให้รัน `upgradeLaborSystem()` เพียงครั้งแรก
5. รัน `runPhase1Tests()` และตรวจว่า `failed` เท่ากับ `0`
6. Deploy โดยแก้ Deployment เดิมและเลือก New version เพื่อคง Web App URL
7. เปิด `?action=health` และตรวจว่า `status` เป็น `ready`

## สร้าง Owner Instance ใหม่

สำหรับเจ้าของใหม่ ให้ใช้ทั้ง `Code.gs` และ `OwnerTemplate.gs` แล้วทำตาม `docs/MULTI_OWNER_SETUP.md`

แนวทางที่แนะนำคือสร้าง Google Sheet Template ที่มี Apps Script ผูกอยู่ เมื่อผู้ใช้ทำสำเนา Sheet แล้วให้รัน:

```text
setupOwnerInstance()
```

ตัวติดตั้งจะสร้างและบันทึกค่าของเจ้าของรายนั้นโดยเฉพาะ:

- `OWNER_NAME`
- `OWNER_INSTANCE_ID`
- `SPREADSHEET_ID`
- `PROJECT_FOLDER_ID`
- `RECEIPTS_FOLDER_ID`
- `APP_ACCESS_TOKEN_HASH`

จากนั้นเจ้าของต้องตั้ง `GEMINI_API_KEY` ของตัวเอง และ Deploy Web App ของตัวเอง

## กฎ Multi-owner

**1 Owner = 1 Apps Script Deployment = 1 Google Sheet = 1 Drive workspace**

ห้ามนำ Apps Script instance เดิมไปเปลี่ยน `SPREADSHEET_ID` เพื่อใช้กับเจ้าของคนอื่น เพราะอาจทำให้ข้อมูลและรูปใบชั่งปะปนกัน

Gemini API Key ต้องอยู่ใน Apps Script Script Properties เท่านั้น ส่วน Access Token ระบบเก็บเฉพาะ SHA-256 hash ห้ามใส่ secret ลงใน Repository
