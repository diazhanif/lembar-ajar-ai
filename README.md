# LembarAjar AI

**Belajar dari PDF, satu halaman pada satu waktu.** LembarAjar membantu pelajar memahami materi dengan tanya-jawab yang menunjuk halaman sumber, kartu hafalan, dan kuis pilihan ganda.

## Fitur

- Ekstraksi PDF berbasis teks di browser menggunakan PDF.js; berkas asli tidak diunggah ke server aplikasi.
- Tiga mode belajar: tanya AI, kartu hafalan, dan kuis cepat.
- Jawaban dan latihan menyertakan nomor halaman serta kutipan yang diverifikasi terhadap teks sumber di server.
- Batas file 12 MB, 40 halaman, dan 80.000 karakter teks per sesi.
- Dokumen hanya berada di memori sesi browser, tanpa akun, database, cookies, atau `localStorage`.
- API key hanya dibaca server-side. Tidak ada isi materi yang dicatat ke log aplikasi.
- Antarmuka responsif dan dapat dipakai dengan keyboard; tanpa framework frontend.

## Mulai lokal

Membutuhkan Node.js 20 atau lebih baru.

1. Pasang dependensi:

   ```bash
   npm install
   ```

2. Atur kredensial AI di terminal. Server mendukung endpoint yang kompatibel dengan Chat Completions:

   ```bash
   export OPENAI_API_KEY="kunci-anda"
   export OPENAI_MODEL="gpt-4o-mini"
   # Opsional, bila memakai penyedia kompatibel:
   export OPENAI_BASE_URL="https://api.openai.com/v1"
   ```

   Jangan menaruh kunci di kode, browser, atau commit. File `.env` tidak dibaca otomatis.

3. Jalankan aplikasi:

   ```bash
   npm start
   ```

4. Buka <http://127.0.0.1:3000>.

Secara default server hanya mendengarkan `127.0.0.1`. Sebelum menjalankannya di jaringan publik, tambahkan autentikasi, pembatasan laju/biaya, dan perlindungan penyalahgunaan.

## Pengujian

```bash
npm test
```

Tes menggunakan test runner bawaan Node.js dan mock provider lokal; tidak membutuhkan API key atau mengirim materi ke penyedia AI.

## Privasi dan batasan

- PDF dibaca di browser dan tidak dikirim sebagai berkas. Hanya teks hasil ekstraksi dikirim ke endpoint AI setelah pengguna meminta jawaban atau latihan.
- Penyedia AI yang dikonfigurasi memproses teks tersebut; kebijakan retensi penyedia tetap berlaku. Jangan memakai materi rahasia tanpa memahami kebijakan penyedia.
- PDF hasil pindai/foto yang tidak memiliki lapisan teks belum didukung. OCR tidak dilakukan.
- Model dapat keliru; validasi kutipan di server menolak kutipan yang tidak cocok persis dengan teks halaman, tetapi tidak menjamin penafsiran AI selalu benar. Cocokkan hasil dengan PDF asli.
- Materi yang disusun sengaja diperlakukan sebagai data tidak tepercaya dan tidak dapat mengubah instruksi aplikasi.

## Konfigurasi

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | Wajib untuk fitur AI; tetap di server. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Root API kompatibel Chat Completions. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Nama model yang tersedia pada endpoint tersebut. |
| `PORT` | `3000` | Port server lokal. |
| `HOST` | `127.0.0.1` | Alamat bind; default hanya lokal. |

## Lisensi

MIT. Lihat [`LICENSE`](./LICENSE).
