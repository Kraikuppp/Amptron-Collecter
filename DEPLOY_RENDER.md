# คู่มือการนำ Tuya Proxy ขึ้น Render.com (และเชื่อมต่อ Firebase)

คู่มือนี้จะสอนวิธีนำ Server ของคุณไปรันบน **Render.com** (แทน Railway) และตั้งค่าให้ทำงานเก็บข้อมูลลง Firebase ตลอดเวลา

## สิ่งที่ต้องเตรียม (Prerequisites)

1.  **บัญชี GitHub**: มีอยู่แล้ว (จากขั้นตอนก่อนหน้า)
2.  **บัญชี Render**: สมัครได้ที่ [render.com](https://render.com/) (ใช้ GitHub Login ได้เลย)
3.  **Firebase Project**: มีอยู่แล้ว

---

## ขั้นตอนที่ 1: เตรียม Firebase Key (ถ้ายังไม่มี)

1.  ไปที่ [Firebase Console](https://console.firebase.google.com/)
2.  เลือกโปรเจกต์ > **Project settings** > **Service accounts**
3.  กด **Generate new private key** เพื่อโหลดไฟล์ `.json`
4.  เปิดไฟล์นี้ด้วย Notepad หรือ VS Code แล้ว **Copy โค้ดข้างในทั้งหมดเตรียมไว้**

---

## ขั้นตอนที่ 2: อัพโหลดโค้ดขึ้น GitHub (ทำครั้งเดียว)

คุณได้ทำ `git init` และ `git commit` ไปแล้วในเครื่อง เหลือแค่เอาขึ้น GitHub:

1.  ไปที่ [github.com/new](https://github.com/new) เพื่อสร้าง Repository ใหม่
    *   ตั้งชื่อ เช่น `tuya-proxy-server`
    *   เลือก **Public** หรือ **Private** ก็ได้
    *   กด **Create repository**
2.  เมื่อสร้างเสร็จ GitHub จะแสดงหน้าคำสั่ง ให้ดูหัวข้อ **"…or push an existing repository from the command line"**
3.  Copy 3 บรรทัดนั้นมา รันใน Terminal ของ VS Code ทีละบรรทัด:
    ```bash
    git remote add origin https://github.com/ชื่อคุณ/tuya-proxy-server.git
    git branch -M main
    git push -u origin main
    ```
    *(ถ้ามีการถามรหัสผ่าน GitHub ให้ทำตามขั้นตอนยืนยันตัวตนของ GitHub)*

---

## ขั้นตอนที่ 3: สร้าง Web Service บน Render

1.  ไปที่ Dashboard ของ [Render](https://dashboard.render.com/)
2.  กดปุ่ม **New +** แล้วเลือก **Web Service**
3.  เลือก **Build and deploy from a Git repository**
4.  จะเห็นรายชื่อ Repo ของคุณ ให้กด **Connect** ที่ `tuya-proxy-server`
5.  ตั้งค่าดังนี้:
    *   **Name**: ตั้งชื่อตามใจชอบ เช่น `tuya-meter-proxy`
    *   **Region**: เลือก Singapore (ใกล้ไทยที่สุด)
    *   **Branch**: `main`
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install`
    *   **Start Command**: `node server.js`
    *   **Plan**: เลือก **Free**

---

## ขั้นตอนที่ 4: ตั้งค่า Environment Variables (สำคัญมาก)

เลื่อนลงมาข้างล่างสุด จะเจอหัวข้อ **Environment Variables** ให้กด **Add Environment Variable** เพื่อเพิ่มค่าทีละตัว:

1.  **ตัวที่ 1**:
    *   Key: `TUYA_ACCESS_ID`
    *   Value: (ใส่ Access ID ของคุณ)
2.  **ตัวที่ 2**:
    *   Key: `TUYA_ACCESS_SECRET`
    *   Value: (ใส่ Access Secret ของคุณ)
3.  **ตัวที่ 3**:
    *   Key: `TUYA_DEVICE_IDS`
    *   Value: (ใส่ Device ID เช่น `a32ca52fe390525ac5gss3,a3e540a09673f26b29h48u`)
4.  **ตัวที่ 4 (สำคัญที่สุด)**:
    *   Key: `FIREBASE_SERVICE_ACCOUNT`
    *   Value: **วางโค้ด JSON ทั้งหมดที่ Copy มาจากขั้นตอนที่ 1 ลงไป** (วางลงไปทั้งก้อนเลย Render รับได้)

กดปุ่ม **Create Web Service** ด้านล่างสุด

---

## ขั้นตอนที่ 5: ทำให้ทำงานตลอดเวลา (แก้ปัญหา Render Free หลับ)

**ปัญหา:** Render แบบ Free จะ "หลับ" (Sleep) ถ้าไม่มีคนเข้าใช้งานเกิน 15 นาที ทำให้ Cron Job หยุดทำงาน
**วิธีแก้:** เราต้องใช้บริการฟรีจากภายนอกมา "ยิง" (Ping) เว็บเราทุกๆ 5-10 นาที

1.  รอจน Render Deploy เสร็จ (สถานะเป็นสีเขียว **Live**)
2.  Copy URL ของเว็บคุณที่มุมซ้ายบน (เช่น `https://tuya-meter-proxy.onrender.com`)
3.  ไปสมัครเว็บ **[UptimeRobot](https://uptimerobot.com/)** (ฟรี)
4.  กด **Add New Monitor**
    *   **Monitor Type**: HTTP(s)
    *   **Friendly Name**: Tuya Proxy
    *   **URL (or IP)**: วาง URL ของ Render ที่ Copy มา
    *   **Monitoring Interval**: ปรับเป็น **5 minutes** (สำคัญ! ต้องเร็วกว่า 15 นาที)
    *   กด **Create Monitor**

**เสร็จสิ้น!** ตอนนี้ UptimeRobot จะคอยเรียกเว็บคุณทุก 5 นาที ทำให้ Server ไม่หลับ และ Cron Job จะทำงานเก็บข้อมูลลง Firebase ได้ตลอด 24 ชั่วโมง

---

## วิธีตรวจสอบว่าทำงานไหม

1.  **ดู Log ใน Render**: ไปที่แท็บ **Logs** คุณควรเห็นข้อความ `Cron job scheduled` และทุกๆ 10 นาทีจะเห็น `Saved data for device ...`
2.  **ดูใน Firebase**: ไปที่ Firestore Database จะเห็นข้อมูลใหม่เข้ามาเรื่อยๆ
