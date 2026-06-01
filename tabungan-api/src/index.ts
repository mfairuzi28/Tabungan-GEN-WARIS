/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import bcrypt from "bcryptjs"

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type']
}))

app.post('/login', async (c) => {
  const { username, password } = await c.req.json()

  const user = await c.env.DB.prepare(
    "SELECT * FROM users WHERE username = ?"
  ).bind(username).first()

  if (!user) {
    return c.json({ error: "User tidak ditemukan" }, 404)
  }

  console.log("USERNAME:", username)
  console.log("INPUT:", password)
  console.log("HASH DB:", user.password)

  const cocok = await bcrypt.compare(
  password,
  String(user.password)
 )

  console.log("COCOK:", cocok)

  if (!cocok) {
    return c.json({ error: "Password salah" }, 401)
  }

  return c.json({
    role: user.role,
    nama: user.nama,
    id: user.id
  })
})

app.put('/reset-password/:id', async (c) => {
  const id = c.req.param('id')
  const { password } = await c.req.json()

  const hash = await bcrypt.hash(password, 10)

  await c.env.DB.prepare(
    "UPDATE users SET password = ? WHERE id = ?"
  ).bind(hash, id).run()

  return c.json({
    message: "Password berhasil direset"
  })
})

app.get('/', (c) => {
  return c.text('API jalan')
})

/* ================= USERS ================= */

//GET users
app.get('/users', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      "SELECT * FROM users ORDER BY id DESC"
    ).all()

    return c.json(result.results)

  } catch (err) {
    console.log("ERROR:", err)

    return c.json({
      error: String(err)
    }, 500)
  }
})

//POST user
app.post('/users', async (c) => {
  const { nama, username, password, role } = await c.req.json()

  const hash = await bcrypt.hash(password, 10)

  await c.env.DB.prepare(
    "INSERT INTO users (nama, username, password, role) VALUES (?, ?, ?, ?)"
  ).bind(
    nama,
    username,
    hash,
    role || "user"
  ).run()

  return c.json({ message: "User berhasil ditambahkan" })
})

//PUT user
app.put('/users/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    const nama = body.nama

    await c.env.DB.prepare(
      "UPDATE users SET nama = ? WHERE id = ?"
    ).bind(nama, id).run()

    return c.json({ message: 'User diupdate' })

  } catch {
    return c.json({ error: "Server error" }, 500)
  }
})

//DELETE user
app.delete('/users/:id', async (c) => {
  const id = c.req.param('id')

  const user = await c.env.DB.prepare(
    "SELECT role FROM users WHERE id = ?"
  ).bind(id).first()

  if (user?.role === "admin") {
    return c.json({
      error: "Admin tidak boleh dihapus"
    }, 403)
  }

  await c.env.DB.prepare(
    "DELETE FROM users WHERE id = ?"
  ).bind(id).run()

  return c.json({ success: true })
})

/* ================= TRANSAKSI ================= */

// TABUNG
app.post('/tabung', async (c) => {
  try {
    const body = await c.req.json()
    const nama = body.nama
    const jumlah = Number(body.jumlah)
    const keterangan = body.keterangan || "-"

    if (!nama || !jumlah || jumlah <= 0) {
      return c.json({ error: "Data tidak valid" }, 400)
    }

    await c.env.DB.prepare(
      "INSERT INTO transaksi (nama, jumlah, tipe, keterangan, created_at) VALUES (?, ?, 'masuk', ?, datetime('now','+7 hours'))"
    ).bind(nama, jumlah, keterangan).run()

    return c.json({ message: "Berhasil menabung" })
  } catch (e) {
    return c.json({ error: "Server error" }, 500)
  }
})

// TARIK
app.post('/tarik', async (c) => {
  try {
    const body = await c.req.json()
    const nama = body.nama
    const jumlah = Number(body.jumlah)
    const keterangan = body.keterangan || "-"

    if (!nama || !jumlah || jumlah <= 0) {
      return c.json({ error: "Data tidak valid" }, 400)
    }

    const saldoData = await c.env.DB.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE 0 END),0) -
        COALESCE(SUM(CASE WHEN tipe='keluar' THEN jumlah ELSE 0 END),0)
        AS saldo
      FROM transaksi
      WHERE nama = ?
    `).bind(nama).first()

    const saldo = Number(saldoData?.saldo ?? 0)

    if (jumlah > saldo) {
      return c.json({ error: "Saldo tidak cukup" }, 400)
    }

    await c.env.DB.prepare(
      "INSERT INTO transaksi (nama, jumlah, tipe, keterangan, created_at) VALUES (?, ?, 'keluar', ?, datetime('now','+7 hours'))"
    ).bind(nama, jumlah, keterangan).run()

    return c.json({ message: "Berhasil tarik" })
  } catch (e) {
    return c.json({ error: "Server error" }, 500)
  }
})

// SALDO
app.get('/saldo/:nama', async (c) => {
  const nama = c.req.param('nama')

  const result = await c.env.DB.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN tipe='masuk' THEN jumlah ELSE 0 END),0) -
      COALESCE(SUM(CASE WHEN tipe='keluar' THEN jumlah ELSE 0 END),0)
      AS saldo
    FROM transaksi
    WHERE nama = ?
  `).bind(nama).first()

  return c.json({
    saldo: Number(result?.saldo) || 0
  })
})

// RIWAYAT
app.get('/riwayat/:nama', async (c) => {
  const nama = c.req.param('nama')

  const result = await c.env.DB.prepare(
    "SELECT * FROM transaksi WHERE nama = ? ORDER BY id DESC"
  ).bind(nama).all()

  return c.json(result.results)
})

//HAPUS
app.delete('/transaksi/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))

    await c.env.DB.prepare(
      "DELETE FROM transaksi WHERE id = ?"
    ).bind(id).run()

    return c.json({ message: 'Data berhasil dihapus' })

  } catch {
    return c.json({ error: "Server error" }, 500)
  }
})

//UPDATE
app.put('/transaksi/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    const jumlah = Number(body.jumlah)
    const keterangan = body.keterangan || "-"

    if (!jumlah || jumlah <= 0) {
      return c.json({ error: "Jumlah tidak valid" }, 400)
    }

    await c.env.DB.prepare(
      "UPDATE transaksi SET jumlah = ?, keterangan = ? WHERE id = ?"
    ).bind(jumlah, keterangan, id).run()

    return c.json({ message: "Berhasil update" })

  } catch {
    return c.json({ error: "Server error" }, 500)
  }
})

export default {
  fetch: app.fetch
}