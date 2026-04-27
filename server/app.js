// server/app.js
const path = require("path")
const fs = require("fs")
const os = require("os")
const sqlite3 = require("sqlite3").verbose()
require("dotenv").config()
const bcrypt = require("bcryptjs")

const APP_MODE = process.env.APP_MODE || "timelapse"
const IS_TIMELAPSE_ONLY = APP_MODE === "timelapse"

const { createTimelapseService } = require("./services/timelapseService")
const { startWebApiServer } = require("./webApiServer")

const {
  startPipeline,
  switchPipeline,
  stopPipeline,
  gstIsRunning
} = require("../core/pipeline")

const { playSpeakerClip } = require("./eventSystem")
const timelapseModule = require("../core/timelapse")

const runTimelapse =
  typeof timelapseModule === "function"
    ? timelapseModule
    : timelapseModule.runTimelapse

const sendAlert =
  typeof timelapseModule === "object" &&
    typeof timelapseModule.sendAlert === "function"
    ? timelapseModule.sendAlert
    : async () => { }

const safeRunTimelapse =
  typeof runTimelapse === "function"
    ? runTimelapse
    : async () => {
      throw new Error("runTimelapse is not a function. Check core/timelapse.js export.")
    }

let sequenceTimer = null
let sequenceRunning = false
let pageIndex = 0
let shuttingDown = false

const LOCAL_IP = getLocalIP()

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function getDbPath() {
  const envPath = String(process.env.DB_PATH || "").trim()
  if (envPath) {
    return path.resolve(envPath)
  }

  const fallbackDir = path.join(
    process.env.HOME || process.env.USERPROFILE || ".",
    ".config",
    "autoview"
  )

  return path.join(fallbackDir, "cameras.db")
}

const dbPath = getDbPath()
ensureDir(path.dirname(dbPath))

const db = new sqlite3.Database(dbPath)

console.log("APP_MODE =", APP_MODE)
console.log("DB PATH:", dbPath)

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  })
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
  })
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}

async function ensureColumn(table, name, definition) {
  const cols = await dbAll(`PRAGMA table_info(${table})`)
  const exists = cols.some(c => c.name === name)

  if (!exists) {
    await dbRun(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
    console.log(`Added column ${table}.${name}`)
  }
}

async function initDbPragmas() {
  await dbRun(`PRAGMA journal_mode = WAL`)
  await dbRun(`PRAGMA foreign_keys = ON`)
  await dbRun(`PRAGMA synchronous = NORMAL`)
  await dbRun(`PRAGMA busy_timeout = 5000`)
}

async function initDb() {
  await initDbPragmas()

  await dbRun(`
    CREATE TABLE IF NOT EXISTS cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      rtsp_url TEXT,
      enabled INTEGER DEFAULT 1,
      address TEXT,
      lat REAL,
      lng REAL,

      timelapse_enabled INTEGER DEFAULT 1,
      tl_interval INTEGER DEFAULT 600,
      tl_start_hour INTEGER DEFAULT 0,
      tl_end_hour INTEGER DEFAULT 24,
      tl_days TEXT DEFAULT '0,1,2,3,4,5,6',
      tl_last_run INTEGER DEFAULT 0,

      tl_folder_name TEXT DEFAULT '',
      tl_output_dir TEXT DEFAULT './data/timelapse',
      tl_notify_email TEXT DEFAULT '',
      tl_notify_after_sec INTEGER DEFAULT 1800,
      tl_last_file_at INTEGER DEFAULT 0
    )
  `)

  await dbRun(`
    CREATE TABLE IF NOT EXISTS speakers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      ip TEXT,
      rtp_ip TEXT,
      enabled INTEGER DEFAULT 1,
      address TEXT,
      lat REAL,
      lng REAL
    )
  `)

  await dbRun(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      level TEXT DEFAULT 'info',
      source TEXT DEFAULT 'manual',
      title TEXT NOT NULL,
      message TEXT DEFAULT '',
      lat REAL,
      lng REAL,
      camera_id INTEGER,
      speaker_id INTEGER,
      zone_id INTEGER,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      closed_at TEXT,
      operator TEXT
    )
  `)

  await dbRun(`
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      condition_json TEXT DEFAULT '{}',
      action_json TEXT DEFAULT '{}',
      enabled INTEGER DEFAULT 1
    )
  `)

  await dbRun(`
    CREATE TABLE IF NOT EXISTS clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      speaker_id INTEGER,
      clip_no INTEGER,
      text TEXT DEFAULT '',
      file_path TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1
    )
  `)

  await dbRun(`
    CREATE TABLE IF NOT EXISTS layouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layout_count INTEGER NOT NULL,
      slot_index INTEGER NOT NULL,
      camera_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(layout_count, slot_index)
    )
  `)

  await dbRun(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )
`)

  await dbRun(`
  CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )
`)

  await dbRun(`
  CREATE TABLE IF NOT EXISTS user_cameras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    camera_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(user_id, camera_id)
  )
`)

  await ensureColumn("cameras", "timelapse_enabled", "INTEGER DEFAULT 1")
  await ensureColumn("cameras", "tl_interval", "INTEGER DEFAULT 600")
  await ensureColumn("cameras", "tl_start_hour", "INTEGER DEFAULT 0")
  await ensureColumn("cameras", "tl_end_hour", "INTEGER DEFAULT 24")
  await ensureColumn("cameras", "tl_days", "TEXT DEFAULT '0,1,2,3,4,5,6'")
  await ensureColumn("cameras", "tl_last_run", "INTEGER DEFAULT 0")
  await ensureColumn("cameras", "tl_folder_name", "TEXT DEFAULT ''")
  await ensureColumn("cameras", "tl_output_dir", "TEXT DEFAULT './data/timelapse'")
  await ensureColumn("cameras", "tl_notify_email", "TEXT DEFAULT ''")
  await ensureColumn("cameras", "tl_notify_after_sec", "INTEGER DEFAULT 1800")
  await ensureColumn("cameras", "tl_last_file_at", "INTEGER DEFAULT 0")

  await ensureColumn("cameras", "people_count_enabled", "INTEGER DEFAULT 0")
  await ensureColumn("cameras", "people_count_type", "TEXT DEFAULT 'ai'")
  await ensureColumn("cameras", "stream_type", "TEXT DEFAULT 'axis'")
  await ensureColumn("cameras", "camera_ip", "TEXT DEFAULT ''")
  await ensureColumn("cameras", "username", "TEXT DEFAULT ''")
  await ensureColumn("cameras", "password", "TEXT DEFAULT ''")
  await ensureColumn("cameras", "port", "INTEGER DEFAULT 554")
  await ensureColumn("cameras", "manufacturer", "TEXT DEFAULT 'generic'")
  await ensureColumn("cameras", "model", "TEXT DEFAULT ''")
  await ensureColumn("cameras", "protocol", "TEXT DEFAULT 'rtsp'")
  await ensureColumn("cameras", "stream_path", "TEXT DEFAULT ''")
  await ensureColumn("cameras", "manual_rtsp_url", "TEXT DEFAULT ''")
  await ensureColumn("cameras", "snapshot_url", "TEXT DEFAULT ''")
  await ensureColumn("cameras", "notes", "TEXT")
  await ensureColumn("cameras", "last_status", "TEXT DEFAULT 'unknown'")
  await ensureColumn("cameras", "last_error", "TEXT DEFAULT ''")
  await ensureColumn("cameras", "last_seen_at", "TEXT DEFAULT ''")
  await ensureColumn("cameras", "created_at", "TEXT DEFAULT (datetime('now','localtime'))")
  await ensureColumn("cameras", "updated_at", "TEXT DEFAULT (datetime('now','localtime'))")
  await ensureColumn("cameras", "capture_mode", "TEXT DEFAULT 'snapshot'")
  await ensureColumn("cameras", "tl_is_running", "INTEGER DEFAULT 0")
  await ensureColumn("cameras", "tl_status", "TEXT DEFAULT 'stopped'")

  await ensureColumn("speakers", "username", "TEXT DEFAULT ''")
  await ensureColumn("speakers", "password", "TEXT DEFAULT ''")
  await ensureColumn("speakers", "model", "TEXT DEFAULT 'AXIS C1410'")
  await ensureColumn("speakers", "port", "INTEGER DEFAULT 80")
  await ensureColumn("speakers", "protocol", "TEXT DEFAULT 'http'")
  await ensureColumn("speakers", "notes", "TEXT DEFAULT ''")
  await ensureColumn("speakers", "file_path", "TEXT DEFAULT ''")

  await ensureIndexes()
}

async function ensureIndexes() {
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_cameras_enabled ON cameras(enabled)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens(user_id)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_user_cameras_user_id ON user_cameras(user_id)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_user_cameras_camera_id ON user_cameras(camera_id)`)
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`)
}

async function ensureInitialAdminUser() {
  const adminUsername = String(process.env.ADMIN_USERNAME || process.env.INIT_ADMIN_USERNAME || "admin").trim()
  const adminPassword = String(process.env.ADMIN_PASSWORD || process.env.INIT_ADMIN_PASSWORD || "").trim()

  if (process.env.NODE_ENV === "production") {
    if (!process.env.ADMIN_PASSWORD) {
      console.error("FATAL: ADMIN_PASSWORD is missing in production environment!")
      process.exit(1)
    }
  }

  if (!adminUsername || !adminPassword) {
    console.log("Initial admin bootstrap skipped (ADMIN_USERNAME / ADMIN_PASSWORD not set)")
    return
  }

  const existing = await dbGet(
    `SELECT id, username, role FROM users WHERE username = ?`,
    [adminUsername]
  )

  if (existing) {
    console.log(`Admin bootstrap skipped (user already exists): ${adminUsername}`)
    return
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10)

  await dbRun(
    `INSERT INTO users (username, password_hash, role, enabled)
     VALUES (?, ?, 'admin', 1)`,
    [adminUsername, passwordHash]
  )

  console.log(`Initial admin user created: ${adminUsername}`)
}

function getLocalIP() {
  const nets = os.networkInterfaces()

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address
      }
    }
  }

  return "127.0.0.1"
}

async function fetchEnabledCameras() {
  return await dbAll(`
    SELECT id, name, rtsp_url
    FROM cameras
    WHERE enabled = 1
      AND rtsp_url IS NOT NULL
      AND rtsp_url <> ''
    ORDER BY id
  `)
}

function stopSequenceInternal() {
  sequenceRunning = false
  pageIndex = 0

  if (sequenceTimer) {
    clearTimeout(sequenceTimer)
    sequenceTimer = null
  }
}

function makeItems(cams, count) {
  const items = cams.slice(0, count).map(c => ({
    url: c.rtsp_url,
    name: c.name
  }))

  while (items.length < count) {
    items.push(null)
  }

  return items
}

async function getSavedLayoutSlots(count) {
  const rows = await dbAll(
    `SELECT slot_index, camera_id
     FROM layouts
     WHERE layout_count = ?
     ORDER BY slot_index ASC`,
    [count]
  )

  const slots = Array.from({ length: count }, () => null)

  for (const row of rows) {
    if (row.slot_index >= 0 && row.slot_index < count) {
      slots[row.slot_index] = row.camera_id ?? null
    }
  }

  return slots
}

async function getLayoutItems(count) {
  const slotCameraIds = await getSavedLayoutSlots(count)
  const items = []

  for (const cameraId of slotCameraIds) {
    if (!cameraId) {
      items.push(null)
      continue
    }

    const cam = await dbGet(
      `SELECT id, name, rtsp_url, enabled
       FROM cameras
       WHERE id = ?`,
      [cameraId]
    )

    if (!cam || Number(cam.enabled) !== 1 || !cam.rtsp_url) {
      items.push(null)
      continue
    }

    items.push({
      url: cam.rtsp_url,
      name: cam.name
    })
  }

  while (items.length < count) {
    items.push(null)
  }

  return items
}

async function runLayout(count, seconds = 10) {
  if (IS_TIMELAPSE_ONLY) {
    throw new Error("Layout feature disabled in timelapse mode")
  }

  stopSequenceInternal()

  const savedItems = await getLayoutItems(count)
  const hasAnySavedCamera = savedItems.some(item => item && item.url)

  if (hasAnySavedCamera) {
    if (gstIsRunning()) switchPipeline(savedItems, count)
    else startPipeline(savedItems, count)
    return
  }

  const cams = await fetchEnabledCameras()

  if (cams.length <= count) {
    const items = makeItems(cams, count)

    if (gstIsRunning()) switchPipeline(items, count)
    else startPipeline(items, count)

    return
  }

  sequenceRunning = true
  pageIndex = 0

  const run = () => {
    if (!sequenceRunning) return

    const start = pageIndex * count
    let page = cams.slice(start, start + count)

    if (page.length === 0) {
      pageIndex = 0
      page = cams.slice(0, count)
    }

    const items = makeItems(page, count)

    if (gstIsRunning()) switchPipeline(items, count)
    else startPipeline(items, count)

    pageIndex++

    if (pageIndex * count >= cams.length) {
      pageIndex = 0
    }

    sequenceTimer = setTimeout(run, seconds * 1000)
  }

  run()
}

async function initPeopleCount() {
  if (IS_TIMELAPSE_ONLY) {
    console.log("People Count disabled in timelapse mode")
    return
  }

  try {
    const cams = await dbAll(`
      SELECT *
      FROM cameras
      ORDER BY id
    `)

    if (typeof startYoloCount === "function") {
      startYoloCount(cams)
    } else {
      console.warn("startYoloCount is not a function")
    }
  } catch (err) {
    console.error("initPeopleCount error:", err)
  }
}

async function resetStaleTimelapseRuntimeState() {
  await dbRun(`
    UPDATE cameras
    SET
      tl_is_running = 0,
      tl_status = 'stopped',
      last_error = CASE
        WHEN tl_status IN ('running', 'capturing') THEN ''
        ELSE last_error
      END,
      updated_at = datetime('now','localtime')
    WHERE tl_is_running <> 0
       OR tl_status IN ('running', 'capturing')
  `)
}

async function cleanupExpiredAuthTokens() {
  await dbRun(`
    DELETE FROM auth_tokens
    WHERE datetime(expires_at) <= datetime('now')
  `)
}

async function main() {
  try {
    await initDb()
    await ensureInitialAdminUser()
    await cleanupExpiredAuthTokens()

    const timelapseService = createTimelapseService({
      dbAll,
      dbRun,
      runTimelapse: safeRunTimelapse,
      sendAlert
    })

    startWebApiServer({
      db,
      dbAll,
      dbGet,
      dbRun,
      runLayout,
      stopPipeline,
      startPipeline,
      playSpeakerClip: IS_TIMELAPSE_ONLY ? null : playSpeakerClip,
      LOCAL_IP,
      timelapseService,
      appMode: APP_MODE
    })

    await resetStaleTimelapseRuntimeState()

    if (!IS_TIMELAPSE_ONLY) {
      await initPeopleCount()
    } else {
      console.log("Running in timelapse-only mode")
    }

    const autoStartResult = timelapseService.start()
    console.log("Timelapse auto-start:", autoStartResult)

    const port = Number(process.env.PORT || 8080)
    console.log(`Web UI: http://${LOCAL_IP}:${port}`)
  } catch (err) {
    console.error("App startup error:", err)
    process.exit(1)
  }
}

main()

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true

  console.log(`Received ${signal}, shutting down...`)

  try {
    stopSequenceInternal()
    stopPipeline()
  } catch (err) {
    console.error("Pipeline shutdown error:", err)
  }

  try {
    await new Promise((resolve, reject) => {
      db.close(err => (err ? reject(err) : resolve()))
    })
  } catch (err) {
    console.error("DB shutdown error:", err)
  } finally {
    process.exit(0)
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT")
})

process.on("SIGTERM", () => {
  shutdown("SIGTERM")
})