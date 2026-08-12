# Palm Yield Ledger (Pem)

ระบบบันทึกผลผลิตและรายได้สวนปาล์มน้ำมันจากภาพใบชั่งน้ำหนัก

## เป้าหมาย Version 1

ถ่ายหรือเลือกรูปใบชั่งบนมือถือ → Gemini อ่านข้อมูลแบบ Structured JSON → ผู้ใช้ตรวจแก้ → บันทึก Google Sheets และรูปใน Google Drive → ดูประวัติและ Dashboard

## สถาปัตยกรรม

- Frontend: GitHub Pages, Vanilla JavaScript, Mobile-first PWA
- Backend: Google Apps Script Web App
- Database: Google Sheets
- Image storage: Google Drive
- AI: Gemini `gemini-3.6-flash` พร้อม Structured Output
- Timezone: `Asia/Bangkok`

## เอกสาร

- [PRD](PRD.md)
- [Architecture](ARCHITECTURE.md)
- [API Contract](API.md)
- [Progress](PROGRESS.md)
- [Receipt Analysis](docs/RECEIPT_ANALYSIS.md)
- [Google Sheets Data Schema](docs/DATA_SCHEMA.md)
- [Gemini Receipt Schema](schemas/gemini-receipt.schema.json)

## Project structure

```text
/
├── apps-script/       # Backend source (Phase 1+)
├── frontend/          # GitHub Pages PWA (Phase 4+)
├── docs/              # Discovery and data design
├── schemas/           # Versioned machine-readable schemas
├── API.md
├── ARCHITECTURE.md
├── PRD.md
└── PROGRESS.md
```

## สถานะ

Phase 0 — Discovery & Architecture: completed on development branch.
