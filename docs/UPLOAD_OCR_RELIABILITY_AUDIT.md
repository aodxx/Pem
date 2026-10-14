# รายงานตรวจสอบความทนทานของการอัปโหลดและ OCR ใบชั่ง

วันที่ตรวจ: 14 ตุลาคม 2026 (เวลาไทย)  
รีโพซิทอรี: `aodxx/Pem`  
ชีตที่ตรวจ: `OCRRuns` และ `Logs` — **อ่านอย่างเดียว ไม่มีการแก้ข้อมูลในชีต**

## สรุปผล

สาเหตุหลักที่ยืนยันได้คือ **Gemini ปฏิเสธคำขอชั่วคราวเพราะระบบมีความต้องการสูง** ร่วมกับ backend ไม่มี retry; นอกจากนี้ยังพบ idempotency ฝั่ง OCR ไม่ครอบคลุมสถานะ `SUCCESS`/`LOW_CONFIDENCE` และตัวเลือกไฟล์ฝั่งมือถือไม่รองรับกรณี MIME ว่างพร้อมไม่มี error handling ที่เพียงพอ

มีการแก้ใน working copy เป็น release `2.6.5` พร้อม regression tests แล้ว แต่ **ยังไม่ได้ commit, push หรือ deploy** จึงยังไม่มีผลกับเว็บหรือ Apps Script ที่ใช้งานจริง

## หลักฐานจากชีต

- `Logs`: มี `sales.analyze` ทั้งหมด **40** รายการ: `INFO` 19 และ `ERROR` 21
- ใน 21 ข้อผิดพลาดนั้น:
  - **18** รายการบันทึกข้อความ Gemini ว่าโมเดลกำลังรับโหลดสูงและให้ลองใหม่ภายหลัง
  - **3** รายการเป็นข้อความทั่วไป `Gemini อ่านใบชั่งไม่สำเร็จ`
- Log เดิมเก็บข้อความ error แต่ไม่ได้เก็บ HTTP status ของ Gemini จึงระบุจากชีตเพียงอย่างเดียวไม่ได้ว่าแต่ละเหตุการณ์เป็น 429 หรือ 503 อย่างแน่ชัด; ข้อความสนับสนุนอย่างชัดเจนว่าเป็นปัญหาชั่วคราวฝั่งบริการ Gemini
- `OCRRuns`: 60 แถว รวม **39 OCRRunID**; สถานะล่าสุดต่อ run คือ `SUCCESS` 18 และ `FAILED` 21
- **ไม่พบ PROCESSING ที่ค้างจริง** ในข้อมูลปัจจุบัน: แถว `PROCESSING` ที่เห็นมีแถวผลลัพธ์สถานะสุดท้ายตามมาภายใต้ `OCRRunID` เดียวกัน
- ไม่พบสถานะล่าสุด `LOW_CONFIDENCE` ในข้อมูลที่อ่านได้ แม้โค้ดจะสร้างสถานะนี้ได้

## ตรวจเทียบสมมติฐาน

| สมมติฐาน | ผลตรวจ |
|---|---|
| requestId เดิมเจอเฉพาะ `COMPLETED` ทำให้เรียก Gemini ซ้ำหลังผลออกเป็น `SUCCESS` หรือ `LOW_CONFIDENCE` | **ยืนยันจากโค้ด** — backend บันทึกสองสถานะนี้ แต่การตรวจซ้ำไม่คืนผลเดิม จึงอาจเรียก Gemini ซ้ำและเพิ่มเวลา/การใช้โควตาเมื่อส่ง requestId เดิมอีกครั้ง |
| `PROCESSING` ค้างถาวรหาก execution ตายกลางทาง | **เป็นความเสี่ยงจริงจากโค้ด แต่ไม่พบในชีตชุดนี้** — เดิมไม่มีอายุหมดอายุของสถานะดังกล่าว |
| Gemini 429/503 ชั่วคราวแล้วล้มทันที | **ยืนยันจากโค้ดและข้อความใน Logs** — เดิมเรียก Gemini ครั้งเดียว; log 18 รายการระบุภาวะ high demand แต่ไม่ได้บันทึก HTTP status จึงไม่สรุปเลข status จากหลักฐานนี้ |
| ปุ่มเลือกรูปเงียบเมื่อ FileReader/decoder ล้มเหลว หรือ MIME ว่าง | **ยืนยันจากโค้ดว่าไม่มี try/catch และปฏิเสธ MIME ที่ว่าง**; ยังยืนยันจากชีตไม่ได้ว่าเป็นสาเหตุของเหตุการณ์ใด เพราะปัญหาก่อนส่งถึง backend ไม่ถูกบันทึกใน Logs |
| ล้างค่า input ก่อนเริ่มอ่านไฟล์เป็นสาเหตุโดยตรง | ตัวแปร `File` ถูกอ่านมาเก็บก่อนล้าง input อยู่แล้ว จึงยังไม่มีหลักฐานว่าเป็นสาเหตุหลัก; ปรับให้ล้าง input ใน `finally` หลังจบการอ่านเพื่อความปลอดภัยและรองรับการเลือกไฟล์เดิมซ้ำ |

## การเปลี่ยนแปลงใน working copy

1. **Replay ผล OCR แบบ idempotent** — คืนผลเดิมเมื่อ requestId เดิมมีสถานะ `SUCCESS`, `LOW_CONFIDENCE` หรือ `COMPLETED`; เพิ่ม lock รอบการค้นหา/สร้างงานเพื่อกันคำขอซ้ำพร้อมกันเปิด OCR ซ้อน
2. **กู้ PROCESSING ที่ค้าง** — ใช้ lease 7 นาที; เมื่อหมดอายุจะเปลี่ยนแถวเดิมเป็น `STALE` พร้อม `PROCESSING_TIMEOUT` แล้วเริ่มงานใหม่ด้วย requestId เดิม ไม่ต้องเพิ่มคอลัมน์ในชีต
3. **Retry Gemini แบบจำกัด** — ลองได้สูงสุด 3 ครั้งสำหรับ network errors และ HTTP 408/429/500/502/503/504 โดยหน่วง 1 และ 2 วินาที; แยก error สุดท้ายเป็น `RATE_LIMITED` หรือ `GEMINI_UNAVAILABLE` และเก็บ HTTP status ในข้อความ error
4. **ปรับ file picker/camera** — เพิ่ม fallback MIME จากนามสกุลและกรณี type ว่าง, แปลงข้อมูลเป็น image data URL ก่อน preview, แสดงข้อความเมื่ออ่าน/ถอดรหัสภาพไม่ได้ และ reset input ใน `finally`
5. **ทำ polling ให้กู้ต่อได้** — คง requestId เดิมเมื่อเป็น timeout/network/response failure เพื่อให้กดตรวจอีกครั้งแล้วไม่เริ่ม OCR ใหม่; เพิ่มช่วง polling สูงสุดจาก 30 เป็น 45 รอบและแสดงข้อความเมื่อยังประมวลผลแทนการจบแบบเงียบ
6. **อัปเดต release/cache เป็น 2.6.5** — ปรับ package, UI version, Service Worker cache, README/Progress, smoke workflow และ static test เพื่อให้มือถือโหลด `app.js` รุ่นใหม่หลัง deploy

## การทดสอบ

รัน `npm run check` ผ่านครบ รวม syntax checks, repository/static checks, unit tests และ production closeout checks

เพิ่ม regression tests ครอบคลุม:

- Replay `SUCCESS` และ `LOW_CONFIDENCE` โดยไม่เรียก Gemini ซ้ำ
- หมดอายุ lease และกู้แถว `PROCESSING` เก่าเป็น `STALE` ก่อนเริ่มใหม่
- Gemini 503 แล้วสำเร็จในการ retry ครั้งถัดไป
- Gemini ยัง unavailable หลัง retry ครบ แล้วคืน `GEMINI_UNAVAILABLE`
- lease ที่ยังใหม่ไม่ถูกหมดอายุก่อนเวลา

## ขั้นตอนให้มีผลบนระบบจริง

การเปลี่ยนแปลงยังอยู่ใน local clone `/home/ubuntu/Pem` บน branch `main` และยังไม่ได้ commit/push/deploy

1. ทบทวน diff แล้ว commit/push ไป `main` — GitHub Pages workflow ของโปรเจกต์ตั้งให้ทำงานเมื่อมี push ที่ตรงกับ path ที่แก้ และ Service Worker จะใช้ cache key `2.6.5`
2. อัปเดต Apps Script `apps-script/Code.gs` ในโปรเจกต์ Apps Script และ **อัปเดต deployment เดิมเป็นเวอร์ชันใหม่** โดยคง Web App URL/สิทธิ์เดิม; การแก้ GitHub อย่างเดียวไม่เปลี่ยนโค้ด backend ที่ deploy อยู่
3. หลัง deploy ให้ทดลองถ่าย/เลือกภาพบน Android จริง 1–2 ใบ และตรวจ Logs/OCRRuns ว่า 503/429 ถูก retry, requestId เดิมคืนผลเดิม และไม่มี PROCESSING ค้าง

ไม่มีการ push, commit, deploy หรือเขียนข้อมูลลง Google Sheet ในการตรวจครั้งนี้
