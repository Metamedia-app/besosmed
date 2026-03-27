# BeSosmed — Backend Sosial Media

Backend API untuk aplikasi sosial media, dibangun dengan **Fastify**, **MongoDB Atlas**, dan **Swagger** untuk dokumentasi API.

## Tech Stack

| Teknologi | Versi | Kegunaan |
|---|---|---|
| Node.js | ≥ 18 | Runtime |
| Fastify | 5.x | Web framework |
| Mongoose | 9.x | MongoDB ODM |
| Swagger UI | — | Dokumentasi API |
| Nodemon | — | Hot-reload (dev) |

---

## Prasyarat

Pastikan sudah ter-install di komputer kamu:

1. **Node.js** v18 atau lebih baru — [Download](https://nodejs.org/)
2. **Git** — [Download](https://git-scm.com/)

Cek versi:

```bash
node -v   # minimal v18.x.x
npm -v    # biasanya ikut sama Node.js
git --version
```

---

## Cara Install & Menjalankan

### 1. Clone Repository

```bash
git clone https://github.com/<username>/<nama-repo>.git
cd <nama-repo>
```

> Ganti `<username>` dan `<nama-repo>` sesuai repo GitHub kamu.

### 2. Install Dependencies

```bash
npm install
```

Ini akan meng-install semua package yang dibutuhkan (fastify, mongoose, dotenv, dll).

### 3. Setup Environment Variables

Copy file `.env.example` menjadi `.env`:

```bash
# Windows (CMD)
copy .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env

# Mac / Linux
cp .env.example .env
```

Kemudian buka file `.env` dan isi dengan konfigurasi yang sesuai:

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# MongoDB Atlas — ganti dengan connection string dari MongoDB Atlas kamu
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority
```

> **⚠️ Penting:** Minta connection string MongoDB Atlas ke admin/lead project. Jangan push file `.env` ke GitHub!

### 4. Jalankan Server

**Development** (auto-restart saat ada perubahan):

```bash
npm run dev
```

**Production**:

```bash
npm start
```

### 5. Cek Apakah Berhasil

Kalau berhasil, di terminal akan muncul:

```
🚀 Server running at http://0.0.0.0:3000
📚 Swagger docs at http://localhost:3000/docs
```

- Buka **http://localhost:3000/docs** di browser untuk melihat dokumentasi API (Swagger UI).

---

## Struktur Folder

```
besosmed/
├── src/
│   ├── config/         # Konfigurasi app (env vars, dll)
│   ├── controllers/    # Logic handler untuk setiap route
│   ├── middlewares/     # Custom middleware (auth, dll)
│   ├── models/         # Mongoose schema & model
│   ├── plugins/        # Fastify plugins (cors, mongoose, dll)
│   ├── routes/         # Definisi endpoint API
│   ├── services/       # Business logic layer
│   ├── utils/          # Helper / utility functions
│   ├── app.js          # Setup & build Fastify instance
│   └── server.js       # Entry point — start server
├── .env.example        # Template environment variables
├── .gitignore
├── package.json
└── README.md
```

---

## Scripts yang Tersedia

| Command | Deskripsi |
|---|---|
| `npm run dev` | Jalankan server dengan **nodemon** (auto-reload) |
| `npm start` | Jalankan server untuk production |
| `npm test` | Jalankan test (belum dikonfigurasi) |

---

## Troubleshooting

### ❌ Error: `Cannot find module ...`

Pastikan sudah menjalankan `npm install` di root folder project.

### ❌ Error: `MongoServerError: bad auth`

Connection string MongoDB salah. Cek ulang `MONGO_URI` di file `.env`:
- Username & password benar
- Nama cluster benar
- IP Address kamu sudah di-whitelist di MongoDB Atlas (Network Access → Add IP → Allow Access from Anywhere / IP kamu)

### ❌ Error: `ECONNREFUSED` atau tidak bisa konek ke MongoDB

- Cek koneksi internet
- Pastikan IP kamu sudah di-whitelist di MongoDB Atlas
- Coba buka MongoDB Atlas dashboard, pastikan cluster aktif

### ❌ Port sudah dipakai (EADDRINUSE)

Ganti port di file `.env`:

```env
PORT=3001
```

---

## Catatan Penting

- **Jangan push file `.env`** ke GitHub (sudah ada di `.gitignore`).
- Minta credential MongoDB ke lead/admin project.
- Gunakan `npm run dev` saat development supaya auto-reload.
