// server/main.js
const { app, BrowserWindow, ipcMain, screen } = require("electron")
const path = require("path")
const fs = require("fs")
const os = require("os")
const sqlite3 = require("sqlite3").verbose()
require("dotenv").config()

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

const { startYoloCount, getCounts } = require("../core/peopleCount")

const {
  createEvent,
  closeEvent,
  listEvents,
  getOpenEvents,
  saveRule,
  updateRule,
  listRules,
  saveClip,
  updateClip,
  listClips,
  playSpeakerClip
} = require("./eventSystem")

app.disableHardwareAcceleration()
app.commandLine.appendSwitch("disable-gpu")

const publicDir = path.join(__dirname, "../uiapp/dist")

const timelapseModule = require("../core/timelapse")

const runTimelapse =
  typeof timelapseModule === "function"
    ? timelapseModule
    : timelapseModule.runTimelapse

const sendAlert =
  typeof timelapseModule === "object" &&
  typeof timelapseModule.sendAlert === "function"
    ? timelapseModule.sendAlert
    : async () => {}

const safeRunTimelapse =
  typeof runTimelapse === "function"
    ? runTimelapse
    : async () => {
        throw new Error("runTimelapse is not a function. Check core/timelapse.js export.")
      }

let win = null
let sequenceTimer = null
let sequenceRunning = false
let pageIndex = 0
let tempLocation = null

const LOCAL_IP = getLocalIP()
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || ""

// ======================
// DB
// ======================

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
    ".config/autoview"
  )
  return path.join(fallbackDir, "cameras.db")
}

const dbPath = getDbPath()
ensureDir(path.dirname(dbPath))

const db = new sqlite3.Database(dbPath)

console.log("APP_MODE =", APP_MODE)
console.log("Web API:", `http://${LOCAL_IP}:8080`)
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

async function initDb() {
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
}

// ======================
// Utils
// ======================

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

function exists(filePath) {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

// ======================
// Window
// ======================

function getSafeBounds(targetWidth = 1600, targetHeight = 900) {
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const area = display.workArea

  const width = Math.min(targetWidth, Math.max(900, area.width - 40))
  const height = Math.min(targetHeight, Math.max(700, area.height - 40))

  const x = area.x + Math.max(0, Math.floor((area.width - width) / 2))
  const y = area.y + Math.max(0, Math.floor((area.height - height) / 2))

  return { x, y, width, height }
}

function createWindow() {
  const bounds = getSafeBounds(1600, 900)

  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 1000,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: "#111111",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once("ready-to-show", () => {
    if (win) win.show()
  })

  win.on("closed", () => {
    win = null
  })

  const indexPath = path.join(publicDir, "index.html")

  if (!exists(indexPath)) {
    console.error("Frontend build not found:", indexPath)
    win.loadURL(
      `data:text/html,
      <html>
        <body style="font-family:sans-serif;padding:24px">
          <h2>uiapp/dist/index.html not found</h2>
          <p>Run:</p>
          <pre>cd uiapp && npm install && npm run build</pre>
        </body>
      </html>`
    )
    return
  }

  win.loadFile(indexPath)
}

// ======================
// Cameras / Layout helpers
// ======================

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

  while (items.length < count) items.push(null)
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

async function getSavedLayoutSlots(count) {
  const rows = await dbAll(
    `SELECT slot_index, camera_id
     FROM layouts
     WHERE layout_count = ?
     ORDER BY slot_index ASC`,
    [count]
  )

  const slots = Array.from({ length: count }, (_, i) => null)

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

// ======================
// People Count
// ======================

ipcMain.handle("get-people", async () => {
  if (IS_TIMELAPSE_ONLY) {
    return {}
  }

  try {
    return getCounts()
  } catch (err) {
    console.error("get-people error:", err)
    return {}
  }
})

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

    console.log("📷 CAMS =", cams)

    if (typeof startYoloCount === "function") {
      startYoloCount(cams)
    } else {
      console.warn("startYoloCount is not a function")
    }
  } catch (err) {
    console.error("initPeopleCount error:", err)
  }
}

// ======================
// IPC - Layout / Stream
// ======================

ipcMain.handle("start-layout", async (e, payload = {}) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Layout feature disabled in timelapse mode" }
  }

  try {
    const count = Number(payload.count || 1)
    const seconds = Number(payload.seconds || 10)

    await runLayout(count, seconds)
    return { ok: true }
  } catch (err) {
    console.error("start-layout error:", err)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle("save-layout", async (e, payload = {}) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Layout feature disabled in timelapse mode" }
  }

  try {
    const count = Number(payload.count || 1)
    const slots = Array.isArray(payload.slots) ? payload.slots : []

    await dbRun(`DELETE FROM layouts WHERE layout_count = ?`, [count])

    for (const slot of slots) {
      const slotIndex = Number(slot.index)
      const cameraId =
        slot.cameraId == null || slot.cameraId === ""
          ? null
          : Number(slot.cameraId)

      await dbRun(
        `INSERT INTO layouts (
          layout_count, slot_index, camera_id, updated_at
        ) VALUES (?, ?, ?, datetime('now','localtime'))`,
        [count, slotIndex, cameraId]
      )
    }

    return { ok: true }
  } catch (err) {
    console.error("save-layout error:", err)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle("stop-sequence", async () => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Layout feature disabled in timelapse mode" }
  }

  stopSequenceInternal()
  return { ok: true }
})

ipcMain.handle("stop-stream", async () => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Layout feature disabled in timelapse mode" }
  }

  stopSequenceInternal()
  stopPipeline()
  return { ok: true }
})

// ======================
// IPC - Map
// ======================

ipcMain.handle("get-map-cameras", async () => {
  if (IS_TIMELAPSE_ONLY) return []

  return await dbAll(`
    SELECT id, name, address, lat, lng
    FROM cameras
    WHERE lat IS NOT NULL
      AND lng IS NOT NULL
    ORDER BY id
  `)
})

ipcMain.handle("get-map-speakers", async () => {
  if (IS_TIMELAPSE_ONLY) return []

  return await dbAll(`
    SELECT id, name, address, lat, lng
    FROM speakers
    WHERE lat IS NOT NULL
      AND lng IS NOT NULL
    ORDER BY id
  `)
})

ipcMain.handle("set-temp-location", async (e, data) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Map feature disabled in timelapse mode" }
  }

  tempLocation = data || null
  return { ok: true }
})

ipcMain.handle("get-temp-location", async () => {
  if (IS_TIMELAPSE_ONLY) return null
  return tempLocation || null
})

ipcMain.handle("clear-temp-location", async () => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Map feature disabled in timelapse mode" }
  }

  tempLocation = null
  return { ok: true }
})

// ======================
// IPC - Camera CRUD
// ======================

ipcMain.handle("get-cameras", async () => {
  return await dbAll(`SELECT * FROM cameras ORDER BY id`)
})

ipcMain.handle("get-camera", async (e, id) => {
  return await dbGet(`SELECT * FROM cameras WHERE id = ?`, [id])
})

ipcMain.handle("delete-camera", async (e, id) => {
  await dbRun(`DELETE FROM cameras WHERE id = ?`, [id])
  return { ok: true }
})

ipcMain.handle("save-camera", async (e, cam = {}) => {
  const result = await dbRun(
    `INSERT INTO cameras (
      name,
      rtsp_url,
      enabled,
      address,
      lat,
      lng,
      people_count_enabled,
      people_count_type,
      stream_type,
      camera_ip,
      username,
      password,
      port,
      manufacturer,
      model,
      protocol,
      stream_path,
      manual_rtsp_url,
      snapshot_url,
      notes,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
    [
      cam.name || "",
      cam.rtsp_url || "",
      typeof cam.enabled === "number" ? cam.enabled : 1,
      cam.address || "",
      cam.lat ?? null,
      cam.lng ?? null,
      cam.people_count_enabled ?? 0,
      cam.people_count_type ?? "ai",
      cam.stream_type || "axis",
      cam.camera_ip || "",
      cam.username || "",
      cam.password || "",
      cam.port ?? 554,
      cam.manufacturer || "generic",
      cam.model || "",
      cam.protocol || "rtsp",
      cam.stream_path || "",
      cam.manual_rtsp_url || "",
      cam.snapshot_url || "",
      cam.notes || ""
    ]
  )

  return { id: result.lastID, ok: true }
})

ipcMain.handle("update-camera", async (e, cam = {}) => {
  await dbRun(
    `UPDATE cameras
     SET name = ?,
         rtsp_url = ?,
         enabled = ?,
         address = ?,
         lat = ?,
         lng = ?,
         people_count_enabled = ?,
         people_count_type = ?,
         stream_type = ?,
         camera_ip = ?,
         username = ?,
         password = ?,
         port = ?,
         manufacturer = ?,
         model = ?,
         protocol = ?,
         stream_path = ?,
         manual_rtsp_url = ?,
         snapshot_url = ?,
         notes = ?,
         updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [
      cam.name || "",
      cam.rtsp_url || "",
      typeof cam.enabled === "number" ? cam.enabled : 1,
      cam.address || "",
      cam.lat ?? null,
      cam.lng ?? null,
      cam.people_count_enabled ?? 0,
      cam.people_count_type ?? "ai",
      cam.stream_type || "axis",
      cam.camera_ip || "",
      cam.username || "",
      cam.password || "",
      cam.port ?? 554,
      cam.manufacturer || "generic",
      cam.model || "",
      cam.protocol || "rtsp",
      cam.stream_path || "",
      cam.manual_rtsp_url || "",
      cam.snapshot_url || "",
      cam.notes || "",
      cam.id
    ]
  )

  return { ok: true }
})

ipcMain.handle("set-camera-enabled", async (e, data = {}) => {
  await dbRun(
    `UPDATE cameras
     SET enabled = ?, updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [data.enabled, data.id]
  )

  return { ok: true }
})

// ======================
// IPC - Live Test
// ======================

async function startSingleCameraPipeline(url, name = "TEST") {
  const items = [{ url, name }]

  if (gstIsRunning()) {
    switchPipeline(items, 1)
  } else {
    startPipeline(items, 1)
  }
}

ipcMain.handle("start-live-test", async (e, payload = {}) => {
  try {
    const url = payload.url
    const name = payload.name || "TEST"

    if (!url) {
      return { ok: false, error: "Invalid RTSP URL" }
    }

    stopSequenceInternal()
    await startSingleCameraPipeline(url, name)

    return { ok: true }
  } catch (err) {
    console.error("start-live-test error:", err)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle("stop-live-test", async () => {
  stopSequenceInternal()
  stopPipeline()
  return { ok: true }
})

// Legacy compatibility
ipcMain.handle("startLiveTest", async (e, opt = {}) => {
  try {
    if (!opt.url) {
      return { ok: false, error: "Missing URL" }
    }

    stopSequenceInternal()
    await startSingleCameraPipeline(opt.url, opt.name || "TEST")

    return { ok: true }
  } catch (err) {
    console.error("startLiveTest error:", err)
    return { ok: false, error: err.message }
  }
})

// ======================
// IPC - Speakers
// ======================

ipcMain.handle("get-speakers", async () => {
  if (IS_TIMELAPSE_ONLY) return []
  return await dbAll(`SELECT * FROM speakers ORDER BY id`)
})

ipcMain.handle("save-speaker", async (e, data = {}) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Speaker feature disabled in timelapse mode" }
  }

  const r = await dbRun(
    `INSERT INTO speakers (name, ip, rtp_ip, enabled, address, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name || "",
      data.ip || "",
      data.rtp_ip || "",
      typeof data.enabled === "number" ? data.enabled : 1,
      data.address || "",
      data.lat ?? null,
      data.lng ?? null
    ]
  )

  return { id: r.lastID, ok: true }
})

ipcMain.handle("update-speaker", async (e, data = {}) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Speaker feature disabled in timelapse mode" }
  }

  const r = await dbRun(
    `UPDATE speakers
     SET name = ?,
         ip = ?,
         rtp_ip = ?,
         address = ?,
         lat = ?,
         lng = ?,
         enabled = ?
     WHERE id = ?`,
    [
      data.name || "",
      data.ip || "",
      data.rtp_ip || "",
      data.address || "",
      data.lat ?? null,
      data.lng ?? null,
      typeof data.enabled === "number" ? data.enabled : 1,
      data.id
    ]
  )

  return { ok: true, changes: r.changes }
})

ipcMain.handle("speaker-test", async (e, data = {}) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Speaker feature disabled in timelapse mode" }
  }

  try {
    const clipPath = data.file_path || data.clip || "logo.mp3"
    const ip = data.ip || data.rtp_ip
    const result = await playSpeakerClip(ip, clipPath, 3000)
    return result
  } catch (err) {
    console.error("speaker-test error:", err)
    return { ok: false, error: err.message }
  }
})

// ======================
// IPC - Geocoding
// ======================

ipcMain.handle("geocode-address", async (e, address) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Geocode feature disabled in timelapse mode" }
  }

  try {
    if (!MAPBOX_TOKEN) {
      return { ok: false, error: "MAPBOX_TOKEN is missing" }
    }

    const url =
      "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
      encodeURIComponent(address) +
      `.json?limit=1&language=ja&access_token=${MAPBOX_TOKEN}`

    const res = await fetch(url)
    const data = await res.json()

    if (data.features && data.features.length) {
      const c = data.features[0].center
      return { ok: true, lat: c[1], lng: c[0] }
    }

    return { ok: false }
  } catch (err) {
    console.error("geocode-address error:", err)
    return { ok: false, error: err.message }
  }
})

// ======================
// IPC - Events / Rules / Clips
// ======================

ipcMain.handle("get-events", async (e, payload = {}) => {
  if (IS_TIMELAPSE_ONLY) return []

  try {
    const limit = Number(payload.limit || 100)
    return await listEvents(db, limit)
  } catch (err) {
    console.error("get-events error:", err)
    return []
  }
})

ipcMain.handle("get-open-events", async () => {
  if (IS_TIMELAPSE_ONLY) return []

  try {
    return await getOpenEvents(db)
  } catch (err) {
    console.error("get-open-events error:", err)
    return []
  }
})

ipcMain.handle("create-event", async (e, payload) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Event feature disabled in timelapse mode" }
  }

  try {
    return await createEvent(db, payload)
  } catch (err) {
    console.error("create-event error:", err)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle("close-event", async (e, payload = {}) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Event feature disabled in timelapse mode" }
  }

  try {
    return await closeEvent(db, payload.id, payload.operator || "operator")
  } catch (err) {
    console.error("close-event error:", err)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle("get-rules", async () => {
  if (IS_TIMELAPSE_ONLY) return []

  try {
    return await listRules(db)
  } catch (err) {
    console.error("get-rules error:", err)
    return []
  }
})

ipcMain.handle("save-rule", async (e, payload) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Rule feature disabled in timelapse mode" }
  }

  try {
    return await saveRule(db, payload)
  } catch (err) {
    console.error("save-rule error:", err)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle("update-rule", async (e, payload) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Rule feature disabled in timelapse mode" }
  }

  try {
    return await updateRule(db, payload)
  } catch (err) {
    console.error("update-rule error:", err)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle("get-clips", async () => {
  if (IS_TIMELAPSE_ONLY) return []

  try {
    return await listClips(db)
  } catch (err) {
    console.error("get-clips error:", err)
    return []
  }
})

ipcMain.handle("save-clip", async (e, payload) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Clip feature disabled in timelapse mode" }
  }

  try {
    return await saveClip(db, payload)
  } catch (err) {
    console.error("save-clip error:", err)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle("update-clip", async (e, payload) => {
  if (IS_TIMELAPSE_ONLY) {
    return { ok: false, error: "Clip feature disabled in timelapse mode" }
  }

  try {
    return await updateClip(db, payload)
  } catch (err) {
    console.error("update-clip error:", err)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle("get-layout", async (e, count = 1) => {
  if (IS_TIMELAPSE_ONLY) {
    return {
      ok: false,
      error: "Layout feature disabled in timelapse mode",
      count: Number(count || 1),
      slots: []
    }
  }

  try {
    const layoutCount = Number(count || 1)
    const slots = await getSavedLayoutSlots(layoutCount)

    return {
      ok: true,
      count: layoutCount,
      slots
    }
  } catch (err) {
    console.error("get-layout error:", err)
    return {
      ok: false,
      error: err.message,
      count: Number(count || 1),
      slots: []
    }
  }
})

// ======================
// App lifecycle
// ======================

app.whenReady().then(async () => {
  try {
    await initDb()
    createWindow()

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

    await timelapseService.stop()

    if (!IS_TIMELAPSE_ONLY) {
      await initPeopleCount()
    } else {
      console.log("Running in timelapse-only mode")
    }

    console.log(`Web UI: http://${LOCAL_IP}:8080`)
  } catch (err) {
    console.error("App startup error:", err)
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on("before-quit", () => {
  stopSequenceInternal()
  stopPipeline()
})

app.on("quit", () => {
  try {
    db.close()
  } catch (err) {
    console.error("DB close error:", err)
  }
})