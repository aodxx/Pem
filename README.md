# PALM LEDGER — สมุดสวนปาล์ม

เว็บแอปมือถือสำหรับอ่านใบชั่งขายปาล์มด้วย Gemini ตรวจข้อมูลก่อนบันทึก และจัดเก็บประวัติการขาย ค่าแรง รูปใบชั่ง และรายงานไว้ใน Google Sheets/Drive

- แอปที่ใช้งานจริง: <https://aodxx.github.io/Pem/>
- Frontend/PWA: `2.5.1`
- Apps Script Backend: `1.3.0`
- API: `v1`

## เริ่มพัฒนาใน 3 คำสั่ง

ต้องมี Git และ Node.js 20 ขึ้นไป ไม่ต้องติดตั้ง package เพิ่ม

```bash
git clone https://github.com/aodxx/Pem.git
cd Pem
npm run check
npm run dev
```

จากนั้นเปิด <http://127.0.0.1:4173> การแก้ไฟล์แล้วรีเฟรชหน้าเว็บจะเห็นผลทันที

## โครงสร้างที่ต้องรู้

```text
frontend/              หน้าเว็บจริงที่ GitHub Pages เผยแพร่
apps-script/Code.gs    Backendจริงทั้งระบบในไฟล์เดียว
apps-script/appsscript.json
tests/                 Static checks และ unit tests
scripts/               เครื่องมือสำหรับพัฒนาในเครื่อง
docs/                  API, การติดตั้ง, schema และสถานะโครงการ
schemas/               JSON Schema สำหรับ Gemini OCR
```

กติกาสำคัญ: แก้หน้าเว็บใน `frontend/` เท่านั้น และแก้ Backend ใน `apps-script/Code.gs` เท่านั้น ไม่มีสำเนาโค้ดใช้งานจริงที่ root ของ Repository

## การตั้งค่า

`frontend/config.js` เก็บ Web App URL และเวอร์ชันของหน้าเว็บ โดย URL นี้ไม่ใช่รหัสลับ ส่วน Access Token ผู้ใช้ต้องกรอกผ่านหน้าตั้งค่าในแอปและระบบจะเก็บไว้เฉพาะใน `localStorage` ของอุปกรณ์

ห้าม commit Gemini API Key, Access Token, ไฟล์ `.clasp.json` หรือ credential ทุกชนิด ดูตัวอย่างค่า Clasp ได้ที่ `apps-script/.clasp.json.example`

## ทดสอบ

```bash
npm run check          # ตรวจ syntax, โครงสร้าง, secrets และ unit tests ทั้งหมด
npm run check:syntax   # ตรวจ syntaxฝั่งหน้าเว็บ
npm test               # รันชุดทดสอบของโครงการ
```

Pull request ทุกอันจะรันชุดตรวจเดียวกันผ่าน GitHub Actions โดยอัตโนมัติ

## การเผยแพร่

- Frontend: เมื่อ merge การเปลี่ยนแปลงใน `frontend/` เข้า `main` ระบบจะตรวจสอบและเผยแพร่ผ่าน GitHub Pages อัตโนมัติ
- Backend: คัดลอก `apps-script/Code.gs` และ manifest เข้า Apps Script Project เดิม ทดสอบ แล้วแก้ Deployment เดิมเป็นเวอร์ชันใหม่เพื่อรักษา URL

อ่านขั้นตอนละเอียดที่ [คู่มือการติดตั้ง](docs/INSTALL.md), [แนวทางร่วมพัฒนา](CONTRIBUTING.md), [สถาปัตยกรรม](ARCHITECTURE.md) และ [สถานะโครงการ](docs/PROGRESS.md)
