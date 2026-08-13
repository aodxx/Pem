# Google Sheets Data Schema

Schema version: 1.0.0  
Timezone: Asia/Bangkok

## Sales

หนึ่งแถวต่อการขายหนึ่งครั้ง

| Column | Type | Required | Notes |
|---|---|---:|---|
| SaleID | string | yes | `SALE_<timestamp>_<random>` |
| RecordStatus | enum | yes | ACTIVE, VOID |
| ReceiptNumber | string | no | เก็บ leading zero |
| SaleDate | date/ISO | yes | YYYY-MM-DD |
| TimeIn | time | no | HH:mm:ss |
| TimeOut | time | no | HH:mm:ss |
| BuyerID | string | no | FK Buyers |
| BuyerNameRaw | string | no | ข้อความจากใบชั่ง |
| BranchRaw | string | no | ข้อความจากใบชั่ง |
| CustomerCode | string | no | ถ้ามี |
| CustomerName | string | no | ถ้ามี |
| VehiclePlate | string | no | ถ้ามี |
| ProductCode | string | no | ถ้ามี |
| ProductName | string | no | ค่าเริ่มต้น ปาล์มทะลาย |
| GrossWeightKg | number | no | น้ำหนักเข้า |
| TareWeightKg | number | no | น้ำหนักออก |
| NetWeightKg | number | yes | น้ำหนักสุทธิ |
| DeductionWeightKg | number | yes | default 0 |
| PayableWeightKg | number | yes | น้ำหนักคิดเงิน |
| PricePerKg | number | yes | บาท/กก. |
| GrossAmount | number | yes | ก่อนหักเงิน |
| TotalDeduction | number | yes | default 0 |
| NetAmount | number | yes | รับสุทธิ |
| Currency | string | yes | THB |
| Notes | string | no | หมายเหตุผู้ใช้ |
| HandwrittenNotes | string | no | ถ้าอ่านได้ |
| ImageFileID | string | no | Google Drive file ID |
| ImageName | string | no | ชื่อไฟล์ที่จัดเก็บ |
| ImageSha256 | string | no | ตรวจซ้ำ |
| ImageMimeType | string | no | image/jpeg, image/png |
| ImageBytes | number | no | ขนาดไฟล์ |
| OCRRunID | string | no | FK OCRRuns |
| OCRStatus | enum | yes | NOT_USED, SUCCESS, PARTIAL, FAILED |
| ConfidenceOverall | number | no | 0..1 |
| AIModel | string | no | เช่น gemini-3.6-flash |
| Source | enum | yes | CAMERA, UPLOAD, MANUAL |
| DuplicateScore | number | no | 0..1 |
| DuplicateOfSaleID | string | no | รายการคล้าย |
| DuplicateOverride | boolean | yes | default false |
| CreatedAt | datetime | yes | ISO 8601 |
| UpdatedAt | datetime | yes | ISO 8601 |

## Deductions

| Column | Type | Required | Notes |
|---|---|---:|---|
| DeductionID | string | yes | PK |
| SaleID | string | yes | FK Sales |
| SortOrder | number | yes | ลำดับแสดง |
| DeductionType | enum | yes | WEIGHT, PERCENT, CONTAMINATION, TRANSPORT, LABOR, SERVICE, OTHER |
| Description | string | no | ข้อความจากใบชั่ง/ผู้ใช้ |
| Quantity | number | no | ปริมาณ |
| Unit | string | no | KG, PERCENT, ITEM |
| Rate | number | no | อัตรา |
| Amount | number | yes | จำนวนเงิน |
| CreatedAt | datetime | yes | ISO 8601 |
| UpdatedAt | datetime | yes | ISO 8601 |

## Buyers

| Column | Type | Required |
|---|---|---:|
| BuyerID | string | yes |
| BuyerName | string | yes |
| NormalizedName | string | yes |
| Branch | string | no |
| Address | string | no |
| Phone | string | no |
| Notes | string | no |
| Active | boolean | yes |
| CreatedAt | datetime | yes |
| UpdatedAt | datetime | yes |

## OCRRuns

| Column | Type | Notes |
|---|---|---|
| OCRRunID | string | PK |
| RequestID | string | trace ID |
| ImageSha256 | string | ห้ามเก็บ base64 |
| Model | string | รุ่น Gemini |
| SchemaVersion | string | JSON schema version |
| Status | enum | SUCCESS, PARTIAL, FAILED |
| OverallConfidence | number | 0..1 |
| MissingFieldsJSON | JSON string | field list |
| WarningsJSON | JSON string | warning list |
| ExtractedJSON | JSON string | ผลที่ผ่านการ parse แล้ว |
| DurationMs | number | latency |
| ErrorCode | string | ถ้ามี |
| CreatedAt | datetime | ISO 8601 |

## AuditTrail

| Column | Type | Notes |
|---|---|---|
| AuditID | string | PK |
| SaleID | string | FK |
| Action | enum | CREATE, UPDATE, VOID, DUPLICATE_OVERRIDE |
| ChangedFieldsJSON | JSON string | field/old/new |
| Actor | string | PERSONAL_USER |
| Timestamp | datetime | ISO 8601 |
| RequestID | string | trace |

## Settings

| Key | Default |
|---|---|
| APP_NAME | Palm Yield Ledger |
| TIMEZONE | Asia/Bangkok |
| WEIGHT_UNIT | KG |
| CURRENCY | THB |
| GEMINI_MODEL | gemini-3.6-flash |
| GEMINI_SCHEMA_VERSION | 1.0.0 |
| WEIGHT_TOLERANCE_KG | 1 |
| MONEY_TOLERANCE_THB | 1 |
| LOW_CONFIDENCE_THRESHOLD | 0.75 |
| NULL_CONFIDENCE_THRESHOLD | 0.50 |
| DUPLICATE_WARN_SCORE | 0.70 |
| DUPLICATE_BLOCK_SCORE | 0.90 |
| SYSTEM_VERSION | 0.1.0 |

Secret เช่น API Key, Spreadsheet ID, Folder ID และ pairing secret ห้ามเก็บใน Settings sheet ให้เก็บใน Script Properties

## Logs

| Column | Type |
|---|---|
| LogID | string |
| RequestID | string |
| Level | enum INFO, WARN, ERROR |
| Action | string |
| SaleID | string |
| Description | string |
| ErrorCode | string |
| DurationMs | number |
| Timestamp | datetime |

## Index strategy ใน Apps Script

Sheets ไม่มี index จริง จึงใช้:

- CacheService สำหรับ Buyers/Settings
- Map โดย SaleID หลัง batch read
- fingerprint map สำหรับ duplicate candidate
- จำกัด history query ด้วยช่วงวันที่
- เมื่อข้อมูลโตมากค่อยสร้าง Summary sheet แบบ materialized aggregate
