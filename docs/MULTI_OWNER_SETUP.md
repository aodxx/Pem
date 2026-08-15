# PALM LEDGER — Multi-owner Template

## เป้าหมาย

PALM LEDGER ใช้ Frontend ชุดเดียวกันได้ แต่เจ้าของแต่ละคนต้องมี Backend และข้อมูลของตัวเองแยกจากกันโดยสมบูรณ์

หนึ่ง Owner Instance ประกอบด้วย:

- Google Sheet ของเจ้าของคนนั้น
- Apps Script Deployment ของเจ้าของคนนั้น
- Google Drive folder ของเจ้าของคนนั้น
- Receipt folder ของเจ้าของคนนั้น
- Access Token ของเจ้าของคนนั้น
- Gemini API Key ของเจ้าของคนนั้น

**ห้ามแชร์ `SPREADSHEET_ID`, `APP_ACCESS_TOKEN_HASH`, `RECEIPTS_FOLDER_ID` หรือ Gemini API Key ข้าม Owner Instance**

## รูปแบบที่แนะนำ

```text
PALM LEDGER PWA (ใช้ URL หน้าเว็บเดียวกันได้)
          |
          +-- เจ้าของ A -> Web App A -> Sheet A + Drive A
          |
          +-- เจ้าของ B -> Web App B -> Sheet B + Drive B
          |
          +-- เจ้าของ C -> Web App C -> Sheet C + Drive C
```

Frontend จับคู่กับ Owner Instance ผ่าน `Apps Script Web App URL + Access Token` ที่เก็บในอุปกรณ์ของผู้ใช้

## Template Sheet ต้องเป็นชีตสะอาด

Template Sheet ต้องมีเฉพาะโครงสร้าง/หัวตารางและ Settings ที่ไม่ใช่ข้อมูลส่วนตัว **ห้ามทำสำเนา Google Sheet production ที่มีรายการขายจริงแล้วส่งให้คนอื่น**

ตัวติดตั้ง `setupOwnerInstance()` มี guard เพิ่มเติมและจะปฏิเสธการติดตั้งเมื่อพบข้อมูลเดิมในชีตธุรกรรม เช่น Sales, Deductions, Buyers, Contractors, LaborEntries, LaborPayments, OCRRuns, AuditTrail หรือ Logs และจะปฏิเสธ Spreadsheet production เดิมของระบบด้วย

## ติดตั้งให้เจ้าของใหม่

### วิธีแนะนำ: สำเนา Google Sheet Template ที่สะอาดและมี Apps Script ผูกอยู่

1. ทำสำเนา **PALM LEDGER Template Sheet ที่ไม่มีข้อมูลของเจ้าของคนอื่น**
2. เปิดสำเนานั้นด้วยบัญชี Google ของเจ้าของใหม่
3. ไปที่ **ส่วนขยาย > Apps Script**
4. ต้องมี `Code.gs`, `OwnerTemplate.gs` และ `appsscript.json`
5. รัน `setupOwnerInstance()`
6. ระบบจะถามชื่อสวน/ชื่อเจ้าของ
7. อนุญาตสิทธิ์ Google Sheets และ Google Drive
8. เก็บค่า `accessToken` ที่ฟังก์ชันคืนมาไว้ทันที
9. ไปที่ **Project Settings > Script Properties** แล้วเพิ่ม `GEMINI_API_KEY`
10. รัน `getOwnerInstanceStatus()` และตรวจว่า:
   - `installed: true`
   - `spreadsheetConfigured: true`
   - `projectFolderConfigured: true`
   - `receiptsFolderConfigured: true`
   - `accessTokenConfigured: true`
   - `geminiConfigured: true`
11. รัน `runPhase1Tests()` ถ้ามี และต้องไม่มี test ที่ failed
12. Deploy > New deployment > Web app
13. Execute as: **Me**
14. Who has access: ตามรูปแบบ deployment ที่ระบบใช้อยู่
15. คัดลอก Web App URL

> Multi-owner installer **ไม่เรียก `setupProject()` ของระบบ production เดิม** เพราะฟังก์ชัน legacy นั้นมีหน้าที่ตั้งค่าระบบ production เดิมและอาจเขียน Spreadsheet/Drive ID เดิมกลับเข้า Script Properties ตัวติดตั้งใหม่จะสร้าง schema บน Sheet ของเจ้าของใหม่โดยตรงแทน

## จับคู่กับ PALM LEDGER PWA

เปิดหน้า **ตั้งค่า** ใน PALM LEDGER แล้วกรอก:

- Apps Script Web App URL ของ Owner Instance
- Access Token ที่ได้จาก `setupOwnerInstance()`

กด **บันทึกและทดสอบการเชื่อมต่อ**

หน้าเว็บสามารถใช้ URL GitHub Pages เดียวกันสำหรับหลายคนได้ เพราะ Web App URL และ Token ถูกเก็บไว้ใน browser/PWA ของแต่ละอุปกรณ์ ไม่ได้ commit ลง Repository

### กฎสำหรับอุปกรณ์

ในรุ่นปัจจุบันให้ถือว่า **1 PWA installation / 1 browser profile = 1 Owner** เนื่องจาก Offline Save Queue ถูกเก็บใน IndexedDB ของอุปกรณ์ หากต้องเปลี่ยนจากเจ้าของ A ไปเจ้าของ B บนอุปกรณ์เดียวกัน ต้องแน่ใจก่อนว่าไม่มีรายการรอส่ง และควรล้างข้อมูลแอป/ติดตั้ง PWA ใหม่ก่อนจับคู่เจ้าของใหม่ เพื่อไม่ให้คิวออฟไลน์เก่าปะปนกับ instance ใหม่

สำหรับการใช้งานปกติที่แต่ละเจ้าของใช้โทรศัพท์ของตัวเอง จะไม่มีปัญหานี้

## ทำไมต้องแยก Apps Script ต่อคน

Apps Script เป็น security boundary ของข้อมูลแต่ละเจ้าของ หากใช้ Deployment เดียวกันแล้วสลับ Spreadsheet ID จะเสี่ยงต่อ:

- บันทึกข้อมูลผิดสวน
- ภาพใบชั่งไปอยู่ Drive ผิดคน
- Dashboard อ่านข้อมูลปะปน
- Token คนหนึ่งเข้าถึงข้อมูลอีกคน

ดังนั้นกฎของ Template คือ **1 Owner = 1 Apps Script Deployment = 1 Sheet = 1 Drive workspace**

## การเปลี่ยน Access Token

รัน:

```text
rotateOwnerAccessToken()
```

Token เดิมจะใช้ไม่ได้ทันที จากนั้นให้นำ Token ใหม่ไปใส่ในอุปกรณ์ของเจ้าของคนนั้น

## การตรวจสถานะโดยไม่เปิดเผย Secret

รัน:

```text
getOwnerInstanceStatus()
```

ฟังก์ชันนี้ไม่คืน Gemini API Key และไม่คืน Access Token

## ข้อกำหนดสำหรับนักพัฒนา

- ห้าม hard-code Owner ID, Spreadsheet ID, Folder ID หรือ Secret ใหม่ลง source code
- configuration ของ Owner ต้องอยู่ใน Apps Script Script Properties
- Frontend ต้องเก็บ Web App URL / Token เฉพาะ local device
- ฟีเจอร์ใหม่ต้องทำงานโดยไม่สมมติว่ามีเจ้าของเพียงคนเดียว
- migration ต้องทำงานใน Sheet ของ Owner Instance ปัจจุบันเท่านั้น
- test fixture ห้ามอ้างอิง Spreadsheet จริงของ production
- ห้ามเรียก legacy `setupProject()` จาก Multi-owner installer
- ห้ามสร้าง Template จากชีตที่มีข้อมูล production จริง

## สถานะของเจ้าของเดิม

การเพิ่ม Multi-owner Template ไม่ได้ย้ายหรือรวมข้อมูล production เดิม เจ้าของเดิมยังใช้ Sheet/Drive/Deployment เดิมได้ตามปกติ ส่วนเจ้าของใหม่จะเริ่มจาก instance ที่แยกออกมา
