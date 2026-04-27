const http = require("http")
const { spawn } = require("child_process")

function safeJsonParse(text, fallback = {}) {
  try {
    return JSON.parse(text || "{}")
  } catch {
    return fallback
  }
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  })
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
  })
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}
//const { spawn } = require("child_process")

function playSpeakerClip(ip, file) {

  const url =
    `https://${ip}/axis-cgi/playclip.cgi?location=${file}`

  const cmd = spawn("curl", [
    "-k",
    "--digest",
    "-u",
    "root:Cw8839629",
    url
  ])

  cmd.stdout.on("data", (d) => {
    console.log("AXIS:", d.toString())
  })

  cmd.stderr.on("data", (d) => {
    console.log("AXIS ERR:", d.toString())
  })

  cmd.on("close", (code) => {
    console.log("AXIS CLIP END:", code)
  })

  return { ok: true }
}

module.exports = {
  playSpeakerClip
}

/*
async function playSpeakerClip(ip, clipPath, stopAfterMs = 3000) {
  return new Promise((resolve, reject) => {
    if (!ip) {
      resolve({ ok: false, error: "speaker ip missing" })
      return
    }

    const playUrl =
      `http://${ip}/axis-cgi/playclip.cgi?location=${encodeURIComponent(clipPath)}`

    http.get(playUrl, (res) => {
      res.resume()

      setTimeout(() => {
        const stopUrl = `http://${ip}/axis-cgi/stopclip.cgi`
        http.get(stopUrl, (stopRes) => {
          stopRes.resume()
          resolve({ ok: true })
        }).on("error", (err) => {
          resolve({ ok: false, error: `stop error: ${err.message}` })
        })
      }, stopAfterMs)
    }).on("error", (err) => {
      resolve({ ok: false, error: `play error: ${err.message}` })
    })
  })
}
*/
function matchCondition(eventRow, condition) {
  if (condition.level && condition.level !== eventRow.level) return false
  if (condition.source && condition.source !== eventRow.source) return false
  if (condition.camera_id && Number(condition.camera_id) !== Number(eventRow.camera_id)) return false
  if (condition.status && condition.status !== eventRow.status) return false
  return true
}

async function executeRuleAction(db, eventRow, action) {
  const result = {
    played: false,
    updated: false,
    logs: []
  }

  if (action.set_status) {
    await dbRun(
      db,
      `UPDATE events SET status=? WHERE id=?`,
      [action.set_status, eventRow.id]
    )
    result.updated = true
    result.logs.push(`event status -> ${action.set_status}`)
  }

  if (action.speaker_id || action.clip_id || action.clip_path) {
    let speakerId = action.speaker_id || eventRow.speaker_id
    let clipPath = action.clip_path || null

    if (!clipPath && action.clip_id) {
      const clip = await dbGet(
        db,
        `SELECT * FROM clips WHERE id=? AND enabled=1`,
        [action.clip_id]
      )
      if (clip) {
        clipPath = clip.file_path
        if (!speakerId && clip.speaker_id) speakerId = clip.speaker_id
      }
    }

    if (speakerId) {
      const speaker = await dbGet(
        db,
        `SELECT * FROM speakers WHERE id=?`,
        [speakerId]
      )

      if (speaker && clipPath) {
        const ip = speaker.ip || speaker.rtp_ip
        const played = await playSpeakerClip(ip, clipPath, action.stop_after_ms || 3000)
        result.played = played.ok
        result.logs.push(
          played.ok
            ? `speaker played: ${clipPath}`
            : `speaker failed: ${played.error}`
        )
      } else {
        result.logs.push("speaker action skipped: speaker or clip missing")
      }
    }
  }

  return result
}

async function processRules(db, eventRow) {
  const rules = await dbAll(
    db,
    `SELECT * FROM rules WHERE enabled=1 AND event_type=? ORDER BY id`,
    [eventRow.type]
  )

  const actionResults = []

  for (const rule of rules) {
    const condition = safeJsonParse(rule.condition_json, {})
    const action = safeJsonParse(rule.action_json, {})

    if (!matchCondition(eventRow, condition)) continue

    const actionResult = await executeRuleAction(db, eventRow, action)

    actionResults.push({
      rule_id: rule.id,
      rule_name: rule.name,
      ...actionResult
    })
  }

  return actionResults
}

async function createEvent(db, payload = {}) {
  const eventData = {
    type: payload.type || "manual",
    level: payload.level || "info",
    source: payload.source || "manual",
    title: payload.title || "イベント",
    message: payload.message || "",
    lat: payload.lat ?? null,
    lng: payload.lng ?? null,
    camera_id: payload.camera_id ?? null,
    speaker_id: payload.speaker_id ?? null,
    zone_id: payload.zone_id ?? null,
    status: payload.status || "open",
    operator: payload.operator || "system"
  }

  if ((eventData.lat == null || eventData.lng == null) && eventData.camera_id) {
    const cam = await dbGet(
      db,
      `SELECT lat,lng FROM cameras WHERE id=?`,
      [eventData.camera_id]
    )
    if (cam) {
      if (eventData.lat == null) eventData.lat = cam.lat
      if (eventData.lng == null) eventData.lng = cam.lng
    }
  }

  const inserted = await dbRun(
    db,
    `INSERT INTO events
     (type, level, source, title, message, lat, lng, camera_id, speaker_id, zone_id, status, operator)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      eventData.type,
      eventData.level,
      eventData.source,
      eventData.title,
      eventData.message,
      eventData.lat,
      eventData.lng,
      eventData.camera_id,
      eventData.speaker_id,
      eventData.zone_id,
      eventData.status,
      eventData.operator
    ]
  )

  const eventRow = await dbGet(db, `SELECT * FROM events WHERE id=?`, [inserted.lastID])
  const ruleResults = await processRules(db, eventRow)

  return {
    ok: true,
    event: eventRow,
    ruleResults
  }
}

async function closeEvent(db, eventId, operator = "system") {
  await dbRun(
    db,
    `UPDATE events
     SET status='closed',
         closed_at=datetime('now','localtime'),
         operator=?
     WHERE id=?`,
    [operator, eventId]
  )

  const row = await dbGet(db, `SELECT * FROM events WHERE id=?`, [eventId])
  return { ok: true, event: row }
}

async function listEvents(db, limit = 100) {
  return await dbAll(
    db,
    `SELECT e.*,
            c.name AS camera_name,
            s.name AS speaker_name
     FROM events e
     LEFT JOIN cameras c ON e.camera_id = c.id
     LEFT JOIN speakers s ON e.speaker_id = s.id
     ORDER BY e.id DESC
     LIMIT ?`,
    [limit]
  )
}

async function getOpenEvents(db) {
  return await dbAll(
    db,
    `SELECT e.*,
            c.name AS camera_name,
            s.name AS speaker_name
     FROM events e
     LEFT JOIN cameras c ON e.camera_id = c.id
     LEFT JOIN speakers s ON e.speaker_id = s.id
     WHERE e.status <> 'closed'
     ORDER BY e.id DESC`
  )
}

async function saveRule(db, data) {
  const res = await dbRun(
    db,
    `INSERT INTO rules (name, event_type, condition_json, action_json, enabled)
     VALUES (?,?,?,?,?)`,
    [
      data.name,
      data.event_type,
      JSON.stringify(data.condition_json || {}),
      JSON.stringify(data.action_json || {}),
      typeof data.enabled === "number" ? data.enabled : 1
    ]
  )

  return { ok: true, id: res.lastID }
}

async function updateRule(db, data) {
  await dbRun(
    db,
    `UPDATE rules
     SET name=?, event_type=?, condition_json=?, action_json=?, enabled=?
     WHERE id=?`,
    [
      data.name,
      data.event_type,
      JSON.stringify(data.condition_json || {}),
      JSON.stringify(data.action_json || {}),
      typeof data.enabled === "number" ? data.enabled : 1,
      data.id
    ]
  )
  return { ok: true }
}

async function listRules(db) {
  const rows = await dbAll(db, `SELECT * FROM rules ORDER BY id DESC`)
  return rows.map(r => ({
    ...r,
    condition_json: safeJsonParse(r.condition_json, {}),
    action_json: safeJsonParse(r.action_json, {})
  }))
}

async function saveClip(db, data) {
  const res = await dbRun(
    db,
    `INSERT INTO clips (name, speaker_id, clip_no, text, file_path, enabled)
     VALUES (?,?,?,?,?,?)`,
    [
      data.name,
      data.speaker_id ?? null,
      data.clip_no ?? null,
      data.text || "",
      data.file_path || "",
      typeof data.enabled === "number" ? data.enabled : 1
    ]
  )
  return { ok: true, id: res.lastID }
}

async function updateClip(db, data) {
  await dbRun(
    db,
    `UPDATE clips
     SET name=?, speaker_id=?, clip_no=?, text=?, file_path=?, enabled=?
     WHERE id=?`,
    [
      data.name,
      data.speaker_id ?? null,
      data.clip_no ?? null,
      data.text || "",
      data.file_path || "",
      typeof data.enabled === "number" ? data.enabled : 1,
      data.id
    ]
  )
  return { ok: true }
}

async function listClips(db) {
  return await dbAll(
    db,
    `SELECT c.*, s.name AS speaker_name
     FROM clips c
     LEFT JOIN speakers s ON c.speaker_id = s.id
     ORDER BY c.id DESC`
  )
}

module.exports = {
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
}