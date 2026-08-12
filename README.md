# Palm Yield Ledger (Pem)

ระบบบันทึกผลผลิตและรายได้สวนปาล์มน้ำมันจากภาพใบชั่งน้ำหนัก

สถานะ: เริ่มต้นโครงการ — Phase 0 Discovery & Architecture

เอกสารและโค้ดงานพัฒนาจะทำบน branch แยกและผ่าน Draft Pull Request ก่อนรวมเข้า `main`.

## เป้าหมาย Version 1

ถ่ายหรือเลือกรูปใบชั่งบนมือถือ → Gemini อ่านข้อมูลแบบ Structured JSON → ผู้ใช้ตรวจแก้ → บันทึก Google Sheets และรูปใน Google Drive → ดูประวัติและ Dashboard

## เทคโนโลยี

- Frontend: GitHub Pages, Vanilla JavaScript, Mobile-first PWA
- Backend: Google Apps Script Web App
- Database: Google Sheets
- Image storage: Google Drive
- AI: Gemini multimodal model with structured output
