# รายงานตรวจสอบความทนทานของการอัปโหลดและ OCR ใบชั่ง

วันที่ตรวจ: 14 ตุลาคม 2026 (เวลาไทย)  
รีโพซิทอรี: `aodxx/Pem`  
ชีตที่ตรวจ: `OCRRuns` และ `Logs` — **อ่านอย่างเดียว ไม่มีการแก้ข้อมูลในชีต**

## สรุปผล

สาเหตุหลักที่ยืนยันได้คือ **Gemini ปฏิเสธคำขอชั่วคราวเพราะระบบมีความต้องการสูง** ร่วมกับ backend ไม่มี retry; นอกจากนี้ยังพบ idempotency ฝั่ง OCR ไม่ครอบคลุมสถานะ `SUCCESS`/`LOW_CONFIDENCE` และตัวเลือกไฟล์ฝั่งมือถือไม่รองรับกรณี MIME ว่างพร้อมไม่มี error handling ที่เพียงพอ

การแก้รอบแรกเป็น release `2.6.5` ถูก push เป็น commit `ae1adf7`; หน้าเว็บและ Apps Script รุ่น `1.3.0` ถูก deploy แล้ว อย่างไรก็ตาม Logs หลัง deploy ยังพบ Gemini HTTP 503 สองครั้ง จึงมี hardening รอบสองเป็น frontend `2.6.6` และ backend `1.3.1` ใน working copy ซึ่งยังไม่ได้ publish

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

## ผลตรวจหลัง deploy รุ่นแรก

หลังผู้ใช้ deploy backend และ frontend รุ่น `2.6.5` พบคำขอ OCR เวลา 21:37:53 และ 21:44:37 วันที่ 14 ตุลาคม 2026 ทั้งคู่สร้างแถว `PROCESSING` แล้วจบเป็น `FAILED / GEMINI_UNAVAILABLE` หลังประมาณ 10–11 วินาที ข้อความ `Logs` ระบุ HTTP 503 high demand จากโมเดล `gemini-3.6-flash` จึงยืนยันว่าภาพผ่านถึง Apps Script แล้ว แต่โมเดลหลักไม่ตอบ แม้มี retry แบบเดิม

## Hardening รอบสองใน working copy

- Backend source `1.3.1` ลองโมเดลหลักแบบจำกัด 4 attempts ด้วย backoff 1/2/4 วินาทีและ jitter แล้ว fallback ไป `gemini-3.8-flash` และ `gemini-3.5-flash-lite`; เมื่อสำเร็จจะบันทึกชื่อโมเดลที่ตอบจริงใน `OCRRuns` และ response
- Frontend/PWA `2.6.6` ยกระดับภาพสีต้นฉบับที่ส่ง OCR จาก 1600 เป็น 2400px และเพิ่มภาพขาวดำที่ปรับ contrast เป็นภาพสำรอง โดยบันทึกเฉพาะภาพสีต้นฉบับเป็นภาพใบเสร็จ
- ปรับ prompt ให้ Gemini อ่านภาพที่หมุน/เอียง ยับ พับ ขาด สกปรก ซีด มีเงาหรือแสงสะท้อน พร้อมส่ง confidence/ปัญหาภาพ และห้ามเดาตัวเลข
- เพิ่ม regression tests สำหรับโมเดลสำรอง การส่งภาพสองแบบ และการบันทึกโมเดลที่ตอบจริง

โมเดล fallback เป็นชื่อที่ Google ระบุว่า stable และรองรับภาพ/structured output แต่ยังต้องตรวจการเข้าถึงด้วย API key จริงหลัง deploy ก่อนยืนยันผล production

## ขั้นตอนให้มีผลบนระบบจริง

การ hardening รอบสองอยู่ใน local clone `/home/ubuntu/Pem` บน branch `main`; ยังไม่ได้ commit/push/deploy และไม่มีการเขียนข้อมูลลง Google Sheet

1. หลังทบทวนและอนุมัติ diff ให้ push frontend `2.6.6` ไป `main`; Service Worker ใช้ cache key `palm-ledger-v2.6.6`
2. อัปเดต Apps Script `apps-script/Code.gs` รุ่น `1.3.1` ในโปรเจกต์เดิมและอัปเดต deployment เดิมเป็น New version โดยคง Web App URL/สิทธิ์เดิม
3. ตรวจ health ว่าแสดง backend `1.3.1`; ทดลองภาพจริงบน Android และตรวจ Logs/OCRRuns ว่าระบุโมเดลที่ตอบจริงและไม่ค้าง

ไม่มีการ commit/push/deploy hardening รอบสอง และไม่มีการเขียนข้อมูลลง Google Sheet ในการตรวจ/ทดสอบรอบนี้
