// server/webApiServer.js
const http = require("http")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const bcrypt = require("bcryptjs")
const { spawn } = require("child_process")

const { getCameraFolder } = require("../core/timelapse.js")
const { buildVideoFromRange, getImageTimestamp } = require("../core/timelapseVideo")
const state = require("../core/state")
const { listEvents, getOpenEvents } = require("./eventSystem")
const archiver = require("archiver")

function startWebApiServer(ctx) {
  const {
    db,
    dbAll,
    dbGet,
    dbRun,
    runLayout,
    stopPipeline,
    startPipeline,
    playSpeakerClip,
    LOCAL_IP,
    timelapseService,
    appMode = "timelapse"
  } = ctx

  const IS_TIMELAPSE_ONLY = appMode === "timelapse"
  const PORT = Number(process.env.PORT || 8080)
  const dist = path.join(__dirname, "../uiapp/dist")
  const exportsDir = path.join(__dirname, "..", "data", "exports")

  function writeJson(res, statusCode, payload) {
    if (!res.headersSent) {
      res.writeHead(statusCode, {
        "Content-Type": "application/json"
      })
    }
    res.end(JSON.stringify(payload))
  }

  function writeText(res, statusCode, text, contentType = "text/plain") {
    if (!res.headersSent) {
      res.writeHead(statusCode, {
        "Content-Type": contentType
      })
    }
    res.end(text)
  }

  function featureDisabled(res, name) {
    return writeJson(res, 404, {
      ok: false,
      error: `${name} disabled in timelapse mode`
    })
  }

  function ensureLogsArray() {
    if (!Array.isArray(state.logs)) {
      state.logs = []
    }
  }

  function addLog(type, msg) {
    ensureLogsArray()

    state.logs.unshift({
      time: Date.now(),
      type,
      msg
    })

    if (state.logs.length > 100) {
      state.logs.pop()
    }
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = ""

      req.on("data", chunk => {
        body += chunk
        if (body.length > 1024 * 1024) {
          reject(new Error("Request body too large"))
          req.destroy()
        }
      })

      req.on("end", () => resolve(body))
      req.on("error", reject)
    })
  }

  async function readJsonBody(req) {
    const body = await readBody(req)
    return body ? JSON.parse(body) : {}
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  function safeNullableNumber(value) {
    if (value === null || value === undefined || value === "") return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function safeBoolInt(value, fallback = 0) {
    if (typeof value === "number") return value ? 1 : 0
    if (typeof value === "boolean") return value ? 1 : 0
    if (value === "1" || value === 1) return 1
    if (value === "0" || value === 0) return 0
    return fallback
  }

  function isInsideDir(baseDir, targetPath) {
    const relative = path.relative(path.resolve(baseDir), path.resolve(targetPath))
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
  }

  function guessContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase()

    const types = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".json": "application/json",
      ".ico": "image/x-icon",
      ".mp4": "video/mp4",
      ".zip": "application/zip"
    }

    return types[ext] || "text/plain"
  }

  function normalizeCameraPayload(data = {}) {
    return {
      id: safeNumber(data.id, 0),
      name: data.name || "",
      rtsp_url: data.rtsp_url || "",
      enabled: safeBoolInt(data.enabled, 1),
      address: data.address || "",
      lat: safeNullableNumber(data.lat),
      lng: safeNullableNumber(data.lng),

      people_count_enabled: safeBoolInt(data.people_count_enabled, 0),
      people_count_type: data.people_count_type || "ai",

      stream_type: data.stream_type || "axis",
      camera_ip: data.camera_ip || "",
      username: data.username || "",
      password: data.password || "",
      port: safeNumber(data.port, 554),
      manufacturer: data.manufacturer || "generic",
      model: data.model || "",
      protocol: data.protocol || "rtsp",
      stream_path: data.stream_path || "",
      manual_rtsp_url: data.manual_rtsp_url || "",
      snapshot_url: data.snapshot_url || "",
      capture_mode: data.capture_mode || "snapshot",
      notes: data.notes || "",

      timelapse_enabled: safeBoolInt(data.timelapse_enabled, 0),
      tl_interval:
        data.tl_interval === null || data.tl_interval === undefined || data.tl_interval === ""
          ? 0
          : safeNumber(data.tl_interval, 0),
      tl_start_hour:
        data.tl_start_hour === null || data.tl_start_hour === undefined || data.tl_start_hour === ""
          ? null
          : safeNumber(data.tl_start_hour, 0),
      tl_end_hour:
        data.tl_end_hour === null || data.tl_end_hour === undefined || data.tl_end_hour === ""
          ? null
          : safeNumber(data.tl_end_hour, 24),
      tl_days:
        data.tl_days === null || data.tl_days === undefined
          ? ""
          : String(data.tl_days),
      tl_folder_name: data.tl_folder_name || "",
      tl_output_dir: data.tl_output_dir || "./data/timelapse",
      tl_notify_email: data.tl_notify_email || "",
      tl_notify_after_sec: safeNumber(data.tl_notify_after_sec, 1800),
      tl_status:
        data.tl_status == null || data.tl_status === ""
          ? "stopped"
          : String(data.tl_status),
      tl_is_running:
        data.tl_is_running === null || data.tl_is_running === undefined || data.tl_is_running === ""
          ? 0
          : safeNumber(data.tl_is_running, 0)
    }
  }

  function normalizeSpeakerEventPayload(data = {}) {
    return {
      id: safeNumber(data.id, 0),
      name: String(data.name || "").trim(),
      event_type:
        String(data.event_type || "sound").trim() === "announcement"
          ? "announcement"
          : "sound",
      speaker_ids:
        data.speaker_ids == null
          ? ""
          : Array.isArray(data.speaker_ids)
            ? data.speaker_ids.join(",")
            : String(data.speaker_ids),
      camera_ids:
        data.camera_ids == null
          ? ""
          : Array.isArray(data.camera_ids)
            ? data.camera_ids.join(",")
            : String(data.camera_ids),
      audio_file: String(data.audio_file || "").trim(),
      schedule_enabled: safeBoolInt(data.schedule_enabled, 0),
      schedule_date: String(data.schedule_date || "").trim(),
      schedule_time: String(data.schedule_time || "").trim(),
      loop_enabled: safeBoolInt(data.loop_enabled, 0),
      status: String(data.status || "stopped").trim() || "stopped",
      notes: String(data.notes || "").trim()
    }
  }

  function isImageFile(name) {
    return /\.(jpg|jpeg|png|webp)$/i.test(String(name || ""))
  }

  function fileTimeFromName(name) {
    const base = String(name || "").toLowerCase()

    let m = base.match(/(\d{4})-(\d{2})-(\d{2})[_ ](\d{2})-(\d{2})-(\d{2})/)
    if (m) {
      const [, y, mo, d, h, mi, s] = m
      return new Date(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(h),
        Number(mi),
        Number(s)
      ).getTime()
    }

    m = base.match(/(\d{4})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})/)
    if (m) {
      const [, y, mo, d, h, mi, s] = m
      return new Date(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(h),
        Number(mi),
        Number(s)
      ).getTime()
    }

    return 0
  }

  function safeDownloadName(value) {
    return String(value || "")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, "_")
      .trim()
  }

  function redactCamera(camera) {
    if (!camera) return camera
    const copy = { ...camera }
    delete copy.password
    return copy
  }

  function redactCameraList(rows) {
    return Array.isArray(rows) ? rows.map(redactCamera) : []
  }

  function redactUser(row) {
    if (!row) return row
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      enabled: row.enabled
    }
  }

  function getBearerToken(req) {
    const auth = String(req.headers.authorization || "")
    if (!auth.startsWith("Bearer ")) return ""
    return auth.slice(7).trim()
  }

  async function getAuthUser(req) {
    const token = getBearerToken(req)
    if (!token) return null

    const row = await dbGet(
      `SELECT u.id, u.username, u.role, u.enabled
       FROM auth_tokens t
       INNER JOIN users u ON u.id = t.user_id
       WHERE t.token = ?
         AND u.enabled = 1
         AND datetime(t.expires_at) > datetime('now')`,
      [token]
    )

    return row || null
  }

  async function requireLogin(req, res) {
    const user = await getAuthUser(req)
    if (!user) {
      writeJson(res, 401, { ok: false, error: "login required" })
      return null
    }
    return user
  }

  async function requireAdmin(req, res) {
    const user = await requireLogin(req, res)
    if (!user) return null

    if (user.role !== "admin") {
      writeJson(res, 403, { ok: false, error: "admin only" })
      return null
    }

    return user
  }

  async function canUserAccessCamera(user, cameraId) {
    if (!user || !cameraId) return false
    if (user.role === "admin") return true

    const row = await dbGet(
      `SELECT 1
       FROM user_cameras
       WHERE user_id = ? AND camera_id = ?
       LIMIT 1`,
      [user.id, cameraId]
    )

    return !!row
  }


  async function ensureAuthTables() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT DEFAULT 'admin',
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `)

  await dbRun(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `)

  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      camera_id INTEGER NOT NULL,
      UNIQUE(user_id, camera_id)
    )
  `)

  const columns = await dbAll(`PRAGMA table_info(users)`)
  const names = columns.map(c => c.name)

  async function addColumn(name, sql) {
    if (!names.includes(name)) {
      await dbRun(`ALTER TABLE users ADD COLUMN ${name} ${sql}`)
    }
  }

  await addColumn("password_hash", "TEXT")
  await addColumn("role", "TEXT DEFAULT 'admin'")
  await addColumn("enabled", "INTEGER DEFAULT 1")
  await addColumn("created_at", "TEXT")
  await addColumn("updated_at", "TEXT")

  // Initial admin setup is handled centrally in app.js
}

ensureAuthTables().catch(err => {
  console.error("ensureAuthTables error:", err)
})

function ensureCameraTimelapseFolder(camera) {
  try {
    const folder = getCameraFolder(camera)
    fs.mkdirSync(folder, { recursive: true })
    console.log("Camera timelapse folder ensured:", folder)
    return folder
  } catch (err) {
    console.warn("Camera timelapse folder create warning:", err.message)
    return ""
  }
}

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, "http://localhost")
      const pathname = reqUrl.pathname

      if (IS_TIMELAPSE_ONLY) {
        if (
          pathname === "/api/people" ||
          pathname === "/api/events" ||
          pathname === "/api/events/open" ||
          pathname.startsWith("/api/events/") ||
          pathname.startsWith("/api/layout/") ||
          pathname === "/api/stop" ||
          pathname.startsWith("/api/ptz/") ||
          pathname === "/api/geocode" ||
          pathname === "/api/speakers" ||
          pathname === "/api/speaker/test" ||
          pathname === "/api/speakers/save" ||
          pathname === "/api/speakers/update" ||
          pathname.startsWith("/api/speakers/") ||
          pathname === "/api/speaker-events" ||
          pathname === "/api/speaker-events/running" ||
          pathname === "/api/speaker-events/save" ||
          pathname === "/api/speaker-events/start" ||
          pathname === "/api/speaker-events/stop" ||
          pathname === "/api/speaker-events/update" ||
          pathname === "/api/speaker-events/delete" ||
          pathname.startsWith("/api/speaker-events/")
        ) {
          return featureDisabled(res, "This API")
        }
      }

      // =================
      // Media file routes
      // =================

      if (pathname.startsWith("/exports/") && req.method === "GET") {
        const user = await requireLogin(req, res)
        if (!user) return

        const filename = decodeURIComponent(pathname.replace("/exports/", ""))
        const filePath = path.join(exportsDir, filename)

        if (!isInsideDir(exportsDir, filePath) && filePath !== exportsDir) {
          return writeText(res, 403, "FORBIDDEN")
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          return writeText(res, 404, "NOT FOUND")
        }

        res.writeHead(200, {
          "Content-Type": "video/mp4"
        })
        fs.createReadStream(filePath).pipe(res)
        return
      }

      if (pathname.startsWith("/timelapse-file/") && req.method === "GET") {
        try {
          const user = await requireLogin(req, res)
          if (!user) return

          const parts = pathname.split("/")
          const cameraId = safeNumber(parts[2], 0)
          const filename = decodeURIComponent(parts.slice(3).join("/"))

          if (!cameraId || !filename) {
            return writeText(res, 400, "BAD REQUEST")
          }

          const allowed = await canUserAccessCamera(user, cameraId)
          if (!allowed) {
            return writeText(res, 403, "FORBIDDEN")
          }

          const cam = await dbGet(`SELECT * FROM cameras WHERE id=?`, [cameraId])
          if (!cam) {
            return writeText(res, 404, "NOT FOUND")
          }

          const dir = getCameraFolder(cam)
          const filePath = path.join(dir, filename)

          if (!isInsideDir(dir, filePath) && filePath !== dir) {
            return writeText(res, 403, "FORBIDDEN")
          }

          if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            return writeText(res, 404, "NOT FOUND")
          }

          res.writeHead(200, { "Content-Type": "image/jpeg" })
          fs.createReadStream(filePath).pipe(res)
          return
        } catch (e) {
          console.error("timelapse-file error:", e)
          return writeText(res, 500, "ERROR")
        }
      }

      // =================
      // API routes
      // =================

      if (pathname === "/api/auth/login" && req.method === "POST") {
        try {
          const body = await readJsonBody(req)
          const username = String(body.username || "").trim()
          const password = String(body.password || "")

          if (!username || !password) {
            return writeJson(res, 400, {
              ok: false,
              error: "username and password are required"
            })
          }

          const user = await dbGet(
            `SELECT * FROM users
             WHERE username = ?
               AND enabled = 1`,
            [username]
          )

          if (!user) {
            return writeJson(res, 401, {
              ok: false,
              error: "invalid credentials"
            })
          }

          const ok = await bcrypt.compare(password, user.password_hash)
          if (!ok) {
            return writeJson(res, 401, {
              ok: false,
              error: "invalid credentials"
            })
          }

          const token = crypto.randomBytes(32).toString("hex")
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

          await dbRun(
            `INSERT INTO auth_tokens (user_id, token, expires_at)
             VALUES (?, ?, ?)`,
            [user.id, token, expiresAt]
          )

          return writeJson(res, 200, {
            ok: true,
            token,
            user: redactUser(user)
          })
        } catch (e) {
          console.error("login error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/auth/me" && req.method === "GET") {
        try {
          const user = await requireLogin(req, res)
          if (!user) return

          return writeJson(res, 200, {
            ok: true,
            user: redactUser(user)
          })
        } catch (e) {
          console.error("auth me error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/auth/logout" && req.method === "POST") {
        try {
          const token = getBearerToken(req)

          if (token) {
            await dbRun(`DELETE FROM auth_tokens WHERE token = ?`, [token])
          }

          return writeJson(res, 200, { ok: true })
        } catch (e) {
          console.error("logout error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/plugins" && req.method === "GET") {
        const user = await requireLogin(req, res)
        if (!user) return

        if (IS_TIMELAPSE_ONLY) {
          return writeJson(res, 200, [
            { name: "timelapse", label: "タイムラプス", icon: "⏱" }
          ])
        }

        return writeJson(res, 200, [
          { name: "timelapse", label: "タイムラプス", icon: "⏱" },
          { name: "people", label: "人数カウント", icon: "👤" }
        ])
      }

      if (pathname === "/api/people" && req.method === "GET") {
        if (IS_TIMELAPSE_ONLY) {
          return featureDisabled(res, "People API")
        }
        return writeJson(res, 200, getCounts())
      }

      if (pathname === "/api/events" && req.method === "GET") {
        if (IS_TIMELAPSE_ONLY) {
          return featureDisabled(res, "Events API")
        }

        try {
          const limit = safeNumber(reqUrl.searchParams.get("limit"), 20)
          const rows = await listEvents(db, limit)
          return writeJson(res, 200, Array.isArray(rows) ? rows : [])
        } catch (e) {
          console.error("events list error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/events/open" && req.method === "GET") {
        if (IS_TIMELAPSE_ONLY) {
          return featureDisabled(res, "Events API")
        }

        try {
          const rows = await getOpenEvents(db)
          return writeJson(res, 200, Array.isArray(rows) ? rows : [])
        } catch (e) {
          console.error("open events error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname.startsWith("/api/events/") && req.method === "DELETE") {
        if (IS_TIMELAPSE_ONLY) {
          return featureDisabled(res, "Events API")
        }

        try {
          const id = safeNumber(pathname.split("/").pop(), 0)

          if (!id) {
            return writeJson(res, 400, { ok: false, error: "invalid event id" })
          }

          const row = await dbGet(
            `
            SELECT *
            FROM events
            WHERE id=?
            `,
            [id]
          )

          if (!row) {
            return writeJson(res, 404, { ok: false, error: "event not found" })
          }

          await dbRun(`DELETE FROM events WHERE id=?`, [id])

          return writeJson(res, 200, { ok: true, id })
        } catch (e) {
          console.error("event delete error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/timelapse/logs" && req.method === "GET") {
        const user = await requireLogin(req, res)
        if (!user) return

        ensureLogsArray()

        const status = timelapseService?.getStatus?.() || {
          running: false,
          checking: false
        }

        return writeJson(res, 200, {
          running: !!status.running,
          checking: !!status.checking,
          logs: state.logs || []
        })
      }

      if (pathname.startsWith("/api/layout/") && req.method === "GET") {
        if (IS_TIMELAPSE_ONLY) {
          return featureDisabled(res, "Layout API")
        }

        const count = safeNumber(pathname.split("/").pop(), 1)
        await runLayout(count, 10)
        return writeJson(res, 200, { ok: true })
      }

      if (pathname === "/api/stop" && req.method === "GET") {
        if (IS_TIMELAPSE_ONLY) {
          return featureDisabled(res, "Layout API")
        }

        stopPipeline()
        return writeJson(res, 200, { ok: true })
      }

      // ==========================
      // Camera CRUD
      // ==========================

      if (pathname === "/api/cameras" && req.method === "GET") {
        const user = await requireLogin(req, res)
        if (!user) return

        let rows = []

        if (user.role === "admin") {
          rows = await dbAll(
            `
            SELECT *
            FROM cameras
            ORDER BY id
            `
          )
        } else {
          rows = await dbAll(
            `
            SELECT c.*
            FROM cameras c
            INNER JOIN user_cameras uc ON uc.camera_id = c.id
            WHERE uc.user_id = ?
            ORDER BY c.id
            `,
            [user.id]
          )
        }

        return writeJson(res, 200, redactCameraList(rows))
      }

      if (pathname === "/api/cameras/save" && req.method === "POST") {
        try {
          const admin = await requireAdmin(req, res)
          if (!admin) return

          const raw = await readJsonBody(req)
          const data = normalizeCameraPayload(raw)

          const result = await dbRun(
            `
            INSERT INTO cameras (
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
              capture_mode,
              notes,
              timelapse_enabled,
              tl_interval,
              tl_start_hour,
              tl_end_hour,
              tl_days,
              tl_folder_name,
              tl_output_dir,
              tl_notify_email,
              tl_notify_after_sec,
              tl_status,
              tl_is_running,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
            `,
            [
              data.name,
              data.rtsp_url,
              data.enabled,
              data.address,
              data.lat,
              data.lng,
              data.people_count_enabled,
              data.people_count_type,
              data.stream_type,
              data.camera_ip,
              data.username,
              data.password,
              data.port,
              data.manufacturer,
              data.model,
              data.protocol,
              data.stream_path,
              data.manual_rtsp_url,
              data.snapshot_url,
              data.capture_mode,
              data.notes,
              data.timelapse_enabled,
              data.tl_interval,
              data.tl_start_hour,
              data.tl_end_hour,
              data.tl_days,
              data.tl_folder_name,
              data.tl_output_dir,
              data.tl_notify_email,
              data.tl_notify_after_sec,
              data.tl_status,
              data.tl_is_running
            ]
          )

          const folder = ensureCameraTimelapseFolder({
          ...data,
          id: result.lastID
           })

          return writeJson(res, 200, {
          ok: true,
          id: result.lastID,
          folder
        })
        } catch (e) {
          console.error("camera save error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/cameras/update" && req.method === "POST") {
        try {
          const admin = await requireAdmin(req, res)
          if (!admin) return

          const raw = await readJsonBody(req)
          const data = normalizeCameraPayload(raw)

          if (!data.id) {
            return writeJson(res, 400, { ok: false, error: "camera id is required" })
          }

          await dbRun(
            `
            UPDATE cameras SET
              name=?,
              rtsp_url=?,
              enabled=?,
              address=?,
              lat=?,
              lng=?,

              people_count_enabled=?,
              people_count_type=?,

              stream_type=?,
              camera_ip=?,
              username=?,
              password=?,
              port=?,
              manufacturer=?,
              model=?,
              protocol=?,
              stream_path=?,
              manual_rtsp_url=?,
              snapshot_url=?,
              capture_mode=?,
              notes=?,

              timelapse_enabled=?,
              tl_interval=?,
              tl_start_hour=?,
              tl_end_hour=?,
              tl_days=?,
              tl_folder_name=?,
              tl_output_dir=?,
              tl_notify_email=?,
              tl_notify_after_sec=?,
              tl_status=?,
              tl_is_running=?,

              updated_at=datetime('now','localtime')
            WHERE id=?
            `,
            [
              data.name,
              data.rtsp_url,
              data.enabled,
              data.address,
              data.lat,
              data.lng,

              data.people_count_enabled,
              data.people_count_type,

              data.stream_type,
              data.camera_ip,
              data.username,
              data.password,
              data.port,
              data.manufacturer,
              data.model,
              data.protocol,
              data.stream_path,
              data.manual_rtsp_url,
              data.snapshot_url,
              data.capture_mode,
              data.notes,

              data.timelapse_enabled,
              data.tl_interval,
              data.tl_start_hour,
              data.tl_end_hour,
              data.tl_days,
              data.tl_folder_name,
              data.tl_output_dir,
              data.tl_notify_email,
              data.tl_notify_after_sec,
              data.tl_status,
              data.tl_is_running,

              data.id
            ]
          )

          const folder = ensureCameraTimelapseFolder(data)

          return writeJson(res, 200, {
          ok: true,
          folder
          })
        } catch (e) {
          console.error("camera update error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname.startsWith("/api/cameras/") && req.method === "GET") {
        const user = await requireLogin(req, res)
        if (!user) return

        const id = safeNumber(pathname.split("/").pop(), 0)

        if (!id) {
          return writeJson(res, 400, { ok: false, error: "invalid camera id" })
        }

        const allowed = await canUserAccessCamera(user, id)
        if (!allowed) {
          return writeJson(res, 403, { ok: false, error: "forbidden" })
        }

        const cam = await dbGet(
          `
          SELECT *
          FROM cameras
          WHERE id=?
          `,
          [id]
        )

        if (!cam) {
          return writeJson(res, 404, { ok: false, error: "camera not found" })
        }

        return writeJson(res, 200, redactCamera(cam))
      }

      if (pathname.startsWith("/api/cameras/") && req.method === "DELETE") {
        try {
          const admin = await requireAdmin(req, res)
          if (!admin) return

          const id = safeNumber(pathname.split("/").pop(), 0)

          if (!id) {
            return writeJson(res, 400, { ok: false, error: "invalid camera id" })
          }

          await dbRun(`DELETE FROM cameras WHERE id=?`, [id])

          return writeJson(res, 200, { ok: true })
        } catch (e) {
          console.error("camera delete error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname.startsWith("/api/camera/") && req.method === "GET") {
        if (IS_TIMELAPSE_ONLY) {
          return featureDisabled(res, "Direct camera playback API")
        }

        const id = safeNumber(pathname.split("/").pop(), 0)

        const cam = await dbGet(
          `
          SELECT *
          FROM cameras
          WHERE id=?
          `,
          [id]
        )

        if (!cam) {
          return writeJson(res, 404, { ok: false, error: "camera not found" })
        }

        startPipeline(
          [
            {
              url: cam.rtsp_url,
              name: cam.name
            }
          ],
          1
        )

        return writeJson(res, 200, { ok: true })
      }

      // ==========================
      // User camera mapping
      // ==========================

      if (pathname === "/api/user-cameras/save" && req.method === "POST") {
        try {
          const admin = await requireAdmin(req, res)
          if (!admin) return

          const body = await readJsonBody(req)
          const userId = safeNumber(body.user_id, 0)
          const cameraId = safeNumber(body.camera_id, 0)

          if (!userId || !cameraId) {
            return writeJson(res, 400, { ok: false, error: "user_id and camera_id are required" })
          }

          await dbRun(
            `INSERT OR IGNORE INTO user_cameras (user_id, camera_id)
             VALUES (?, ?)`,
            [userId, cameraId]
          )

          return writeJson(res, 200, { ok: true })
        } catch (e) {
          console.error("user camera save error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/user-cameras/delete" && req.method === "POST") {
        try {
          const admin = await requireAdmin(req, res)
          if (!admin) return

          const body = await readJsonBody(req)
          const userId = safeNumber(body.user_id, 0)
          const cameraId = safeNumber(body.camera_id, 0)

          if (!userId || !cameraId) {
            return writeJson(res, 400, { ok: false, error: "user_id and camera_id are required" })
          }

          await dbRun(
            `DELETE FROM user_cameras
             WHERE user_id = ? AND camera_id = ?`,
            [userId, cameraId]
          )

          return writeJson(res, 200, { ok: true })
        } catch (e) {
          console.error("user camera delete error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname.startsWith("/api/users/") && pathname.endsWith("/cameras") && req.method === "GET") {
        try {
          const admin = await requireAdmin(req, res)
          if (!admin) return

          const parts = pathname.split("/")
          const userId = safeNumber(parts[3], 0)

          if (!userId) {
            return writeJson(res, 400, { ok: false, error: "invalid user id" })
          }

          const rows = await dbAll(
            `
            SELECT c.*
            FROM cameras c
            INNER JOIN user_cameras uc ON uc.camera_id = c.id
            WHERE uc.user_id = ?
            ORDER BY c.id
            `,
            [userId]
          )

          return writeJson(res, 200, redactCameraList(rows))
        } catch (e) {
          console.error("user cameras get error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname.startsWith("/api/ptz/") && req.method === "GET") {
        return featureDisabled(res, "PTZ API")
      }

      // ==========================
      // Speakers
      // ==========================

      if (pathname === "/api/speakers" && req.method === "GET") {
        const rows = await dbAll(
          `
          SELECT *
          FROM speakers
          ORDER BY id DESC
          `
        )
        return writeJson(res, 200, rows)
      }

      if (pathname === "/api/speaker/test" && req.method === "POST") {
        try {
          const data = await readJsonBody(req)
          const ip = data.ip || data.rtp_ip || ""
          const filePath = data.file_path || "logo.mp3"

          const result = await playSpeakerClip(ip, filePath, 3000)
          return writeJson(res, 200, result || { ok: true })
        } catch (e) {
          console.error("speaker test error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/speakers/save" && req.method === "POST") {
        try {
          const body = await readJsonBody(req)

          const result = await dbRun(
            `
            INSERT INTO speakers (
              name,
              ip,
              rtp_ip,
              address,
              lat,
              lng,
              username,
              password,
              model,
              port,
              protocol,
              notes,
              file_path,
              enabled
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              String(body.name || "").trim(),
              String(body.ip || "").trim(),
              String(body.rtp_ip || body.ip || "").trim(),
              String(body.address || "").trim(),
              safeNullableNumber(body.lat),
              safeNullableNumber(body.lng),
              String(body.username || "").trim(),
              String(body.password || "").trim(),
              String(body.model || "AXIS C1410").trim(),
              safeNumber(body.port, 80),
              String(body.protocol || "http").trim(),
              String(body.notes || "").trim(),
              String(body.file_path || "").trim(),
              safeBoolInt(body.enabled, 1)
            ]
          )

          return writeJson(res, 200, {
            ok: true,
            id: result?.lastID || null
          })
        } catch (e) {
          console.error("speaker save error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/speakers/update" && req.method === "POST") {
        try {
          const body = await readJsonBody(req)
          const id = safeNumber(body.id, 0)

          if (!id) {
            return writeJson(res, 400, { ok: false, error: "speaker id is required" })
          }

          await dbRun(
            `
            UPDATE speakers
            SET
              name = ?,
              ip = ?,
              rtp_ip = ?,
              address = ?,
              lat = ?,
              lng = ?,
              username = ?,
              password = ?,
              model = ?,
              port = ?,
              protocol = ?,
              notes = ?,
              file_path = ?,
              enabled = ?
            WHERE id = ?
            `,
            [
              String(body.name || "").trim(),
              String(body.ip || "").trim(),
              String(body.rtp_ip || body.ip || "").trim(),
              String(body.address || "").trim(),
              safeNullableNumber(body.lat),
              safeNullableNumber(body.lng),
              String(body.username || "").trim(),
              String(body.password || "").trim(),
              String(body.model || "AXIS C1410").trim(),
              safeNumber(body.port, 80),
              String(body.protocol || "http").trim(),
              String(body.notes || "").trim(),
              String(body.file_path || "").trim(),
              safeBoolInt(body.enabled, 1),
              id
            ]
          )

          return writeJson(res, 200, { ok: true })
        } catch (e) {
          console.error("speaker update error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname.startsWith("/api/speakers/") && req.method === "GET") {
        try {
          const id = safeNumber(pathname.split("/").pop(), 0)

          if (!id) {
            return writeJson(res, 400, { ok: false, error: "invalid speaker id" })
          }

          const row = await dbGet(
            `
            SELECT *
            FROM speakers
            WHERE id = ?
            `,
            [id]
          )

          if (!row) {
            return writeJson(res, 404, { ok: false, error: "speaker not found" })
          }

          return writeJson(res, 200, row)
        } catch (e) {
          console.error("speaker get error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname.startsWith("/api/speakers/") && req.method === "DELETE") {
        try {
          const id = safeNumber(pathname.split("/").pop(), 0)

          if (!id) {
            return writeJson(res, 400, { ok: false, error: "invalid speaker id" })
          }

          await dbRun(
            `
            DELETE FROM speakers
            WHERE id = ?
            `,
            [id]
          )

          return writeJson(res, 200, { ok: true, id })
        } catch (e) {
          console.error("speaker delete error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      // ==========================
      // Speaker Events
      // ==========================

      if (pathname === "/api/speaker-events" && req.method === "GET") {
        try {
          const rows = await dbAll(`
            SELECT *
            FROM speaker_events
            ORDER BY id DESC
          `)

          return writeJson(res, 200, rows)
        } catch (e) {
          console.error("speaker events list error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/speaker-events/running" && req.method === "GET") {
        try {
          return writeJson(res, 200, {
            ok: true,
            items: speakerEventRuntime?.getRunning?.() || []
          })
        } catch (e) {
          console.error("speaker event running route error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname.startsWith("/api/speaker-events/") && req.method === "GET") {
        try {
          const id = safeNumber(pathname.split("/").pop(), 0)

          if (!id) {
            return writeJson(res, 400, { ok: false, error: "invalid speaker event id" })
          }

          const row = await dbGet(`
            SELECT *
            FROM speaker_events
            WHERE id = ?
          `, [id])

          if (!row) {
            return writeJson(res, 404, { ok: false, error: "speaker event not found" })
          }

          return writeJson(res, 200, row)
        } catch (e) {
          console.error("speaker event get error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/speaker-events/save" && req.method === "POST") {
        try {
          const raw = await readJsonBody(req)
          const data = normalizeSpeakerEventPayload(raw)

          if (!data.name) {
            return writeJson(res, 400, { ok: false, error: "name is required" })
          }

          const result = await dbRun(`
            INSERT INTO speaker_events (
              name,
              event_type,
              speaker_ids,
              camera_ids,
              audio_file,
              schedule_enabled,
              schedule_date,
              schedule_time,
              loop_enabled,
              status,
              notes,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
          `, [
            data.name,
            data.event_type,
            data.speaker_ids,
            data.camera_ids,
            data.audio_file,
            data.schedule_enabled,
            data.schedule_date,
            data.schedule_time,
            data.loop_enabled,
            data.status,
            data.notes
          ])

          return writeJson(res, 200, {
            ok: true,
            id: result?.lastID || null
          })
        } catch (e) {
          console.error("speaker event save error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/speaker-events/start" && req.method === "POST") {
        try {
          const body = await readJsonBody(req)
          const id = safeNumber(body.id, 0)

          if (!id) {
            return writeJson(res, 400, { ok: false, error: "invalid speaker event id" })
          }

          const result = await speakerEventRuntime.start(id)

          if (!result.ok) {
            return writeJson(res, 500, result)
          }

          return writeJson(res, 200, result)
        } catch (e) {
          console.error("speaker event start route error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/speaker-events/stop" && req.method === "POST") {
        try {
          const body = await readJsonBody(req)
          const id = safeNumber(body.id, 0)

          if (!id) {
            return writeJson(res, 400, { ok: false, error: "invalid speaker event id" })
          }

          const result = await speakerEventRuntime.stop(id)

          if (!result.ok) {
            return writeJson(res, 500, result)
          }

          return writeJson(res, 200, result)
        } catch (e) {
          console.error("speaker event stop route error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/speaker-events/update" && req.method === "POST") {
        try {
          const raw = await readJsonBody(req)
          const data = normalizeSpeakerEventPayload(raw)

          if (!data.id) {
            return writeJson(res, 400, { ok: false, error: "speaker event id is required" })
          }

          if (!data.name) {
            return writeJson(res, 400, { ok: false, error: "name is required" })
          }

          await dbRun(`
            UPDATE speaker_events
            SET
              name = ?,
              event_type = ?,
              speaker_ids = ?,
              camera_ids = ?,
              audio_file = ?,
              schedule_enabled = ?,
              schedule_date = ?,
              schedule_time = ?,
              loop_enabled = ?,
              status = ?,
              notes = ?,
              updated_at = strftime('%s','now')
            WHERE id = ?
          `, [
            data.name,
            data.event_type,
            data.speaker_ids,
            data.camera_ids,
            data.audio_file,
            data.schedule_enabled,
            data.schedule_date,
            data.schedule_time,
            data.loop_enabled,
            data.status,
            data.notes,
            data.id
          ])

          return writeJson(res, 200, { ok: true })
        } catch (e) {
          console.error("speaker event update error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/speaker-events/delete" && req.method === "POST") {
        try {
          const body = await readJsonBody(req)
          const id = safeNumber(body.id, 0)

          if (!id) {
            return writeJson(res, 400, { ok: false, error: "invalid speaker event id" })
          }

          await dbRun(`
            DELETE FROM speaker_events
            WHERE id = ?
          `, [id])

          return writeJson(res, 200, { ok: true, id })
        } catch (e) {
          console.error("speaker event delete error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      // ==========================
      // Geocode
      // ==========================

      if (pathname === "/api/geocode" && req.method === "GET") {
        if (IS_TIMELAPSE_ONLY) {
          return featureDisabled(res, "Geocode API")
        }

        try {
          const address = (reqUrl.searchParams.get("address") || "").trim()

          if (!address) {
            return writeJson(res, 400, { ok: false, error: "address is required" })
          }

          const token = process.env.MAPBOX_TOKEN || ""
          if (!token) {
            return writeJson(res, 500, { ok: false, error: "MAPBOX_TOKEN is missing" })
          }

          const apiUrl =
            "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
            encodeURIComponent(address) +
            `.json?limit=1&language=ja&access_token=${token}`

          const mapboxRes = await fetch(apiUrl)
          const data = await mapboxRes.json()

          if (data.features && data.features.length) {
            const c = data.features[0].center
            return writeJson(res, 200, {
              ok: true,
              lat: c[1],
              lng: c[0]
            })
          }

          return writeJson(res, 200, { ok: false, error: "not found" })
        } catch (e) {
          console.error("geocode error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      // ==========================
      // Timelapse
      // ==========================

      if (pathname === "/api/timelapse/start" && req.method === "POST") {
        const user = await requireLogin(req, res)
        if (!user) return

        const result =
          timelapseService?.start?.() ||
          { ok: false, error: "timelapseService missing" }

        return writeJson(res, 200, result)
      }

      if (pathname === "/api/timelapse/stop" && req.method === "POST") {
        const user = await requireLogin(req, res)
        if (!user) return

        const result =
          timelapseService?.stop?.() ||
          { ok: false, error: "timelapseService missing" }

        return writeJson(res, 200, result)
      }

      if (pathname === "/api/timelapse/status" && req.method === "GET") {
        const user = await requireLogin(req, res)
        if (!user) return

        const result =
          timelapseService?.getStatus?.() ||
          { running: false, checking: false }

        return writeJson(res, 200, result)
      }

      if (pathname === "/api/timelapse/run" && req.method === "POST") {
        try {
          const user = await requireLogin(req, res)
          if (!user) return

          const data = await readJsonBody(req)
          const cameraId = safeNumber(data.camera_id, 0)

          if (!cameraId) {
            return writeJson(res, 400, { ok: false, error: "camera_id is required" })
          }

          const allowed = await canUserAccessCamera(user, cameraId)
          if (!allowed) {
            return writeJson(res, 403, { ok: false, error: "forbidden" })
          }

          if (!timelapseService?.runNowByCameraId) {
            return writeJson(res, 500, { ok: false, error: "timelapseService missing" })
          }

          const result = await timelapseService.runNowByCameraId(cameraId)

          if (!result.ok) {
            return writeJson(res, 500, result)
          }

          return writeJson(res, 200, result)
        } catch (e) {
          console.error("timelapse run error:", e)
          addLog("error", e.message)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/timelapse/files" && req.method === "GET") {
        try {
          const user = await requireLogin(req, res)
          if (!user) return

          const cameraId = safeNumber(reqUrl.searchParams.get("camera_id"), 0)
          const from = safeNumber(reqUrl.searchParams.get("from"), 0)
          const to = safeNumber(reqUrl.searchParams.get("to"), 0)

          const allowed = await canUserAccessCamera(user, cameraId)
          if (!allowed) {
            return writeJson(res, 403, { ok: false, error: "forbidden" })
          }

          const cam = await dbGet(`SELECT * FROM cameras WHERE id=?`, [cameraId])
          if (!cam) {
            return writeJson(res, 404, { ok: false, error: "camera not found" })
          }

          const dir = getCameraFolder(cam)
          if (!fs.existsSync(dir)) {
            return writeJson(res, 200, { ok: true, files: [] })
          }

          const files = fs.readdirSync(dir)
            .filter(f => isImageFile(f))
            .map(f => {
              const full = path.join(dir, f)
              const time = getImageTimestamp(full, f)

              return {
                name: f,
                time,
                url: `/timelapse-file/${cam.id}/${encodeURIComponent(f)}`
              }
            })
            .filter(file => {
              if (from && file.time < from) return false
              if (to && file.time > to) return false
              return true
            })
            .sort((a, b) => a.time - b.time)

          return writeJson(res, 200, { ok: true, files })
        } catch (e) {
          console.error("timelapse files error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/timelapse/delete" && req.method === "POST") {
        try {
          const user = await requireLogin(req, res)
          if (!user) return

          const data = await readJsonBody(req)
          const cameraId = safeNumber(data.camera_id, 0)

          const allowed = await canUserAccessCamera(user, cameraId)
          if (!allowed) {
            return writeJson(res, 403, { ok: false, error: "forbidden" })
          }

          const cam = await dbGet(`SELECT * FROM cameras WHERE id=?`, [cameraId])

          if (!cam) {
            return writeJson(res, 404, { ok: false, error: "camera not found" })
          }

          const dir = getCameraFolder(cam)

          for (const name of data.files || []) {
            const filePath = path.join(dir, String(name || ""))

            if (!isInsideDir(dir, filePath)) continue
            if (!fs.existsSync(filePath)) continue
            if (!fs.statSync(filePath).isFile()) continue

            fs.unlinkSync(filePath)
          }

          return writeJson(res, 200, { ok: true })
        } catch (e) {
          console.error("timelapse delete error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/timelapse/video/delete" && req.method === "POST") {
        try {
          const user = await requireLogin(req, res)
          if (!user) return

          const data = await readJsonBody(req)
          const name = String(data.name || "")
          const filePath = path.join(exportsDir, name)

          if (!isInsideDir(exportsDir, filePath)) {
            return writeJson(res, 403, { ok: false, error: "forbidden" })
          }

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath)
          }

          return writeJson(res, 200, { ok: true })
        } catch (e) {
          console.error("timelapse video delete error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/timelapse/preview" && req.method === "GET") {
        try {
          const user = await requireLogin(req, res)
          if (!user) return

          const cameraId = safeNumber(reqUrl.searchParams.get("camera_id"), 0)
          const from = safeNumber(reqUrl.searchParams.get("from"), 0)
          const to = safeNumber(reqUrl.searchParams.get("to"), 0)
          const fps = safeNumber(reqUrl.searchParams.get("fps"), 12)
          const speed = safeNumber(reqUrl.searchParams.get("speed"), 1)

          if (!cameraId) {
            return writeJson(res, 400, { ok: false, error: "camera_id is required" })
          }

          if (!from || !to) {
            return writeJson(res, 400, { ok: false, error: "from and to are required" })
          }

          if (from >= to) {
            return writeJson(res, 400, { ok: false, error: "invalid date range" })
          }

          const allowed = await canUserAccessCamera(user, cameraId)
          if (!allowed) {
            return writeJson(res, 403, { ok: false, error: "forbidden" })
          }

          const cam = await dbGet(`SELECT * FROM cameras WHERE id=?`, [cameraId])
          if (!cam) {
            return writeJson(res, 404, { ok: false, error: "camera not found" })
          }

          addLog("info", `動画生成開始: camera=${cam.name || cam.id}, fps=${fps}, speed=x${speed}`)

          const result = await buildVideoFromRange(
            cam,
            from,
            to,
            fps,
            speed,
            1280,
            progress => {
              if (progress?.stage) {
                console.log("[timelapse preview]", progress.stage, progress.percent ?? "")
              }
            }
          )

          addLog(
            "info",
            `動画生成完了: ${result.filename} / ${result.imageCount}枚 / ${result.estimatedDurationSec?.toFixed?.(1) || 0}秒`
          )

          return writeJson(res, 200, {
            ok: true,
            url: result.url,
            filename: result.filename,
            name: result.filename,
            imageCount: result.imageCount,
            from: result.from,
            to: result.to,
            fps: result.fps,
            speed: result.speed,
            outputFps: result.outputFps,
            width: result.width,
            estimatedDurationSec: result.estimatedDurationSec,
            fileSize: result.fileSize
          })
        } catch (e) {
          console.error("timelapse preview error:", e)
          addLog("error", `動画生成失敗: ${e.message}`)
          return writeJson(res, 500, { ok: false, error: e.message || "preview failed" })
        }
      }

      if (pathname === "/api/timelapse/videos" && req.method === "GET") {
        try {
          const user = await requireLogin(req, res)
          if (!user) return

          if (!fs.existsSync(exportsDir)) {
            return writeJson(res, 200, { ok: true, files: [] })
          }

          const files = fs.readdirSync(exportsDir)
            .filter(f => f.endsWith(".mp4"))
            .map(f => {
              const full = path.join(exportsDir, f)
              const stat = fs.statSync(full)

              return {
                name: f,
                url: `/exports/${encodeURIComponent(f)}`,
                time: stat.mtimeMs
              }
            })
            .sort((a, b) => b.time - a.time)

          return writeJson(res, 200, { ok: true, files })
        } catch (e) {
          console.error("timelapse videos error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      if (pathname === "/api/timelapse/latest" && req.method === "GET") {
        try {
          const user = await requireLogin(req, res)
          if (!user) return

          const camId = safeNumber(reqUrl.searchParams.get("camera_id"), 0)

          const allowed = await canUserAccessCamera(user, camId)
          if (!allowed) {
            return writeText(res, 403, "FORBIDDEN")
          }

          const cam = await dbGet(`SELECT * FROM cameras WHERE id=?`, [camId])

          if (!cam) {
            return writeText(res, 404, "camera not found")
          }

          const dir = getCameraFolder(cam)
          if (!fs.existsSync(dir)) {
            return writeText(res, 404, "no timelapse dir")
          }

          const files = fs.readdirSync(dir)
            .filter(f => f.toLowerCase().endsWith(".jpg"))
            .map(f => {
              const full = path.join(dir, f)
              return {
                name: f,
                time: getImageTimestamp(full, f),
                path: full
              }
            })
            .sort((a, b) => a.time - b.time)

          if (!files.length) {
            return writeText(res, 404, "no image")
          }

          const latest = files[files.length - 1]

          res.writeHead(200, { "Content-Type": "image/jpeg" })
          fs.createReadStream(latest.path).pipe(res)
          return
        } catch (e) {
          console.error("timelapse latest error:", e)
          return writeText(res, 500, "ERROR")
        }
      }

      if (pathname === "/api/timelapse/files/download-zip" && req.method === "GET") {
        try {
          const user = await requireLogin(req, res)
          if (!user) return

          const cameraId = Number(reqUrl.searchParams.get("camera_id") || 0)
          const from = Number(reqUrl.searchParams.get("from") || 0)
          const to = Number(reqUrl.searchParams.get("to") || 0)

          if (!cameraId) {
            return writeJson(res, 400, { ok: false, error: "camera_id is required" })
          }

          if (!from || !to || to <= from) {
            return writeJson(res, 400, { ok: false, error: "invalid from/to range" })
          }

          const allowed = await canUserAccessCamera(user, cameraId)
          if (!allowed) {
            return writeJson(res, 403, { ok: false, error: "forbidden" })
          }

          const camera = await dbGet("SELECT * FROM cameras WHERE id = ?", [cameraId])
          if (!camera) {
            return writeJson(res, 404, { ok: false, error: "camera not found" })
          }

          const folder = getCameraFolder(camera)
          if (!fs.existsSync(folder)) {
            return writeJson(res, 404, { ok: false, error: "camera image folder not found" })
          }

          const allNames = fs.readdirSync(folder)
          const matchedFiles = allNames
            .filter(name => isImageFile(name))
            .map(name => {
              const fullPath = path.join(folder, name)
              const stat = fs.statSync(fullPath)
              const parsedTime = fileTimeFromName(name)
              const ts = parsedTime || stat.mtimeMs || 0

              return {
                name,
                fullPath,
                ts
              }
            })
            .filter(f => f.ts >= from && f.ts <= to)
            .sort((a, b) => a.ts - b.ts)

          if (!matchedFiles.length) {
            return writeJson(res, 404, { ok: false, error: "no images found in selected range" })
          }

          const cameraName = safeDownloadName(camera.name || `camera_${camera.id}`)
          const zipName = `${cameraName}_${from}_${to}.zip`

          res.writeHead(200, {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${zipName}"`,
            "Cache-Control": "no-store"
          })

          const archive = archiver("zip", { zlib: { level: 9 } })

          archive.on("error", err => {
            console.error("zip archive error:", err)
            if (!res.headersSent) {
              writeJson(res, 500, { ok: false, error: err.message })
            } else {
              res.destroy(err)
            }
          })

          archive.pipe(res)

          for (const file of matchedFiles) {
            archive.file(file.fullPath, { name: file.name })
          }

          await archive.finalize()
          return
        } catch (e) {
          console.error("timelapse zip download error:", e)
          return writeJson(res, 500, { ok: false, error: e.message })
        }
      }

      // ==========================
      // Live JPEG
      // ==========================

      if (pathname === "/api/live/jpeg" && req.method === "GET") {
        const user = await requireLogin(req, res)
        if (!user) return

        const camId = safeNumber(reqUrl.searchParams.get("cam"), 1)

        const allowed = await canUserAccessCamera(user, camId)
        if (!allowed) {
          return writeText(res, 403, "FORBIDDEN")
        }

        const cam = await dbGet(`SELECT * FROM cameras WHERE id=?`, [camId])

        if (!cam) {
          return writeText(res, 404, "camera not found")
        }

        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-cache"
        })

        const ff = spawn("ffmpeg", [
          "-rtsp_transport", "tcp",
          "-i", cam.rtsp_url,
          "-frames:v", "1",
          "-f", "image2pipe",
          "-"
        ])

        ff.stdout.pipe(res)
        ff.stderr.on("data", d => console.log("FF:", d.toString()))
        ff.on("close", () => {
          try {
            res.end()
          } catch (_) { }
        })
        ff.on("error", err => {
          console.error("live jpeg ffmpeg error:", err)
          try {
            res.end()
          } catch (_) { }
        })

        return
      }

      // =================
      // Static files
      // =================

      const safeReqPath = pathname === "/" ? "/index.html" : pathname
      const filePath = path.join(dist, safeReqPath)

      if (
        fs.existsSync(filePath) &&
        fs.statSync(filePath).isFile() &&
        (filePath === dist || isInsideDir(dist, filePath) || filePath.startsWith(dist))
      ) {
        res.writeHead(200, {
          "Content-Type": guessContentType(filePath)
        })
        res.end(fs.readFileSync(filePath))
        return
      }

      const indexFile = path.join(dist, "index.html")
      if (fs.existsSync(indexFile)) {
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(fs.readFileSync(indexFile))
        return
      }

      writeText(res, 404, "index.html not found")
    } catch (e) {
      console.error("webApiServer fatal error:", e)
      writeJson(res, 500, { ok: false, error: e.message })
    }
  })

  server.listen(PORT, "0.0.0.0", () => {
    console.log("Web UI:", `http://${LOCAL_IP}:${PORT}`)
  })
}

module.exports = { startWebApiServer }