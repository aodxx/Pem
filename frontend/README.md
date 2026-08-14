# Frontend PWA

โฟลเดอร์นี้คือหน้าเว็บที่ใช้งานจริงและเป็น artifact ที่ GitHub Pages เผยแพร่

- เริ่ม local server จาก root ด้วย `npm run dev`
- ตรวจทั้งหมดด้วย `npm run check`
- แก้ API URL/เวอร์ชันที่ `config.js`
- เมื่อแก้ App Shell ให้เพิ่ม cache version ใน `sw.js` เพื่อให้อุปกรณ์รับไฟล์ใหม่
- เก็บ assets ที่ใช้งานจริงไว้ในโฟลเดอร์นี้เท่านั้น ห้ามสร้างสำเนาที่ root

Access Token ไม่ได้อยู่ใน source code ผู้ใช้กรอกผ่านหน้าตั้งค่าและเก็บไว้ในอุปกรณ์ของตนเอง
