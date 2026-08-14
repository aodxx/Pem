# Apps Script Backend

Backend ที่ใช้งานจริงอยู่ใน `Code.gs` เพียงไฟล์เดียว เพื่อให้เจ้าของโครงการคัดลอกไปวางใน Google Apps Script ได้โดยไม่เสี่ยงตกหล่นหรือใช้ไฟล์ผิดรุ่น

## ไฟล์

- `Code.gs` — API, Gemini OCR, Google Sheets/Drive, ทีมและค่าแรง รวมถึงฟังก์ชันทดสอบ
- `appsscript.json` — timezone, runtime และ OAuth scopes
- `.clasp.json.example` — ตัวอย่างสำหรับผู้พัฒนาที่ต้องการใช้ Clasp (ห้าม commit `.clasp.json` จริง)

Backend ปัจจุบันคือ `1.3.0` และฐานข้อมูลผ่าน migration ระบบค่าแรงแล้ว

## วิธีนำขึ้นระบบ

1. รัน `npm run check` ที่ root ของ Repository
2. สำรอง `Code.gs` ใน Apps Script Project เดิม
3. วางเนื้อหาจาก `apps-script/Code.gs` แทนไฟล์เดิม และตรวจ `appsscript.json`
4. หากเป็นฐานข้อมูลที่ยังไม่เคยอัปเกรด ให้รัน `upgradeLaborSystem()` เพียงครั้งแรก
5. รัน `runPhase1Tests()` และตรวจว่า `failed` เท่ากับ `0`
6. Deploy โดยแก้ Deployment เดิมและเลือก New version เพื่อคง Web App URL
7. เปิด `?action=health` และตรวจว่า `status` เป็น `ready`

Gemini API Key ต้องอยู่ใน Apps Script Script Properties เท่านั้น ส่วน Access Token ระบบเก็บเฉพาะ SHA-256 hash ห้ามใส่ secret ลงใน Repository
