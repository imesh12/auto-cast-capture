'use strict'
const { spawn } = require('child_process')
const fs = require('fs')

const workers = {}

function startWorker(id, url) {
  if (workers[id]) return

  const socket = `/tmp/cam${id}`
  try { fs.unlinkSync(socket) } catch {}

  const args = [
    'rtspsrc', `location=${url}`,
    'protocols=tcp', 'latency=200',
    'retry=5', 'timeout=5000000', 'tcp-timeout=5000000',

    '!',
    'queue', 'max-size-buffers=2', 'leaky=downstream',

    // ★ 混在対応：depay/parse/decoder を自動選択
    '!',
    'decodebin',
    "!",
    "queue",
    "max-size-buffers=2",
    "leaky=downstream",
    '!',
    'videoconvert',
    '!',
    'videoscale',
    '!',
    // ★ Mixerに渡す形式を固定（ここで統一）
    "capsfilter",
    "caps=video/x-raw,format=I420,width=640,height=360",
    '!',
    'queue', 'max-size-buffers=2', 'leaky=downstream',
    '!',
    'shmsink',
    `socket-path=${socket}`,
    'wait-for-connection=false',
    'sync=false',
    'shm-size=67108864'
  ]

  console.log('WORKER START', id, url)

  const p = spawn('gst-launch-1.0', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  p.stdout.on('data', d => process.stdout.write(`[W${id}] ` + d.toString()))
  p.stderr.on('data', d => process.stderr.write(`[W${id} ERR] ` + d.toString()))
  p.on('exit', (code, sig) => {
    console.log('WORKER EXIT', id, code, sig)
    delete workers[id]
  })

  workers[id] = p
}

function stopWorker(id) {
  const p = workers[id]
  if (!p) return
  try { p.kill('SIGTERM') } catch {}
  delete workers[id]
}

module.exports = { startWorker, stopWorker }