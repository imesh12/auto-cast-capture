// core/timelapseVideo.js
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { spawn } = require("child_process")
const { getCameraFolder } = require("./timelapse")

const DEFAULT_FPS = 12
const DEFAULT_SPEED = 1
const DEFAULT_WIDTH = 1280

const MIN_FPS = 1
const MAX_BASE_FPS = 60
const MAX_OUTPUT_FPS = 60
const ALLOWED_SPEEDS = new Set([1, 2, 4, 8, 16, 32, 64])

const MIN_WIDTH = 320
const MAX_WIDTH = 3840
const MAX_IMAGES = Number(process.env.TIMELAPSE_MAX_IMAGES || 50000)
const FFMPEG_TIMEOUT_MS = Number(process.env.TIMELAPSE_VIDEO_TIMEOUT_MS || 30 * 60 * 1000) // 30 min
const STDERR_LIMIT = 16000
const JPG_REGEX = /\.jpe?g$/i

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function removeDirSafe(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  } catch (err) {
    console.warn("[timelapseVideo] temp cleanup failed:", err.message)
  }
}

function sanitizeName(value) {
  return String(value || "camera")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim() || "camera"
}

function formatDate(ts) {
  const d = new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return "invalid-date"

  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")

  return `${yyyy}-${mm}-${dd}_${hh}-${mi}`
}

function toSafeNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function emitProgress(onProgress, payload) {
  if (typeof onProgress === "function") {
    try {
      onProgress(payload)
    } catch (err) {
      console.warn("[timelapseVideo] progress callback error:", err.message)
    }
  }
}

function createWorkDir(cameraId) {
  const baseTmpDir = path.join(process.cwd(), "data", "tmp")
  ensureDir(baseTmpDir)

  const unique = `tl_${cameraId}_${Date.now()}_${process.pid}_${crypto.randomBytes(4).toString("hex")}`
  const workDir = path.join(baseTmpDir, unique)
  ensureDir(workDir)

  return workDir
}

function linkOrCopy(src, dst) {
  try {
    fs.linkSync(src, dst)
    return "hardlink"
  } catch (_) {
    fs.copyFileSync(src, dst)
    return "copy"
  }
}

function parseFormattedDateFilename(name) {
  const base = path.basename(name, path.extname(name))
  const m = base.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/)
  if (!m) return NaN

  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = Number(m[4])
  const minute = Number(m[5])
  const second = Number(m[6])

  const dt = new Date(year, month - 1, day, hour, minute, second, 0)
  return dt.getTime()
}

function getImageTimestamp(fullPath, name) {
  const numericName = Number(path.basename(name, path.extname(name)))
  if (Number.isFinite(numericName) && numericName > 0) {
    return numericName
  }

  const formattedNameTs = parseFormattedDateFilename(name)
  if (Number.isFinite(formattedNameTs) && formattedNameTs > 0) {
    return formattedNameTs
  }

  try {
    const stat = fs.statSync(fullPath)
    return Number(stat.mtimeMs || 0)
  } catch (_) {
    return 0
  }
}

function isValidJpegFile(filePath) {
  try {
    const stat = fs.statSync(filePath)
    return stat.isFile() && stat.size > 0
  } catch (_) {
    return false
  }
}

function collectImages(srcDir, fromTs, toTs) {
  return fs.readdirSync(srcDir)
    .filter(name => JPG_REGEX.test(name))
    .map(name => {
      const full = path.join(srcDir, name)
      const ts = getImageTimestamp(full, name)

      return {
        name,
        full,
        time: ts
      }
    })
    .filter(item =>
      Number.isFinite(item.time) &&
      item.time > 0 &&
      item.time >= fromTs &&
      item.time <= toTs &&
      isValidJpegFile(item.full)
    )
    .sort((a, b) => a.time - b.time)
}

function validateInputs(camera, from, to, fps, speed, width) {
  if (!camera || !camera.id) {
    throw new Error("INVALID CAMERA")
  }

  const fromTs = toSafeNumber(from, NaN)
  const toTs = toSafeNumber(to, NaN)

  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) {
    throw new Error("INVALID DATE RANGE")
  }

  if (fromTs >= toTs) {
    throw new Error("FROM MUST BE LESS THAN TO")
  }

  let baseFps = toSafeNumber(fps, DEFAULT_FPS)
  baseFps = clamp(Math.round(baseFps), MIN_FPS, MAX_BASE_FPS)

  let speedFactor = toSafeNumber(speed, DEFAULT_SPEED)
  if (!ALLOWED_SPEEDS.has(speedFactor)) {
    speedFactor = DEFAULT_SPEED
  }

  let outputWidth = toSafeNumber(width, DEFAULT_WIDTH)
  outputWidth = clamp(Math.round(outputWidth), MIN_WIDTH, MAX_WIDTH)

  const inputFrameRate = baseFps * speedFactor
  const outputFps = clamp(baseFps, MIN_FPS, MAX_OUTPUT_FPS)

  return {
    fromTs,
    toTs,
    baseFps,
    speedFactor,
    outputWidth,
    inputFrameRate,
    outputFps
  }
}

function uniqueOutputPath(outDir, filename) {
  const ext = path.extname(filename)
  const base = path.basename(filename, ext)

  let attempt = path.join(outDir, filename)
  let index = 1

  while (fs.existsSync(attempt)) {
    attempt = path.join(outDir, `${base}_${index}${ext}`)
    index += 1
  }

  return attempt
}

function trimErrorText(text) {
  const value = String(text || "").trim()
  if (!value) return ""
  return value.length > STDERR_LIMIT ? value.slice(-STDERR_LIMIT) : value
}

async function buildVideoFromRange(
  camera,
  from,
  to,
  fps = DEFAULT_FPS,
  speed = DEFAULT_SPEED,
  width = DEFAULT_WIDTH,
  onProgress = null
) {
  const {
    fromTs,
    toTs,
    baseFps,
    speedFactor,
    outputWidth,
    inputFrameRate,
    outputFps
  } = validateInputs(camera, from, to, fps, speed, width)

  const srcDir = getCameraFolder(camera)
  const outDir = path.join(process.cwd(), "data", "exports")

  ensureDir(outDir)

  if (!fs.existsSync(srcDir)) {
    throw new Error(`SOURCE FOLDER NOT FOUND: ${srcDir}`)
  }

  emitProgress(onProgress, {
    percent: 3,
    stage: "Collecting images..."
  })

  const files = collectImages(srcDir, fromTs, toTs)

  if (files.length === 0) {
    throw new Error("NO IMAGES FOUND IN SELECTED RANGE")
  }

  if (files.length < 2) {
    throw new Error("AT LEAST 2 IMAGES ARE REQUIRED")
  }

  if (files.length > MAX_IMAGES) {
    throw new Error(`TOO MANY IMAGES SELECTED (MAX ${MAX_IMAGES})`)
  }

  const workDir = createWorkDir(camera.id)
  const safeCameraName = sanitizeName(camera.name || `camera_${camera.id}`)
  const startLabel = formatDate(files[0].time)
  const endLabel = formatDate(files[files.length - 1].time)
  const baseFilename = `${safeCameraName}_${startLabel}_to_${endLabel}_x${speedFactor}.mp4`
  const outFile = uniqueOutputPath(outDir, baseFilename)
  const filename = path.basename(outFile)

  let linkMode = "copy"

  try {
    emitProgress(onProgress, {
      percent: 5,
      stage: `Preparing images 0/${files.length}`
    })

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const sequenceName = `${String(i + 1).padStart(6, "0")}.jpg`
      const dst = path.join(workDir, sequenceName)

      const mode = linkOrCopy(file.full, dst)
      if (i === 0) linkMode = mode

      if ((i + 1) % 25 === 0 || i === files.length - 1) {
        const percent = 5 + Math.round(((i + 1) / files.length) * 20)
        emitProgress(onProgress, {
          percent,
          stage: `Preparing images ${i + 1}/${files.length}`
        })
      }
    }

    const estimatedDurationSec = files.length / inputFrameRate

    return await new Promise((resolve, reject) => {
      let stderrText = ""
      let stdoutBuffer = ""
      let settled = false

      function done(err, result) {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        if (err) reject(err)
        else resolve(result)
      }

      emitProgress(onProgress, {
        percent: 28,
        stage: "Starting ffmpeg..."
      })

      const ffmpegArgs = [
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-framerate", String(inputFrameRate),
        "-i", path.join(workDir, "%06d.jpg"),
        "-vf", `scale=${outputWidth}:-2`,
        "-r", String(outputFps),
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-progress", "pipe:1",
        "-nostats",
        outFile
      ]

      const ff = spawn("ffmpeg", ffmpegArgs, {
        stdio: ["ignore", "pipe", "pipe"]
      })

      const timeoutId = setTimeout(() => {
        try {
          ff.kill("SIGKILL")
        } catch (_) { }
        done(new Error(`FFMPEG TIMED OUT AFTER ${Math.round(FFMPEG_TIMEOUT_MS / 1000)}s`))
      }, FFMPEG_TIMEOUT_MS)

      ff.stdout.on("data", chunk => {
        stdoutBuffer += chunk.toString()

        const lines = stdoutBuffer.split(/\r?\n/)
        stdoutBuffer = lines.pop() || ""

        for (const line of lines) {
          const idx = line.indexOf("=")
          if (idx === -1) continue

          const key = line.slice(0, idx)
          const value = line.slice(idx + 1)

          if (key === "out_time_ms") {
            const encodedSec = Number(value) / 1000000
            const ratio = estimatedDurationSec > 0
              ? Math.min(encodedSec / estimatedDurationSec, 1)
              : 0

            const percent = 28 + Math.round(ratio * 71)

            emitProgress(onProgress, {
              percent,
              stage: `Encoding... ${percent}%`
            })
          }

          if (key === "progress" && value === "end") {
            emitProgress(onProgress, {
              percent: 100,
              stage: "Finished"
            })
          }
        }
      })

      ff.stderr.on("data", chunk => {
        stderrText += chunk.toString()
        stderrText = trimErrorText(stderrText)
      })

      ff.on("error", err => {
        done(new Error(`FFMPEG START FAILED: ${err.message}`))
      })

      ff.on("close", code => {
        if (code !== 0) {
          return done(
            new Error(
              stderrText
                ? `FFMPEG FAILED (${code}): ${stderrText}`
                : `FFMPEG FAILED WITH CODE ${code}`
            )
          )
        }

        let fileSize = 0
        try {
          const stat = fs.statSync(outFile)
          if (!stat.isFile() || stat.size <= 0) {
            return done(new Error("OUTPUT VIDEO WAS NOT CREATED CORRECTLY"))
          }
          fileSize = stat.size
        } catch (err) {
          return done(new Error(`FAILED TO VERIFY OUTPUT FILE: ${err.message}`))
        }

        done(null, {
          ok: true,
          file: outFile,
          url: `/exports/${encodeURIComponent(filename)}`,
          filename,
          imageCount: files.length,
          from: files[0].time,
          to: files[files.length - 1].time,
          fps: baseFps,
          speed: speedFactor,
          inputFrameRate,
          outputFps,
          width: outputWidth,
          estimatedDurationSec,
          fileSize,
          tempMode: linkMode
        })
      })
    })
  } finally {
    removeDirSafe(workDir)
  }
}

module.exports = {
  buildVideoFromRange,
  getImageTimestamp
}