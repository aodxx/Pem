# API Contract

Version: v1  
Transport: Google Apps Script Web App  
Timezone: Asia/Bangkok

## Conventions

- Endpoint เดียว: Apps Script deployment URL
- GET ใช้สำหรับ read-only
- POST ใช้สำหรับ mutation/วิเคราะห์ภาพ
- POST ส่ง `Content-Type: text/plain;charset=utf-8` เพื่อคงเป็น simple request
- ทุก request มี `requestId` ฝั่ง client ถ้าไม่มี Backend สร้างให้
- ทุก response มีรูปแบบเดียวกัน

### Success

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "requestId": "req_xxx",
    "version": "v1",
    "timestamp": "2026-08-12T00:00:00+07:00"
  }
}
```

### Error

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "INVALID_WEIGHT",
    "message": "ข้อมูลน้ำหนักไม่ถูกต้อง",
    "details": {}
  },
  "meta": {
    "requestId": "req_xxx",
    "version": "v1",
    "timestamp": "2026-08-12T00:00:00+07:00"
  }
}
```

## Authentication

Session token ส่งใน body สำหรับ POST และ query สำหรับ GET เพื่อหลีกเลี่ยง Authorization header/preflight

### `auth.pair` — POST

Input:

```json
{
  "action": "auth.pair",
  "pairingCode": "user-entered-code",
  "deviceName": "Android Phone"
}
```

Output: session token, expiry และ deviceId. Pairing code ใช้ครั้งเดียวหรือหมดอายุเร็ว

## Public

### `health` — GET

`?action=health`

คืน service version, current time และสถานะ configuration แบบ boolean เท่านั้น ไม่คืน ID/Secret

## OCR

### `sales.analyze` — POST

Input:

```json
{
  "action": "sales.analyze",
  "sessionToken": "...",
  "schemaVersion": "1.0.0",
  "source": "CAMERA",
  "image": {
    "mimeType": "image/jpeg",
    "base64": "...",
    "sha256": "..."
  },
  "clientHints": {
    "rotation": 0,
    "originalName": "IMG.jpg"
  }
}
```

Output:

- `ocrRunId`
- extracted receipt object
- validation warnings
- low-confidence fields
- duplicate candidates (preliminary)

## Sales

### `sales.duplicateCheck` — POST

รับข้อมูลที่ผู้ใช้แก้แล้ว คืน score/reasons/candidates

### `sales.create` — POST

รับข้อมูล final, `ocrRunId`, รูปต้นฉบับ และ duplicate override ถ้ามี  
Backend validate ซ้ำทุกครั้ง

### `sales.update` — POST

ต้องมี `saleId`, `expectedUpdatedAt` สำหรับ optimistic concurrency และ `changes`

### `sales.void` — POST

ไม่ลบแถวจริง เปลี่ยน `RecordStatus=VOID` และสร้าง AuditTrail

### `sales.get` — GET

`?action=sales.get&saleId=...&sessionToken=...`

### `sales.list` — GET

Filters:

- fromDate, toDate
- buyerId
- receiptNumber
- minPrice, maxPrice
- minWeight, maxWeight
- cursor, limit

### `sales.image` — GET

คืน metadata/owner-only Drive view URL หรือ image payload ที่ผ่าน authorization ตาม implementation ที่ทดสอบแล้ว

## Dashboard

### `dashboard.summary` — GET

Parameters: period, year, month, fromDate, toDate

Returns:

- totalWeightKg
- totalWeightTon
- totalRevenue
- averagePricePerKg
- saleCount
- monthOverMonth
- yearOverYear
- monthlySeries
- buyerComparison

## Buyers

- `buyers.list` — GET
- `buyers.upsert` — POST
- `buyers.deactivate` — POST

## Settings

- `settings.get` — GET (non-secret only)
- `settings.update` — POST (allowlist keys only)

## Error codes

| Code | HTTP-like meaning |
|---|---|
| UNAUTHORIZED | session ไม่มี/หมดอายุ |
| INVALID_ACTION | action ไม่รองรับ |
| INVALID_REQUEST | body/parameter ไม่ครบ |
| INVALID_IMAGE | MIME/ขนาด/ข้อมูลภาพไม่ถูกต้อง |
| IMAGE_TOO_LARGE | เกินขนาดที่กำหนด |
| OCR_FAILED | Gemini/API/parse ล้มเหลว |
| OCR_LOW_CONFIDENCE | วิเคราะห์ได้บางส่วน |
| VALIDATION_WARNING | บันทึกได้แต่ต้องยืนยัน |
| INVALID_WEIGHT | ความสัมพันธ์น้ำหนักผิด |
| INVALID_AMOUNT | ความสัมพันธ์จำนวนเงินผิด |
| DUPLICATE_SUSPECTED | พบรายการคล้าย |
| CONFLICT | ข้อมูลถูกแก้จากอีก request |
| NOT_FOUND | ไม่พบข้อมูล |
| RATE_LIMITED | เรียกเร็วเกิน |
| INTERNAL_ERROR | ข้อผิดพลาดที่ไม่เปิดรายละเอียดภายใน |

## Idempotency

`sales.create` ต้องรับ `idempotencyKey` และบันทึกผลเดิมเมื่อ request เดิมถูก retry เพื่อป้องกันบันทึกซ้ำจากสัญญาณมือถือ
