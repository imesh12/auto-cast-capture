const { spawn, execSync } = require("child_process")

let gst = null

const GRID = {
  1: { cols: 1, rows: 1 },
  4: { cols: 2, rows: 2 },
  9: { cols: 3, rows: 3 },
  12: { cols: 4, rows: 3 }
}

function getGrid(count) {
  return GRID[count] || GRID[1]
}

function killProc(p) {
  if (!p) return

  try {
    p.kill("SIGTERM")
  } catch (_) {}

  setTimeout(() => {
    try {
      p.kill("SIGKILL")
    } catch (_) {}
  }, 1000)
}

function getDisplayEnv() {
  return {
    ...process.env,
    DISPLAY: process.env.DISPLAY || ":0",
    XAUTHORITY: process.env.XAUTHORITY || "/home/comworks/.Xauthority"
  }
}

function getScreenSize() {
  try {
    const env = getDisplayEnv()
    const out = execSync("xrandr --current", {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })

    const primaryMatch = out.match(/(\d+)x(\d+)\+\d+\+\d+\s+primary/)
    if (primaryMatch) {
      const width = Number(primaryMatch[1])
      const height = Number(primaryMatch[2])

      if (width > 0 && height > 0) {
        return { width, height }
      }
    }

    const currentMatch = out.match(/current\s+(\d+)\s+x\s+(\d+)/)
    if (currentMatch) {
      const width = Number(currentMatch[1])
      const height = Number(currentMatch[2])

      if (width > 0 && height > 0) {
        return { width, height }
      }
    }
  } catch (err) {
    console.log("getScreenSize fallback:", err.message)
  }

  return { width: 1280, height: 720 }
}

function getSafeCanvasSize() {
  const screen = getScreenSize()

  const margin = 80
  const maxWidth = Math.max(800, screen.width - margin)
  const maxHeight = Math.max(500, screen.height - margin)

  const ratio = 16 / 9

  let width = maxWidth
  let height = Math.floor(width / ratio)

  if (height > maxHeight) {
    height = maxHeight
    width = Math.floor(height * ratio)
  }

  width = Math.max(800, width)
  height = Math.max(450, height)

  width = width - (width % 2)
  height = height - (height % 2)

  return { width, height, screen }
}

function sanitizeOverlayText(value, fallback) {
  const text = String(value || fallback || "")
    .replace(/'/g, "")
    .replace(/"/g, "")
    .replace(/[:]/g, "-")
    .trim()

  return text || fallback || "CAM"
}

function getSinkChain() {
  return [
    "ximagesink",
    "handle-events=false",
    "sync=false",
    "force-aspect-ratio=true"
  ]
}

function buildCmd(items, count) {
  const { width: W, height: H, screen } = getSafeCanvasSize()
  const { cols, rows } = getGrid(count)

  const tileW = Math.floor(W / cols)
  const tileH = Math.floor(H / rows)

  const cmd = [
    "compositor",
    "name=comp",
    "background=black"
  ]

  for (let i = 0; i < count; i++) {
    const x = (i % cols) * tileW
    const y = Math.floor(i / cols) * tileH

    cmd.push(`sink_${i}::xpos=${x}`)
    cmd.push(`sink_${i}::ypos=${y}`)
    cmd.push(`sink_${i}::width=${tileW}`)
    cmd.push(`sink_${i}::height=${tileH}`)
  }

  for (let i = 0; i < count; i++) {
    const cam = items[i]

    if (cam && cam.url) {
      const label = sanitizeOverlayText(cam.name, `CAM${i + 1}`)

      cmd.push(
        "rtspsrc",
        `location=${cam.url}`,
        "latency=200",
        "protocols=tcp",
        "retry=5",
        "timeout=5000000",
        "tcp-timeout=5000000",
        "do-rtsp-keep-alive=true",
        "!",
        "rtph264depay",
        "!",
        "h264parse",
        "!",
        "avdec_h264",
        "!",
        "queue",
        "leaky=downstream",
        "max-size-buffers=30",
        "!",
        "videoconvert",
        "!",
        "videoscale",
        "!",
        `video/x-raw,width=${tileW},height=${tileH},pixel-aspect-ratio=1/1`,
        "!",
        "textoverlay",
        `text=${label}`,
        "valignment=top",
        "halignment=left",
        "font-desc=Sans 18",
        "shaded-background=true",
        "!",
        `comp.sink_${i}`
      )
    } else {
      cmd.push(
        "videotestsrc",
        "pattern=black",
        "is-live=true",
        "!",
        `video/x-raw,width=${tileW},height=${tileH},pixel-aspect-ratio=1/1`,
        "!",
        `comp.sink_${i}`
      )
    }
  }

  cmd.push(
    "comp.",
    "!",
    "videoconvert",
    "!",
    "videoscale",
    "!",
    `video/x-raw,width=${W},height=${H},pixel-aspect-ratio=1/1`,
    "!",
    "queue",
    "!",
    ...getSinkChain()
  )

  console.log(`Pipeline canvas: ${W}x${H} (screen ${screen.width}x${screen.height})`)
  return cmd
}

function spawnPipeline(items, count) {
  const cmd = buildCmd(items, count)

  console.log("START:", "gst-launch-1.0", cmd.join(" "))

  const proc = spawn("gst-launch-1.0", cmd, {
    env: getDisplayEnv()
  })

  proc.stdout.on("data", d => {
    console.log(d.toString())
  })

  proc.stderr.on("data", d => {
    console.log(d.toString())
  })

  proc.on("error", err => {
    console.error("gst spawn error:", err)
  })

  proc.on("exit", (c, s) => {
    console.log("gst exited:", c, s)
    if (gst && gst.pid === proc.pid) {
      gst = null
    }
  })

  return proc
}

function startPipeline(items, count) {
  if (gst) return
  gst = spawnPipeline(items, count)
}

function switchPipeline(items, count) {
  const old = gst
  const next = spawnPipeline(items, count)

  gst = next

  if (old) {
    setTimeout(() => {
      killProc(old)
    }, 1200)
  }
}

function stopPipeline() {
  if (gst) {
    killProc(gst)
    gst = null
  }
}

function gstIsRunning() {
  return !!gst
}

module.exports = {
  startPipeline,
  switchPipeline,
  stopPipeline,
  gstIsRunning
}