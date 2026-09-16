# Bottom Navigation Automated Test

สคริปต์ `tests/bottom-navigation-viewport.py` ใช้ Playwright และ Chromium เพื่อตรวจสอบการแสดงผล Bottom Navigation ของ Pem บนหน้าจอหลายขนาด โดยสคริปต์จะเริ่ม dev server ให้อัตโนมัติหากยังไม่มี server ที่ `http://127.0.0.1:4173/` ทำงานอยู่

## การติดตั้ง

เครื่องที่รัน test ต้องมี Python Playwright และ Chromium หากยังไม่มี ให้ติดตั้งด้วยคำสั่งต่อไปนี้:

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
```

หากต้องการใช้ Chromium ที่ติดตั้งไว้ในตำแหน่งอื่น ให้กำหนดตัวแปร `CHROMIUM_PATH` ก่อนรัน เช่น:

```bash
CHROMIUM_PATH=/usr/bin/chromium npm run test:bottom-nav
```

## การเรียกใช้

```bash
npm run test:bottom-nav
```

ผลลัพธ์จะแสดงสถานะราย viewport เป็น JSON และคืน exit code `0` เมื่อผ่านทั้งหมด หรือ exit code `1` เมื่อมี assertion ล้มเหลว

## สิ่งที่ตรวจสอบ

| กลุ่ม | เงื่อนไข |
|---|---|
| ขนาดแถบ | Bottom Navigation สูง 72px โดยยอมรับค่าคลาดเคลื่อน 1px |
| ปุ่มสแกน | ขนาด 64–68px และยกเหนือขอบแถบ 24–28px |
| ช่องเว้า | ความกว้าง 84–92px |
| ปุ่มย่อย | ขนาดไม่น้อยกว่า 48px |
| พื้นที่เนื้อหา | `body` มี bottom padding อย่างน้อย 110px |
| Overflow | ไม่เกิด horizontal overflow |
| Navigation | ปุ่มภาพรวมและรายการเปิด view ที่ถูกต้อง |
| Capture flow | ปุ่มถ่ายใบชั่งเปิด file chooser และกลับสู่หน้า home |
| รายการยาว | รายการท้ายสุดเลื่อนพ้น Bottom Navigation ได้ ไม่ถูกแถบบัง |

Viewport ที่ตรวจครอบคลุมขนาดมือถือแนวตั้ง 320×568 ถึง 480×800 และแนวนอน 568×320 กับ 667×375

> หมายเหตุ: Chromium headless ไม่จำลอง hardware safe-area inset ของอุปกรณ์จริง ดังนั้น test นี้ตรวจการมีอยู่และการคำนวณ fallback ของ `env(safe-area-inset-bottom, 0px)` ได้ แต่ควรตรวจซ้ำบนอุปกรณ์ iPhone/Android จริงก่อน release สำคัญ
