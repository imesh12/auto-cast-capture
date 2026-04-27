// server/utils/schedule.js

function normalizeDays(value) {
  if (!value && value !== 0) return [0, 1, 2, 3, 4, 5, 6]

  return String(value)
    .split(",")
    .map(v => Number(v.trim()))
    .filter(v => Number.isInteger(v) && v >= 0 && v <= 6)
}

function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function safeText(value) {
  return String(value || "").trim()
}

function getCaptureReadiness(camera) {
  const captureMode = safeText(camera?.capture_mode).toLowerCase()
  const rtspUrl = safeText(camera?.rtsp_url)
  const snapshotUrl = safeText(camera?.snapshot_url)

  const hasRtsp = !!rtspUrl
  const hasSnapshot = !!snapshotUrl

  if (captureMode === "rtsp") {
    if (!hasRtsp) {
      return {
        ok: false,
        reason: "missing_rtsp_url",
        captureMode,
        hasRtsp,
        hasSnapshot
      }
    }

    return {
      ok: true,
      captureMode,
      hasRtsp,
      hasSnapshot,
      primaryMethod: "rtsp"
    }
  }

  // default and snapshot mode both prefer snapshot-first behavior
  if (hasSnapshot) {
    return {
      ok: true,
      captureMode: captureMode || "snapshot",
      hasRtsp,
      hasSnapshot,
      primaryMethod: "snapshot"
    }
  }

  if (hasRtsp) {
    return {
      ok: true,
      captureMode: captureMode || "snapshot",
      hasRtsp,
      hasSnapshot,
      primaryMethod: "rtsp"
    }
  }

  return {
    ok: false,
    reason: "missing_capture_source",
    captureMode: captureMode || "snapshot",
    hasRtsp,
    hasSnapshot
  }
}

function getScheduleDecision(camera, now = new Date()) {
  const date = now instanceof Date ? now : new Date(now)

  const enabled = Number(camera?.enabled ?? 1) === 1
  const timelapseEnabled = Number(camera?.timelapse_enabled ?? 0) === 1

  if (!enabled) {
    return { ok: false, reason: "camera_disabled" }
  }

  if (!timelapseEnabled) {
    return { ok: false, reason: "timelapse_disabled" }
  }

  const readiness = getCaptureReadiness(camera)
  if (!readiness.ok) {
    return readiness
  }

  const day = date.getDay()
  const hour = date.getHours()

  const days = normalizeDays(camera?.tl_days)
  if (!days.includes(day)) {
    return { ok: false, reason: "day_not_selected", day, days }
  }

  const startHour = safeNumber(camera?.tl_start_hour, 0)
  const endHour = safeNumber(camera?.tl_end_hour, 24)

  if (!(startHour === 0 && endHour === 24)) {
    if (hour < startHour || hour >= endHour) {
      return {
        ok: false,
        reason: "outside_time_range",
        hour,
        startHour,
        endHour
      }
    }
  }

  const intervalSec = Math.max(1, safeNumber(camera?.tl_interval, 600))
  const lastRunMs = safeNumber(camera?.tl_last_run, 0)
  const nowMs = date.getTime()
  const elapsedMs = nowMs - lastRunMs

  if (lastRunMs > 0 && elapsedMs < intervalSec * 1000) {
    return {
      ok: false,
      reason: "interval_not_reached",
      intervalSec,
      elapsedMs,
      remainMs: intervalSec * 1000 - elapsedMs
    }
  }

  return {
    ok: true,
    reason: "run",
    day,
    hour,
    days,
    startHour,
    endHour,
    intervalSec,
    lastRunMs,
    nowMs,
    captureMode: readiness.captureMode,
    primaryMethod: readiness.primaryMethod,
    hasRtsp: readiness.hasRtsp,
    hasSnapshot: readiness.hasSnapshot
  }
}

module.exports = {
  normalizeDays,
  getScheduleDecision,
  getCaptureReadiness
}