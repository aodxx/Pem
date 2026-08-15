# คู่มือ PALM LEDGER สำหรับเจ้าของระบบ

คู่มือนี้เขียนสำหรับการใช้งาน PALM LEDGER แบบ **Multi-owner Template** โดยตั้งใจให้ทำตามได้ทีละขั้น แม้ไม่ได้เป็นนักพัฒนา

> กฎสำคัญที่สุด: **1 เจ้าของ = 1 Apps Script Deployment = 1 Google Sheet = 1 Drive workspace**
>
> เจ้าของแต่ละคนต้องมีข้อมูล ใบชั่ง รูปภาพ Access Token และ Gemini API Key ของตัวเอง ห้ามใช้ร่วมกัน

---

## 1. PALM LEDGER แบบ Multi-owner คืออะไร

PALM LEDGER มีหน้าเว็บ/PWA ชุดเดียวกันได้ แต่เบื้องหลังของแต่ละคนจะแยกกัน เช่น

```text
PALM LEDGER PWA
   |
   +-- เจ้าของ A -> Apps Script A -> Sheet A + Drive A
   |
   +-- เจ้าของ B -> Apps Script B -> Sheet B + Drive B
   |
   +-- เจ้าของ C -> Apps Script C -> Sheet C + Drive C
```

ดังนั้นข้อมูลของเจ้าของ A จะไม่ถูกเก็บใน Sheet หรือ Drive ของเจ้าของ B

---

# ส่วนที่ A — สิ่งที่ต้องเตรียมครั้งแรก

## 2. สิ่งที่เจ้าของใหม่ต้องมี

เจ้าของใหม่ควรมี:

1. บัญชี Google ของตัวเอง
2. สำเนา Google Sheet Template ของ PALM LEDGER
3. Apps Script ที่มากับ Template
4. Gemini API Key ของตัวเอง
5. โทรศัพท์หรือคอมพิวเตอร์ที่จะใช้ PALM LEDGER

ไม่ต้องมี GitHub Account หากแค่ใช้งานระบบ

---

# ส่วนที่ B — การสร้าง Template สำหรับแจก

## 3. Template ที่ดีต้องเป็น “Template สะอาด”

ก่อนแจกให้คนอื่น ให้ตรวจว่า Google Sheet Template:

- มีหัวตารางและโครงสร้างที่ระบบต้องใช้
- ไม่มีข้อมูลขายจริงของคุณ
- ไม่มีประวัติค่าแรงจริงของคุณ
- ไม่มีรูปใบชั่งของคุณ
- ไม่มี Access Token ของคุณ
- ไม่มี Gemini API Key ของคุณ
- ไม่มี Spreadsheet ID หรือ Drive Folder ID ที่บังคับชี้กลับมายังข้อมูล production ของคุณ

ระบบ Multi-owner มีตัวตรวจป้องกันเพิ่มเติม แต่หลักที่ปลอดภัยที่สุดคือ **แจกเฉพาะ Template ที่ไม่มีข้อมูลจริง**

---

# ส่วนที่ C — ติดตั้ง PALM LEDGER ให้เจ้าของใหม่

## 4. ทำสำเนา Google Sheet Template

ให้เจ้าของใหม่ทำดังนี้:

1. เปิด Google Sheet Template
2. ไปที่เมนู **ไฟล์ > ทำสำเนา**
3. ตั้งชื่อ เช่น
   - `PALM LEDGER - สวนสมชาย`
   - `PALM LEDGER - สวนพ่อ`
4. เลือกเก็บใน Google Drive ของเจ้าของคนนั้น
5. เปิดไฟล์สำเนาที่สร้างใหม่

สำคัญ: อย่าใช้ Sheet production ของเจ้าของคนเดิมโดยตรง

---

## 5. เปิด Apps Script

จาก Google Sheet สำเนา:

1. ไปที่เมนู **ส่วนขยาย**
2. เลือก **Apps Script**
3. ตรวจว่ามีไฟล์หลัก เช่น
   - `Code.gs`
   - `OwnerTemplate.gs`
   - `appsscript.json`

หากไม่มี `OwnerTemplate.gs` แสดงว่า Template ที่ใช้อยู่ยังไม่ใช่รุ่น Multi-owner ล่าสุด

---

## 6. รันตัวติดตั้ง Owner Instance

ใน Apps Script:

1. เลือกฟังก์ชัน `setupOwnerInstance`
2. กด **Run / เรียกใช้**
3. Google จะถามสิทธิ์การเข้าถึง
4. เลือกบัญชี Google ของเจ้าของคนนั้น
5. อนุญาตสิทธิ์ Google Sheets และ Google Drive
6. ระบบจะถามชื่อสวนหรือชื่อเจ้าของ
7. ใส่ชื่อ เช่น `สวนสมชาย`
8. ยืนยัน

เมื่อติดตั้งสำเร็จ ระบบจะสร้างให้เจ้าของคนนั้นโดยเฉพาะ:

- Owner Instance ID
- Drive workspace
- Receipt folder
- Spreadsheet binding
- Access Token

---

## 7. เก็บ Access Token ทันที

หลัง `setupOwnerInstance()` ทำงานสำเร็จ ระบบจะคืนค่า `accessToken`

ตัวอย่างรูปแบบ:

```text
PALM-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxxxxxx
```

ให้คัดลอกเก็บไว้ทันที เพราะระบบเก็บใน Backend เฉพาะค่า Hash และจะไม่สามารถอ่าน Token เดิมกลับออกมาได้

แนะนำให้เก็บไว้ในที่ส่วนตัว เช่น Password Manager หรือบันทึกที่เจ้าของเข้าถึงได้เท่านั้น

ห้ามส่ง Access Token ลง GitHub หรือโพสต์ในที่สาธารณะ

---

# ส่วนที่ D — ตั้งค่า Gemini

## 8. เพิ่ม Gemini API Key

ใน Apps Script:

1. กด **Project Settings / การตั้งค่าโปรเจกต์**
2. เลื่อนลงไปที่ **Script Properties**
3. กด **Add script property**
4. ตั้งค่า

```text
Property: GEMINI_API_KEY
Value: [Gemini API Key ของเจ้าของคนนั้น]
```

5. กดบันทึก

Gemini API Key ต้องเป็นของ Owner Instance นั้น และไม่ควรนำ Key ของเจ้าของคนอื่นมาใช้ร่วมกัน

---

# ส่วนที่ E — ตรวจสอบระบบก่อน Deploy

## 9. ตรวจสถานะ Owner Instance

กลับไปหน้า Editor แล้วรัน:

```text
getOwnerInstanceStatus()
```

ค่าที่ควรเห็นคือประมาณนี้:

```text
installed: true
spreadsheetConfigured: true
projectFolderConfigured: true
receiptsFolderConfigured: true
accessTokenConfigured: true
geminiConfigured: true
```

หาก `geminiConfigured` เป็น `false` ให้กลับไปตรวจ `GEMINI_API_KEY`

---

## 10. ทดสอบ Backend

หากโปรเจกต์มีฟังก์ชันทดสอบ ให้รัน:

```text
runPhase1Tests()
```

หรือฟังก์ชันทดสอบที่ระบุในเวอร์ชันปัจจุบัน

ต้องไม่มีรายการ `failed` ก่อนนำไปใช้งานจริง

---

# ส่วนที่ F — Deploy Apps Script เป็น Web App

## 11. สร้าง Deployment ของเจ้าของคนนี้

ใน Apps Script:

1. กด **Deploy**
2. เลือก **New deployment**
3. เลือกประเภท **Web app**
4. ตั้งค่า Execute as เป็น **Me**
5. เลือกสิทธิ์การเข้าถึงตามรูปแบบที่ระบบใช้อยู่
6. กด **Deploy**
7. อนุญาตสิทธิ์ หาก Google ถามอีกครั้ง
8. คัดลอก **Web App URL**

URL จะมีรูปแบบประมาณ:

```text
https://script.google.com/macros/s/xxxxxxxxxxxxxxxx/exec
```

Web App URL นี้เป็นของ Owner Instance นี้เท่านั้น

---

# ส่วนที่ G — เชื่อมกับ PALM LEDGER PWA

## 12. จับคู่โทรศัพท์ของเจ้าของกับ Backend

เปิด PALM LEDGER PWA แล้ว:

1. ไปที่หน้า **ตั้งค่า**
2. ใส่ **Apps Script Web App URL**
3. ใส่ **Access Token** ที่ได้จากขั้นตอนติดตั้ง
4. กด **บันทึกและทดสอบการเชื่อมต่อ**
5. รอข้อความว่าเชื่อมต่อสำเร็จ

Web App URL และ Token จะถูกเก็บในอุปกรณ์ของเจ้าของ ไม่ได้ถูก commit ลง Repository

---

## 13. ทดสอบงานจริงครั้งแรก

หลังเชื่อมต่อแล้ว ให้ทดสอบตามลำดับ:

1. เปิด PALM LEDGER
2. ถ่ายหรือเลือกรูปใบชั่งหนึ่งใบ
3. ให้ Gemini วิเคราะห์
4. ตรวจข้อมูลทุกช่อง
5. แก้ข้อมูลหากจำเป็น
6. กดบันทึก
7. เปิด Google Sheet ของเจ้าของคนนั้น
8. ตรวจว่ารายการใหม่เข้าชีตของเจ้าของคนนั้น
9. เปิด Google Drive ของเจ้าของคนนั้น
10. ตรวจว่ารูปใบชั่งถูกเก็บใน Receipt folder ของเจ้าของคนนั้น

หากทั้ง Sheet และ Drive ถูกต้อง ถือว่า Owner Instance พร้อมใช้งาน

---

# ส่วนที่ H — วิธีตรวจว่าไม่มีข้อมูลปะปนกัน

## 14. Checklist ก่อนส่งมอบให้เจ้าของใหม่

ตรวจให้ครบ:

- [ ] Sheet เป็นของเจ้าของใหม่
- [ ] Owner Instance ID ไม่ใช่ของคนเดิม
- [ ] Drive workspace เป็นของเจ้าของใหม่
- [ ] Receipt folder เป็นของเจ้าของใหม่
- [ ] Access Token เป็น Token ใหม่
- [ ] Gemini API Key เป็นของเจ้าของใหม่
- [ ] Web App URL เป็น Deployment ใหม่
- [ ] ทดสอบบันทึกแล้วข้อมูลเข้า Sheet ถูกคน
- [ ] รูปใบชั่งเข้า Drive ถูกคน
- [ ] Dashboard อ่านเฉพาะข้อมูลของเจ้าของคนนี้

---

# ส่วนที่ I — เปลี่ยน Access Token

## 15. กรณี Token หาย หรืออยากเปลี่ยน Token

ใน Apps Script รัน:

```text
rotateOwnerAccessToken()
```

ระบบจะสร้าง Token ใหม่และยกเลิก Token เดิมทันที

หลังจากนั้น:

1. คัดลอก Token ใหม่
2. เปิด PALM LEDGER บนอุปกรณ์
3. ไปหน้า Settings
4. เปลี่ยน Access Token
5. กดบันทึกและทดสอบใหม่

---

# ส่วนที่ J — ตรวจสถานะโดยไม่เปิดเผย Secret

## 16. ตรวจระบบภายหลัง

สามารถรัน:

```text
getOwnerInstanceStatus()
```

ฟังก์ชันนี้ใช้ตรวจว่าระบบตั้งค่าครบหรือไม่ โดยจะไม่แสดง Gemini API Key และไม่แสดง Access Token จริง

---

# ส่วนที่ K — หากมีหลายคนในครอบครัวหรือหลายสวน

## 17. วิธีเพิ่ม Owner คนที่ 2, 3, 4...

ให้ทำขั้นตอนเดิมใหม่ทั้งหมดสำหรับแต่ละเจ้าของ:

```text
Template สะอาด
   -> ทำสำเนา Sheet ใหม่
   -> setupOwnerInstance()
   -> Gemini API Key ของคนนั้น
   -> Deploy Web App ใหม่
   -> รับ Web App URL ใหม่
   -> รับ Access Token ใหม่
   -> จับคู่ PWA ของคนนั้น
```

ห้ามนำ Apps Script Deployment ของ Owner A ไปเปลี่ยน Spreadsheet ID เพื่อใช้กับ Owner B

---

# ส่วนที่ L — สิ่งที่ห้ามทำ

## 18. ห้ามทำรายการต่อไปนี้

- ห้ามใช้ Sheet production ของเจ้าของเดิมเป็น Template แจกตรง ๆ
- ห้ามใช้ Apps Script Deployment เดียวกันหลายเจ้าของ
- ห้ามแชร์ Access Token ระหว่างเจ้าของ
- ห้ามแชร์ Gemini API Key โดยไม่ตั้งใจ
- ห้าม hard-code Spreadsheet ID ของเจ้าของคนใดคนหนึ่งเข้า frontend รุ่น Template
- ห้ามนำข้อมูลขายจริงติดไปกับ Template
- ห้าม commit Secret ลง GitHub

---

# ส่วนที่ M — สรุปแบบสั้นที่สุด

สำหรับเจ้าของใหม่หนึ่งคน ให้จำเพียงขั้นตอนนี้:

```text
1. ทำสำเนา Template Sheet
2. เปิด Extensions > Apps Script
3. รัน setupOwnerInstance()
4. เก็บ Access Token
5. ใส่ GEMINI_API_KEY
6. รัน getOwnerInstanceStatus()
7. Deploy เป็น Web App
8. คัดลอก Web App URL
9. เปิด PALM LEDGER > Settings
10. ใส่ Web App URL + Access Token
11. ทดสอบใบชั่ง 1 ใบ
12. ตรวจ Sheet + Drive
```

ถ้าครบ 12 ขั้นตอนนี้ Owner Instance พร้อมใช้งาน

---

## เอกสารสำหรับนักพัฒนา

รายละเอียดเชิงสถาปัตยกรรมและกฎ isolation ดูเพิ่มเติมที่:

- `docs/MULTI_OWNER_SETUP.md`
- `apps-script/README.md`
- `docs/INSTALL.md`

คู่มือนี้เน้นสำหรับเจ้าของระบบและผู้ใช้งานทั่วไป ส่วนเอกสารข้างต้นใช้สำหรับนักพัฒนาและการบำรุงรักษาระบบ
