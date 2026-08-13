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
| `sales.create` | POST | Validate, เก็บรูป, บันทึก Sales/Deductions/Audit |
| `sales.update` | POST | แก้ไขด้วย optimistic concurrency |
| `sales.void` | POST | ยกเลิกรายการโดยไม่ลบ Sales row |
| `sales.list` | GET/POST | ประวัติและ Filter |
| `sales.get` | GET/POST | รายละเอียดพร้อม Deductions/Image URL |
| `dashboard.summary` | GET/POST | Summary, monthly series, buyer comparison |
| `buyers.list` | GET/POST | รายชื่อลานรับซื้อที่ active |

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
  "image": {},
  "duplicateOverride": false
}
```

ถ้าคะแนนซ้ำ ≥ ค่า `DUPLICATE_BLOCK_SCORE` และยังไม่ override ระบบคืน `DUPLICATE_SUSPECTED` พร้อม candidates.

## Error codes

`UNAUTHORIZED`, `SETUP_REQUIRED`, `INVALID_ACTION`, `INVALID_REQUEST`, `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `OCR_FAILED`, `RATE_LIMITED`, `INVALID_WEIGHT`, `INVALID_AMOUNT`, `DUPLICATE_SUSPECTED`, `CONFLICT`, `NOT_FOUND`, `INTERNAL_ERROR`.
