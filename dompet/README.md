# DompetKu — Aplikasi Keuangan Pribadi

Aplikasi web pencatat keuangan pribadi yang berjalan **100% di browser** tanpa server.

## 🚀 Cara Menjalankan

### Desktop
1. Unduh seluruh folder `dompetku/` ke komputer.
2. Klik dua kali `index.html` — aplikasi langsung terbuka di browser.
3. Atau jalankan server lokal sederhana:
```bash
   python3 -m http.server 8000
```
   Lalu buka `http://localhost:8000`

### Android (Chrome)
1. Pindahkan folder `dompetku/` ke penyimpanan HP.
2. Buka Chrome → ketik alamat file atau gunakan aplikasi file manager untuk membuka `index.html`.
3. **Agar dapat diinstal di layar utama**:
   - Lebih baik dijalankan melalui server lokal (misalnya aplikasi "HTTP Server" dari Play Store).
   - Buka alamat di Chrome → menu (⋮) → "Add to Home screen".
4. Setelah pertama kali dibuka, aplikasi dapat digunakan **offline** berkat Service Worker.

> ⚠️ Jika dibuka langsung dari `file://`, beberapa browser membatasi IndexedDB. Disarankan menggunakan server lokal (bahkan yang sederhana).

## 💾 Menyimpan & Mengekspor Data

Buka halaman **Pengaturan** → **Backup & Ekspor Data**:

| Tombol | Fungsi | Format |
|---|---|---|
| 📦 Backup Lengkap | Semua data (transaksi, tabungan, utang, dll.) | JSON |
| 📄 Transaksi | Hanya transaksi | CSV (bisa dibuka Excel) |
| 📊 Transaksi | Hanya transaksi | Excel (.xls) |
| 🎯 Tabungan | Target & riwayat setoran | JSON |
| 💳 Utang | Data utang & pembayaran | JSON |
| 🖨️ Laporan | Cetak laporan periode aktif | PDF (via dialog cetak) |

File akan **diunduh melalui browser** — Anda dapat memilih lokasi penyimpanan melalui dialog sistem.

## 🔄 Memulihkan Data

1. Buka **Pengaturan** → **Impor & Pemulihan**.
2. Pilih file backup JSON.
3. Pilih mode:
   - **Ganti Data**: hapus semua data lama, pakai data dari file.
   - **Gabungkan**: tambahkan data baru tanpa menimpa ID yang sudah ada.
4. Konfirmasi ringkasan isi file sebelum diproses.

## ✅ Fitur yang Berfungsi

- ✅ Dashboard dengan ringkasan, grafik, tagihan jatuh tempo, progres tabungan
- ✅ Pencatat transaksi (pemasukan, pengeluaran, transfer, pembayaran utang, setoran/tarikan tabungan)
- ✅ Filter, pencarian, pengurutan transaksi
- ✅ Lampiran gambar (disimpan sebagai base64 di IndexedDB)
- ✅ Multi akun dengan perhitungan saldo otomatis
- ✅ Transfer antar akun (tidak dihitung sebagai pemasukan/pengeluaran)
- ✅ Target tabungan dengan progres, estimasi setoran bulanan, status
- ✅ Utang & Paylater dengan pelunasan, jatuh tempo, peringatan
- ✅ Anggaran bulanan per kategori dengan peringatan 80% & 100%
- ✅ Kalender keuangan dengan agenda
- ✅ Laporan dengan berbagai periode dan grafik
- ✅ Ekspor JSON, CSV, Excel (SpreadsheetML), PDF (print)
- ✅ Impor & pemulihan data (ganti / gabungkan)
- ✅ Dark mode (terang / gelap / otomatis)
- ✅ PWA — dapat dipasang di HP dan digunakan offline
- ✅ Format Rupiah Indonesia & tanggal Indonesia
- ✅ Validasi input & konfirmasi penghapusan
- ✅ Responsif (desktop sidebar, mobile bottom nav)
- ✅ XSS protection (escape HTML pada input pengguna)

## ⚠️ Keterbatasan

1. **Penyimpanan lokal**: Data tersimpan di IndexedDB browser. Jika data browser dibersihkan, aplikasi diinstal ulang, atau perangkat rusak, data dapat hilang. **Rutin lakukan backup JSON**.
2. **Excel**: File `.xls` yang dihasilkan adalah format SpreadsheetML 2003. Dapat dibuka Excel, LibreOffice, Google Sheets. Bukan format `.xlsx` modern (membutuhkan library eksternal).
3. **PDF**: Menggunakan dialog cetak browser. Pengguna memilih "Save as PDF" dari dialog cetak.
4. **Notifikasi**: Tidak ada notifikasi push. Pengingat hanya visual di dalam aplikasi (tagihan jatuh tempo di dashboard & kalender).
5. **Lampiran**: Disimpan sebagai base64 di IndexedDB. Ukuran database browser biasanya 10-50% dari storage perangkat. Hindari lampiran berlebihan.
6. **Offline PWA**: Berfungsi setelah pertama kali dimuat. Jika browser tidak mendukung Service Worker (mode privat tertentu), fitur offline tidak aktif.
7. **Mata uang**: Hanya IDR dan USD. Format angka mengikuti `toLocaleString('id-ID')`.
8. **Perhitungan bunga utang**: Sederhana (flat). Tidak ada simulasi anuitas atau bunga efektif.
9. **Transaksi berulang**: Belum otomatis — pengguna dapat membuat jadwal di Kalender sebagai pengingat.

## 🔒 Privasi

- Tidak ada data yang dikirim ke server eksternal.
- Tidak ada tracking, analitik, atau iklan.
- Seluruh data tersimpan lokal di perangkat Anda.

## 🛠️ Struktur Kode

- `index.html` — Shell HTML dengan semua halaman sebagai section
- `style.css` — Styling lengkap + dark mode + responsif
- `script.js` — Logika aplikasi (DB, State, Utils, Router, Pages, Export/Import)
- `manifest.json` — PWA manifest
- `sw.js` — Service Worker untuk caching & offline

Seluruh kode modular dalam satu file `script.js` dengan pembagian jelas:
- `DB` — Wrapper IndexedDB
- `State` — State global aplikasi
- `U` — Utility functions
- `Calc` — Perhitungan keuangan
- `Chart` — SVG chart (bar, line, donut)
- `Pages.*` — Tiap halaman sebagai modul
- `Exporter` / `Importer` — Backup & pemulihan

---

**Versi**: 1.0
**Tanggal**: 9 Oktober 2026