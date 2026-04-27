// core/timelapse.js
const { spawn } = require("child_process")
const fs = require("fs")
const fsPromises = fs.promises
const path = require("path")
const crypto = require("crypto")
const net = require("net")
const dns = require("dns").promises
const state = require("./state")

const DEFAULT_TIMELAPSE_DIR = path.resolve("./data/timelapse")
const SNAPSHOT_TIMEOUT_MS = Number(process.env.SNAPSHOT_TIMEOUT_MS || 15000)
const RTSP_TIMEOUT_MS = Number(process.env.RTSP_TIMEOUT_MS || 30000)
const MIN_VALID_IMAGE_SIZE = Number(process.env.MIN_VALID_IMAGE_SIZE || 10000)
const MAX_SNAPSHOT_BYTES = Number(process.env.MAX_SNAPSHOT_BYTES || 10 * 1024 * 1024)

function sanitizeName(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .trim()
}

function safeText(value) {
  return String(value || "").trim()
}

async function ensureDir(dir) {
  await fsPromises.mkdir(dir, { recursive: true })
}

function isInsideDir(baseDir, targetPath) {
  const relative = path.relative(path.resolve(baseDir), path.resolve(targetPath))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function resolveSafeTimelapseBase(requestedDir) {
  if (!requestedDir || !String(requestedDir).trim()) {
    return DEFAULT_TIMELAPSE_DIR
  }

  const target = path.resolve(String(requestedDir).trim())

  const allowedPaths = [
    DEFAULT_TIMELAPSE_DIR,
    path.resolve("/mnt"),
    path.resolve("/media")
  ]

  if (process.env.TIMELAPSE_ALLOWED_BASES) {
    const envBases = process.env.TIMELAPSE_ALLOWED_BASES
      .split(",")
      .map(v => v.trim())
      .filter(Boolean)
      .map(v => path.resolve(v))
    allowedPaths.push(...envBases)
  }

  for (const base of allowedPaths) {
    if (isInsideDir(base, target)) {
      return target
    }
  }

  console.warn(
    `[Timelapse] Rejected unsafe path: ${target}. Falling back to default: ${DEFAULT_TIMELAPSE_DIR}`
  )
  return DEFAULT_TIMELAPSE_DIR
}

function getCameraFolder(camera) {
  const baseDir = resolveSafeTimelapseBase(camera?.tl_output_dir)
  const safeName = sanitizeName(
    camera?.tl_folder_name || camera?.name || `camera_${camera?.id || "unknown"}`
  )

  return path.join(baseDir, safeName)
}

function buildTimestampParts(now = new Date()) {
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  const hh = String(now.getHours()).padStart(2, "0")
  const mi = String(now.getMinutes()).padStart(2, "0")
  const ss = String(now.getSeconds()).padStart(2, "0")

  return {
    yyyy,
    mm,
    dd,
    hh,
    mi,
    ss,
    fileName: `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}.jpg`
  }
}

function buildVideoFromRange(camera, from, to, fps = 12, speed = 1) {
  return {
    ok: false,
    message: "buildVideoFromRange is not implemented in core/timelapse.js",
    cameraId: camera?.id ?? null,
    from,
    to,
    fps,
    speed
  }
}

async function sendAlert(cam, message = "") {
  console.log("🚨 CAMERA ERROR:", cam?.name || cam?.id, message || "")
}

async function removeFileIfExists(filePath) {
  try {
    await fsPromises.unlink(filePath)
  } catch (_) { }
}

function extractFfmpegError(stderrText = "", stdoutText = "") {
  const merged = [stderrText, stdoutText].filter(Boolean).join("\n").trim()
  if (!merged) return "unknown error"

  return merged
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean)
    .slice(-8)
    .join(" | ")
}

async function validateCapturedFile(filePath) {
  let stat
  try {
    stat = await fsPromises.stat(filePath)
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error("capture completed but output file was not created")
    }
    throw err
  }

  if (!stat.isFile()) {
    await removeFileIfExists(filePath)
    throw new Error("capture output is not a valid file")
  }

  if (stat.size < MIN_VALID_IMAGE_SIZE) {
    await removeFileIfExists(filePath)
    throw new Error("captured image is too small or invalid")
  }

  return stat
}

function md5(text) {
  return crypto.createHash("md5").update(text).digest("hex")
}

function parseDigestChallenge(headerValue) {
  const source = String(headerValue || "")
  const digestPart = source.replace(/^Digest\s+/i, "")
  const result = {}

  const regex = /(\w+)=("([^"]*)"|([^,]+))/g
  let match
  while ((match = regex.exec(digestPart)) !== null) {
    const key = match[1]
    const value = match[3] ?? match[4] ?? ""
    result[key] = value
  }

  return result
}

function buildDigestAuthHeader({
  username,
  password,
  method,
  uri,
  challenge,
  nc = "00000001"
}) {
  const realm = challenge.realm || ""
  const nonce = challenge.nonce || ""
  const qopRaw = challenge.qop || ""
  const opaque = challenge.opaque || ""
  const algorithm = (challenge.algorithm || "MD5").toUpperCase()

  if (!nonce) {
    throw new Error("digest challenge missing nonce")
  }

  if (algorithm !== "MD5") {
    throw new Error(`unsupported digest algorithm: ${algorithm}`)
  }

  const qop = qopRaw
    .split(",")
    .map(x => x.trim())
    .find(x => x === "auth") || ""

  const cnonce = crypto.randomBytes(8).toString("hex")

  const ha1 = md5(`${username}:${realm}:${password}`)
  const ha2 = md5(`${method}:${uri}`)

  let response
  if (qop) {
    response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
  } else {
    response = md5(`${ha1}:${nonce}:${ha2}`)
  }

  const parts = [
    `Digest username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
    `algorithm=${algorithm}`
  ]

  if (opaque) {
    parts.push(`opaque="${opaque}"`)
  }

  if (qop) {
    parts.push(`qop=${qop}`)
    parts.push(`nc=${nc}`)
    parts.push(`cnonce="${cnonce}"`)
  }

  return parts.join(", ")
}

function isPrivateIPv4(host) {
  return (
    host.startsWith("10.") ||
    host.startsWith("127.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  )
}

function isLoopbackOrLocalName(host) {
  const h = String(host || "").toLowerCase()
  return h === "localhost" || h.endsWith(".local")
}

async function resolveAndCheckHost(hostname, allowPrivate = false) {
  const host = String(hostname || "").trim()
  if (!host) {
    throw new Error("missing hostname")
  }

  if (isLoopbackOrLocalName(host)) {
    throw new Error("localhost/local hostnames are not allowed")
  }

  if (net.isIP(host)) {
    if (!allowPrivate && net.isIPv4(host) && isPrivateIPv4(host)) {
      throw new Error("private/local IP is not allowed")
    }
    if (host === "::1") {
      throw new Error("loopback IP is not allowed")
    }
    return
  }

  const records = await dns.lookup(host, { all: true })
  for (const rec of records) {
    if (!allowPrivate && rec.family === 4 && isPrivateIPv4(rec.address)) {
      throw new Error("resolved to private/local IP")
    }
    if (rec.address === "::1") {
      throw new Error("resolved to loopback")
    }
  }
}

async function validateSnapshotUrl(rawUrl) {
  const parsed = new URL(String(rawUrl || "").trim())

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("snapshot URL must use http or https")
  }

  const allowPrivate = process.env.ALLOW_PRIVATE_CAMERA_IPS === "true"
  await resolveAndCheckHost(parsed.hostname, allowPrivate)

  return parsed
}

async function validateRtspUrl(rawUrl) {
  const parsed = new URL(String(rawUrl || "").trim())

  if (!["rtsp:", "rtsps:"].includes(parsed.protocol)) {
    throw new Error("RTSP URL must use rtsp or rtsps")
  }

  const allowPrivate = process.env.ALLOW_PRIVATE_CAMERA_IPS === "true"
  await resolveAndCheckHost(parsed.hostname, allowPrivate)

  return parsed
}

async function fetchBuffer(url, options = {}) {
  const res = await fetch(url, options)

  if (!res.body) {
    return { res, buffer: Buffer.alloc(0) }
  }

  const chunks = []
  let total = 0

  for await (const chunk of res.body) {
    const buf = Buffer.from(chunk)
    total += buf.length

    if (total > MAX_SNAPSHOT_BYTES) {
      throw new Error("snapshot response too large")
    }

    chunks.push(buf)
  }

  return { res, buffer: Buffer.concat(chunks) }
}

async function captureSnapshot(rawUrl, filePath) {
  if (typeof fetch !== "function") {
    throw new Error("fetch is not available in this Node.js runtime")
  }

  const parsed = await validateSnapshotUrl(rawUrl)

  const username = decodeURIComponent(parsed.username || "")
  const password = decodeURIComponent(parsed.password || "")
  const pathnameWithQuery = `${parsed.pathname}${parsed.search}`

  parsed.username = ""
  parsed.password = ""

  const targetUrl = parsed.toString()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS)

  try {
    let { res, buffer } = await fetchBuffer(targetUrl, {
      method: "GET",
      signal: controller.signal
    })

    if (res.status === 401 && (username || password)) {
      const authHeader = res.headers.get("www-authenticate") || ""

      if (/digest/i.test(authHeader)) {
        const challenge = parseDigestChallenge(authHeader)
        const digestHeader = buildDigestAuthHeader({
          username,
          password,
          method: "GET",
          uri: pathnameWithQuery,
          challenge
        })

          ; ({ res, buffer } = await fetchBuffer(targetUrl, {
            method: "GET",
            headers: {
              Authorization: digestHeader
            },
            signal: controller.signal
          }))
      } else {
        const token = Buffer.from(`${username}:${password}`, "utf8").toString("base64")
          ; ({ res, buffer } = await fetchBuffer(targetUrl, {
            method: "GET",
            headers: {
              Authorization: `Basic ${token}`
            },
            signal: controller.signal
          }))
      }
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    await fsPromises.writeFile(filePath, buffer)
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`snapshot timed out after ${SNAPSHOT_TIMEOUT_MS}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

async function captureRtsp(rawUrl, filePath) {
  const parsed = await validateRtspUrl(rawUrl)
  const safeUrl = parsed.toString()

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      [
        "-y",
        "-rtsp_transport", "tcp",
        "-i", safeUrl,
        "-frames:v", "1",
        "-q:v", "2",
        filePath
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    )

    let stdout = ""
    let stderr = ""
    let settled = false

    function done(err) {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      if (err) reject(err)
      else resolve()
    }

    proc.stdout.on("data", d => {
      stdout += d.toString("utf8")
    })

    proc.stderr.on("data", d => {
      stderr += d.toString("utf8")
    })

    proc.on("error", err => {
      done(new Error(`ffmpeg spawn error: ${err.message}`))
    })

    const timeout = setTimeout(() => {
      try {
        proc.kill("SIGKILL")
      } catch (_) { }
      done(new Error(`ffmpeg timed out after ${RTSP_TIMEOUT_MS}ms`))
    }, RTSP_TIMEOUT_MS)

    proc.on("close", code => {
      if (code !== 0) {
        done(new Error(`ffmpeg exited with code ${code}: ${extractFfmpegError(stderr, stdout)}`))
      } else {
        done()
      }
    })
  })
}

async function runTimelapse(ctx = {}) {
  const { camera, now = new Date() } = ctx

  if (!camera) {
    throw new Error("camera is required")
  }

  if (state && state.manualRun === false && ctx.manualOnly === true) {
    throw new Error("manualOnly requested but manualRun is false")
  }

  const dir = getCameraFolder(camera)
  await ensureDir(dir)

  const { fileName } = buildTimestampParts(now)
  const filePath = path.join(dir, fileName)

  const captureMode = safeText(camera?.capture_mode || "snapshot").toLowerCase()
  const snapshotUrl = safeText(camera?.snapshot_url)
  const rtspUrl = safeText(camera?.rtsp_url)

  if (snapshotUrl && !/^https?:\/\//i.test(snapshotUrl)) {
    throw new Error("invalid snapshot URL")
  }

  if (rtspUrl && !/^rtsps?:\/\//i.test(rtspUrl)) {
    throw new Error("invalid RTSP URL")
  }

  let usedMethod = "rtsp"

  if (captureMode === "snapshot" && snapshotUrl) {
    try {
      await captureSnapshot(snapshotUrl, filePath)
      usedMethod = "snapshot"
    } catch (err) {
      console.warn(
        `[${camera.name || camera.id}] Snapshot fetch failed (${err.message}). Falling back to RTSP.`
      )
    }
  }

  if (usedMethod !== "snapshot") {
    if (!rtspUrl) {
      throw new Error("RTSP URL is missing and snapshot failed or was not configured")
    }

    try {
      await captureRtsp(rtspUrl, filePath)
      usedMethod = "rtsp"
    } catch (err) {
      await removeFileIfExists(filePath)
      throw err
    }
  }

  const stat = await validateCapturedFile(filePath)

  return [
    {
      type: "TIMELAPSE_CAPTURED",
      level: "info",
      camera_id: camera.id,
      meta: {
        file: filePath,
        size: stat.size,
        folder: dir,
        method: usedMethod
      }
    }
  ]
}

module.exports = {
  runTimelapse,
  sendAlert,
  getCameraFolder,
  buildVideoFromRange,
  resolveSafeTimelapseBase
}