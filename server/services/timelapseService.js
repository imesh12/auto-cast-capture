// /home/comworks/AutoviewPro/server/services/timelapseService.js
const fs = require("fs")
const state = require("../../core/state")
const { getScheduleDecision } = require("../utils/schedule")
const { getCameraFolder } = require("../../core/timelapse")

function createTimelapseService(ctx) {
  const {
    dbAll,
    dbRun,
    runTimelapse,
    sendAlert
  } = ctx

  let started = false
  let timer = null
  let running = false
  const failCounts = new Map()

  function addLog(type, msg) {
    state.logs = state.logs || []
    state.logs.unshift({
      time: Date.now(),
      type,
      msg
    })

    if (state.logs.length > 100) {
      state.logs.pop()
    }
  }

  async function updateCameraStatus(cameraId, data = {}) {
    const fields = []
    const params = []

    if ("tl_last_run" in data) {
      fields.push("tl_last_run = ?")
      params.push(data.tl_last_run)
    }

    if ("tl_last_file_at" in data) {
      fields.push("tl_last_file_at = ?")
      params.push(data.tl_last_file_at)
    }

    if ("tl_status" in data) {
      fields.push("tl_status = ?")
      params.push(data.tl_status)
    }

    if ("last_error" in data) {
      fields.push("last_error = ?")
      params.push(data.last_error)
    }

    if ("tl_is_running" in data) {
      fields.push("tl_is_running = ?")
      params.push(data.tl_is_running)
    }

    if (!fields.length) return

    fields.push("updated_at = datetime('now','localtime')")
    params.push(cameraId)

    await dbRun(
      `UPDATE cameras SET ${fields.join(", ")} WHERE id = ?`,
      params
    )
  }

  async function insertTimelapseEvent(camera, now, options = {}) {
    const manual = !!options.manual
    const title = manual ? "Manual Timelapse Capture" : "Timelapse Capture"
    const message = manual
      ? `Manual timelapse captured for camera ${camera.name || camera.id}`
      : `Scheduled timelapse captured for camera ${camera.name || camera.id}`

    await dbRun(`
      INSERT INTO events (
        type,
        level,
        source,
        title,
        message,
        camera_id,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    `, [
      "timelapse",
      "info",
      manual ? "manual" : "system",
      title,
      message,
      camera.id,
      "open"
    ])
  }

  function statusFromDecisionReason(reason) {
    if (reason === "day_not_selected") return "waiting_day"
    if (reason === "outside_time_range") return "waiting_time"
    if (reason === "interval_not_reached") return "waiting_interval"
    if (reason === "missing_rtsp_url") return "error"
    if (reason === "timelapse_disabled") return "stopped"
    if (reason === "camera_disabled") return "stopped"
    return "stopped"
  }

  function messageFromDecision(camera, decision) {
    const name = camera.name || `camera_${camera.id}`

    if (decision.reason === "day_not_selected") {
      return `[${name}] 待機: 本日は撮影対象曜日ではありません`
    }

    if (decision.reason === "outside_time_range") {
      return `[${name}] 待機: 撮影時間外です (${String(decision.startHour).padStart(2, "0")}:00〜${String(decision.endHour).padStart(2, "0")}:00)`
    }

    if (decision.reason === "interval_not_reached") {
      const remainSec = Math.max(
        0,
        Math.ceil((decision.intervalSec * 1000 - decision.elapsedMs) / 1000)
      )
      return `[${name}] 待機: 次回撮影まで ${remainSec} 秒`
    }

    if (decision.reason === "missing_rtsp_url") {
      return `[${name}] エラー: RTSP URL が未設定です`
    }

    return `[${name}] 待機`
  }

  async function setCameraStopped(cameraId) {
    await updateCameraStatus(cameraId, {
      tl_is_running: 0,
      tl_status: "stopped",
      last_error: ""
    })
  }

  async function setAllEnabledCamerasToStopped() {
    const cameras = await dbAll(`
      SELECT id
      FROM cameras
      WHERE enabled = 1
      ORDER BY id
    `)

    for (const cam of cameras) {
      await setCameraStopped(cam.id)
    }
  }

  async function ensureCameraFolderForLog(camera) {
    const folder = getCameraFolder(camera)

    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true })
      addLog("warn", `[${camera.name || camera.id}] 保存フォルダを再作成しました: ${folder}`)
    }

    return folder
  }

  async function runCameraNow(camera, now = new Date(), options = {}) {
    const nowMs = now.getTime()
    const manual = !!options.manual

    try {
      await ensureCameraFolderForLog(camera)

      await updateCameraStatus(camera.id, {
        tl_is_running: 1,
        tl_status: "capturing",
        last_error: ""
      })

      const events = await runTimelapse({
        camera,
        now
      })

      const capturedEvent =
        Array.isArray(events)
          ? events.find(e => e && e.type === "TIMELAPSE_CAPTURED")
          : null

      if (!capturedEvent) {
        throw new Error("capture finished without TIMELAPSE_CAPTURED event")
      }

      failCounts.set(camera.id, 0)

      await updateCameraStatus(camera.id, {
        tl_last_run: nowMs,
        tl_last_file_at: nowMs,
        tl_is_running: 0,
        tl_status: "ok",
        last_error: ""
      })

      await insertTimelapseEvent(camera, now, { manual })

      addLog("info", `[${camera.name || camera.id}] 撮影成功`)

      return {
        ok: true,
        events
      }
    } catch (err) {
      const msg = String(err?.message || err)
      const count = (failCounts.get(camera.id) || 0) + 1
      failCounts.set(camera.id, count)

      await updateCameraStatus(camera.id, {
        tl_is_running: 0,
        tl_status: "error",
        last_error: msg
      })

      addLog("error", `[${camera.name || camera.id}] 撮影失敗: ${msg}`)

      if (count >= 3 && typeof sendAlert === "function") {
        try {
          await sendAlert(camera)
          addLog("warn", `[${camera.name || camera.id}] アラート送信`)
        } catch (alertErr) {
          addLog("error", `[${camera.name || camera.id}] アラート送信失敗: ${alertErr.message}`)
        }
        failCounts.set(camera.id, 0)
      }

      return {
        ok: false,
        error: msg
      }
    }
  }

  async function checkOnce() {
    if (running) {
      addLog("debug", "Scheduler skip: previous cycle still running")
      return
    }

    running = true

    try {
      const now = new Date()
      const cameras = await dbAll(`
        SELECT *
        FROM cameras
        WHERE enabled = 1
          AND timelapse_enabled = 1
        ORDER BY id
      `)

      for (const camera of cameras) {
        const decision = getScheduleDecision(camera, now)

        if (!decision.ok) {
          const nextStatus = statusFromDecisionReason(decision.reason)
          const nextError = decision.reason === "missing_rtsp_url"
            ? "RTSP URL が未設定です"
            : ""

          await updateCameraStatus(camera.id, {
            tl_is_running: 0,
            tl_status: nextStatus,
            last_error: nextError
          })

          continue
        }

        await runCameraNow(camera, now, { manual: false })
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (err) {
      addLog("error", `Scheduler error: ${String(err.message || err)}`)
      console.error("timelapseService.checkOnce error:", err)
    } finally {
      running = false
    }
  }

  function start() {
    if (started) {
      addLog("warn", "Scheduler already started")
      return { ok: true, alreadyStarted: true }
    }

    started = true
    state.manualRun = false
    addLog("info", "Timelapse scheduler started")

    timer = setInterval(() => {
      checkOnce().catch(err => {
        console.error("timelapseService interval error:", err)
      })
    }, 10000)

    checkOnce().catch(err => {
      console.error("timelapseService initial run error:", err)
    })

    return { ok: true }
  }

  async function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }

    started = false
    state.manualRun = false

    try {
      await setAllEnabledCamerasToStopped()
    } catch (err) {
      console.error("timelapseService stop status update error:", err)
      addLog("error", `Stop status update failed: ${String(err.message || err)}`)
    }

    addLog("info", "Timelapse scheduler stopped")

    return { ok: true }
  }

  function getStatus() {
    return {
      running: started,
      checking: running
    }
  }

  async function runNowByCameraId(cameraId) {
    const cams = await dbAll(`SELECT * FROM cameras WHERE id = ?`, [cameraId])
    const camera = cams[0]

    if (!camera) {
      return { ok: false, error: "camera not found" }
    }

    return await runCameraNow(camera, new Date(), { manual: true })
  }

  return {
    start,
    stop,
    getStatus,
    checkOnce,
    runNowByCameraId,
    addLog
  }
}

module.exports = {
  createTimelapseService
}