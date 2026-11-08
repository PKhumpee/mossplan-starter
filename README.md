# Mossplan

**Plan it. Let it grow.**

*วางแผนไว้ แล้วปล่อยให้โต*

Mossplan is a Thai-language content management system for building and growing search-friendly websites on Cloudflare. It includes a web-based admin, with the `moss` command-line tool planned.

## Status

Mossplan is under active development. New websites start with search indexing disabled (`noindex`) until an administrator enables it.

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/PKhumpee/mossplan-starter)

> **Not yet tested:** the button points to the public `PKhumpee/mossplan-starter` repository, but no real Cloudflare deployment has been tested.

1. Select **Deploy to Cloudflare** and follow the deployment form.
2. Set `SETUP_TOKEN` and `MOSS_SECRET_KEY` as secrets in the deploy form. If the form does not offer these fields, add them in the Worker dashboard under **Settings > Variables and Secrets**. Do not add them as plain-text variables or commit their values.
3. Open `https://<your-worker-domain>/admin/setup` and complete the setup.

Keep both values private. `SETUP_TOKEN` protects initial setup; `MOSS_SECRET_KEY` encrypts secrets saved during setup. For manual Wrangler deployments, add secrets interactively with `pnpm exec wrangler secret put SETUP_TOKEN` and `pnpm exec wrangler secret put MOSS_SECRET_KEY`; Wrangler prompts for each value, so do not put secret values in commands or logs.

## Run locally

Requirements: Node.js and pnpm.

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm dev
```

Set local development values in `.dev.vars` as needed. Keep real credentials out of source control.

## License

Mossplan is licensed under the Functional Source License, Version 1.1, Apache 2.0 Future License (FSL-1.1-ALv2). See the license terms before using or distributing the software.

---

## ภาษาไทย

**วางแผนไว้ แล้วปล่อยให้โต**

Mossplan คือระบบจัดการเนื้อหาภาษาไทยสำหรับสร้างและพัฒนาเว็บไซต์ที่ค้นหาเจอได้ง่ายบน Cloudflare พร้อมหน้าจัดการเว็บไซต์ และมีแผนพัฒนาเครื่องมือบรรทัดคำสั่ง `moss`

### สถานะ

Mossplan อยู่ระหว่างการพัฒนา เว็บไซต์ใหม่จะเริ่มต้นโดยปิดการจัดทำดัชนีของเครื่องมือค้นหา (`noindex`) จนกว่าผู้ดูแลจะเปิดใช้งาน

### ติดตั้งบน Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/PKhumpee/mossplan-starter)

> **ยังไม่ได้ทดสอบ:** ปุ่มนี้ชี้ไปที่ `PKhumpee/mossplan-starter` ซึ่งเป็น Public แล้ว แต่ยังไม่ได้ทดสอบ deploy จริงบน Cloudflare

1. กด **Deploy to Cloudflare** แล้วทำตามแบบฟอร์ม
2. ตั้ง `SETUP_TOKEN` และ `MOSS_SECRET_KEY` เป็น Secret ในแบบฟอร์ม Deploy หากไม่มีช่องให้กรอก ให้เพิ่มใน Cloudflare Dashboard ที่ **Settings > Variables and Secrets** ห้ามใส่เป็นตัวแปรข้อความธรรมดาหรือ commit ค่าเหล่านี้
3. เปิด `https://<โดเมน-worker>/admin/setup` แล้วตั้งค่าต่อให้เสร็จ

เก็บค่าทั้งสองเป็นความลับ `SETUP_TOKEN` ใช้ป้องกันการตั้งค่าครั้งแรก ส่วน `MOSS_SECRET_KEY` ใช้เข้ารหัส Secret ที่บันทึกจากหน้า setup

### เริ่มใช้งานบนเครื่อง

ต้องติดตั้ง Node.js และ pnpm ก่อน จากนั้นรันคำสั่ง:

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm dev
```

ตั้งค่าที่จำเป็นสำหรับการพัฒนาในเครื่องไว้ใน `.dev.vars` และอย่านำข้อมูลรับรองจริงเข้าไปใน source control

### สัญญาอนุญาต

Mossplan ใช้สัญญาอนุญาต Functional Source License รุ่น 1.1, Apache 2.0 Future License (FSL-1.1-ALv2) โปรดอ่านเงื่อนไขก่อนใช้งานหรือเผยแพร่ซอฟต์แวร์
