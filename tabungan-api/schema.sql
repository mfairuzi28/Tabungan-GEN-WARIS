CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  username TEXT UNIQUE,
  password TEXT,
  role TEXT
);

CREATE TABLE transaksi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT,
  jumlah INTEGER,
  keterangan TEXT,
  tipe TEXT,
  created_at TEXT
);