# API Contract — v1

Endpoint: Apps Script Web App URL  
Transport: JSON in `text/plain;charset=utf-8` POST เพื่อเป็น CORS simple request  
Timezone: `Asia/Bangkok`

## Envelope

Success: `{ "ok": true, "data": {}, "error": null, "meta": { "requestId": "...", "version": "v1", "timestamp": "..." } }`

Error: `{ "ok": false, "data": null, "error": { "code": "...", "message": "...", "details": {} }, "meta": {} }`

ทุก action ส่วนตัวยกเว้น `health` ต้องส่ง `accessToken` ใน JSON body. Token สร้างด้วย `setupV1()` และ Backend เก็บเฉพาะ SHA-256 hash.

## Actions

| Action | Method | หน้าที่ |
|---|---|---|
| `health` | GET/POST | ตรวจ Backend โดยไม่คืน Secret |
| `setup.verify` | POST | ตรวจ Schema |
| `settings.get` | POST | อ่าน Settings ที่ไม่ใช่ Secret |
| `sales.analyze` | POST | รับภาพและคืน Gemini Structured Receipt |
| `sales.duplicateCheck` | POST | คำนวณรายการซ้ำและเหตุผล |
| `sales.create` | POST | Validate, เก็บรูป, บันทึก Sales/Deductions/ค่าแรง/Audit |
| `sales.update` | POST | แก้ไขข้อมูลขายและค่าแรงด้วย optimistic concurrency |
| `sales.void` | POST | ยกเลิกรายการโดยไม่ลบ Sales row |
| `sales.list` | GET/POST | ประวัติและ Filter |
| `sales.get` | GET/POST | รายละเอียดพร้อม Deductions/ค่าแรง/Image URL |
| `dashboard.summary` | GET/POST | Summary, ค่าแรง, ยอดหลังค่าแรง, monthly series, buyer comparison |
| `buyers.list` | GET/POST | รายชื่อลานรับซื้อที่ active |
| `contractors.list` | GET/POST | รายชื่อทีมแทง/บุคคล โดยเรียงรายการที่ใช้ล่าสุดก่อน |
| `contractors.create` | POST | เพิ่มข้อมูลประจำทีมแทงหรือบุคคล |
| `contractors.update` | POST | แก้ข้อมูลประจำ อัตราเริ่มต้น และสถานะใช้งาน |
| `labor.list` | GET/POST | รายการค่าแรง กรองตามรอบขาย/ผู้รับจ้าง/สถานะการจ่าย |
| `labor.save` | POST | บันทึกหรือแทนที่รายการค่าแรงของรอบขาย |
| `labor.payments.list` | GET/POST | ประวัติการจ่ายค่าแรง |
| `labor.payments.create` | POST | บันทึกการจ่ายเต็มจำนวนหรือบางส่วนแบบ idempotent |

## Analyze request

```json
{
  "action": "sales.analyze",
  "accessToken": "PALM-...",
  "source": "CAMERA",
  "image": {"mimeType":"image/jpeg","base64":"...","sha256":"..."}
}
```

Response data มี `ocrRunId`, `model`, `schemaVersion`, `receipt`, `validation`, `lowConfidenceFields`, `duplicateCandidates`.

## Create request

```json
{
  "action": "sales.create",
  "accessToken": "PALM-...",
  "idempotencyKey": "uuid",
  "source": "CAMERA",
  "ocrRunId": "OCR_...",
  "sale": {},
  "laborEntries": [
    {
      "workMode": "TEAM",
      "contractorId": "CON_...",
      "calculationMethod": "PER_KG",
      "weightKgSnapshot": 775,
      "rateSnapshot": 1.5
    }
  ],
  "image": {},
  "duplicateOverride": false
}
```

ถ้าคะแนนซ้ำ ≥ ค่า `DUPLICATE_BLOCK_SCORE` และยังไม่ override ระบบคืน `DUPLICATE_SUSPECTED` พร้อม candidates.

## Labor calculation

- `SELF` → ค่าแรง `0`
- `TEAM` + `PER_KG` → `WeightKgSnapshot × RateSnapshot`
- `INDIVIDUAL` + `PER_PERSON` → `Headcount × RateSnapshot`
- อัตราที่ใช้จริงถูกเก็บเป็น snapshot จึงไม่เปลี่ยนตามอัตราประจำในอนาคต
- สถานะการจ่าย: `UNPAID`, `PARTIAL`, `PAID`

## Error codes

`UNAUTHORIZED`, `SETUP_REQUIRED`, `INVALID_ACTION`, `INVALID_REQUEST`, `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `OCR_FAILED`, `RATE_LIMITED`, `INVALID_WEIGHT`, `INVALID_AMOUNT`, `INVALID_HEADCOUNT`, `INVALID_WORK_MODE`, `INVALID_CONTRACTOR_TYPE`, `DUPLICATE_CONTRACTOR`, `PAYMENT_EXCEEDS_BALANCE`, `DUPLICATE_SUSPECTED`, `CONFLICT`, `NOT_FOUND`, `INTERNAL_ERROR`.
