# แนวทางร่วมพัฒนา PALM LEDGER

ขอบคุณที่มาช่วยพัฒนาครับ เอกสารนี้ตั้งใจให้เปิด Repository แล้วเริ่มงานได้โดยไม่ต้องเดาโครงสร้าง

## เตรียมเครื่อง

ต้องมี Git และ Node.js 20 ขึ้นไป จากนั้นรัน:

```bash
git clone https://github.com/aodxx/Pem.git
cd Pem
npm run check
npm run dev
```

สร้าง branch ที่สื่อความหมาย เช่น `feature/buyer-report` หรือ `fix/save-timeout` และอย่าทำงานบน `main` โดยตรง

## แหล่งโค้ดจริง

- หน้าเว็บ: `frontend/`
- Backend: `apps-script/Code.gs`
- Apps Script manifest: `apps-script/appsscript.json`
- Tests: `tests/`

ห้ามสร้างสำเนา `index.html`, `app.js`, `styles-v2.css`, `sw.js` หรือ assets ที่ root และห้ามแยก Apps Script เป็นไฟล์ `.gs` หลายชุดโดยไม่มีแผน build ที่สร้าง `Code.gs` ได้อย่างแน่นอน เจ้าของระบบต้องสามารถคัดลอกไฟล์เดียวไปวางได้เสมอ

## ก่อนส่ง Pull Request

1. เปลี่ยนเฉพาะงานที่เกี่ยวข้องและไม่ commit ไฟล์ชั่วคราวหรือ generated files
2. ถ้าแก้ Frontend App Shell ให้อัปเดตเวอร์ชัน cache ใน `frontend/sw.js`
3. ถ้าแก้ Backend ให้เพิ่ม/ปรับ unit test และระบุว่าต้อง Deploy Apps Script หรือ migration หรือไม่
4. ถ้าเปลี่ยน API หรือโครงสร้างชีต ให้อัปเดตเอกสารใน `docs/`
5. รัน `npm run check` ให้ผ่าน
6. ทดสอบบนหน้าจอมือถือเมื่อมีการแก้ UI/UX

Pull request ควรอธิบายปัญหา สิ่งที่เปลี่ยน วิธีทดสอบ และภาพก่อน/หลังเมื่อเป็นงานหน้าจอ

## ความปลอดภัยและข้อมูลจริง

- ห้าม commit Gemini API Key, Access Token, Google credentials, `.clasp.json` หรือข้อมูลใบชั่งจริงที่ระบุตัวบุคคลได้
- ใช้ข้อมูลจำลองใน tests และ screenshots
- อย่าเปลี่ยน Spreadsheet schema โดยตรง ให้ทำ migration ที่รันซ้ำได้และสำรองข้อมูลก่อน
- อย่าเปลี่ยน Web App Deployment URL โดยไม่ตกลงกับเจ้าของโครงการ

## นิยามว่างานเสร็จ

- `npm run check` ผ่าน
- ไม่มี secret และไม่มีไฟล์ซ้ำ/ไฟล์ชั่วคราว
- เส้นทางใช้งานเดิมยังทำงาน หรือมี migration/คำอธิบายรองรับ
- เอกสารตรงกับพฤติกรรมจริง
