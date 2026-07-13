<template>
  <Navbar />
  <main class="page-body">
    <!-- page heading -->
    <div class="heading">
      <h2><span><FontAwesomeIcon :icon="['fab', 'buffer']" /></span>ライブラリー</h2>
      <p class="sub">保存済み画像を期間指定で読み込み、MP4 動画として書き出せます。</p>
    </div>
    <!-- page body -->
    <div class="export-layout">

      <div class="left-col">
        <div class="card">
          <!-- card operation wrapper -->
          <div class="card-operation-wrapper">
            <!-- camera selector dropdown -->
            <div class="field">
              <select v-model="selectedCameraId" class="input camera-select"
                :class="{ 'is-placeholder': !selectedCameraId }" @change="onCameraChange">
                <option :value="null" disabled>カメラを選択</option>
                <option v-for="c in cameras" :key="c.id" :value="c.id">
                  {{ c.name }}
                </option>
              </select>
            </div>
            <!-- tools -->
            <div class="toolbar">
              <button @click="mode = 'timelapse'" :class="{ activeToolbar: mode === 'timelapse' }">
                最新静止画
              </button>
              <button @click="mode = 'video'" :class="{ activeToolbar: mode === 'video' }">
                動画
              </button>
              <button @click="refreshLatestPreview">更新</button>
              <button @click="fullscreen">全画面</button>
            </div>
          </div>

          <!-- camera preview -->
          <div class="viewer">
            <img v-if="mode === 'timelapse' && latestImageBlobUrl" :src="latestImageBlobUrl" />
            <video v-else-if="mode === 'video' && (videoBlobUrl || videoUrl)" :src="videoBlobUrl || videoUrl" controls
              autoplay playsinline @error="onVideoError" />
            <div v-else class="empty-view">プレビューがありません</div>
          </div>
        </div>

        <!-- picture holder -->
        <div class="card">
          <h4 class="pic-holder-heading">素材一覧</h4>
          <p class="helper-text">期間指定</p>
          <div class="picture-operation">
            <div class="field">
              <div class="datetime-row">
                <input type="datetime-local" v-model="from" class="input" />
                <input type="datetime-local" v-model="to" class="input" />
              </div>
            </div>
            <div class="field compact-row">
              <button class="primary-btn" @click="loadFiles" :disabled="!selectedCameraId">
                画像を読込
              </button>
            </div>
          </div>




          <div class="thumb-toolbar">
           <div class="thumb-label">
              <div class="thumb-count">
                読込画像: <strong>{{ files.length }}</strong> 枚
              </div>
              <div class="thumb-count">
                選択中: <strong>{{ selected.length }}</strong> 枚
              </div>
            </div>
          </div>
          <!-- thumbnails -->
          <div class="thumbs">
            <div v-for="f in files" :key="f.name" class="thumb" :class="{ selected: selected.includes(f.name) }">
              <img decoding="async" width="100" height="70" :src="withBase(f.url)"
                @click="previewImage(f)" />
            </div>

            <div v-if="!files.length" class="empty-thumbs">
              指定期間の画像はまだありません。
            </div>
          </div>
          <div class="thumb-actions">
            <button class="primary-btn" @click="downloadImagesZip" :disabled="!selectedCameraId || downloadingImages">
              <span v-if="downloadingImages" class="btn-spinner"></span>
              {{ downloadingImages ? "ZIP作成中..." : "ZIPダウンロード" }}
            </button>
            <button class="danger-btn" @click="deleteFiles" :disabled="!selected.length">
              削除
            </button>
          </div>
        </div>
      </div>

      <div class="right-col">
        <div class="card">
          <div class="right-top-mini-card">
            <!-- card heading -->
            <div class="card-head">
              <div class="card-hd-lb">
                <label class="field-label">動画生成</label>
                <div class="helper-text">
                  期間・速度を指定して MP4 動画を生成します。
                </div>
              </div>
              <div class="preview-actions">
                <button class="primary-btn create-video-btn" @click="preview"
                  :disabled="!selectedCameraId || isGenerating">
                  <span v-if="isGenerating" class="btn-spinner"></span>
                  {{ isGenerating ? "生成中..." : "生成" }}
                </button>
              </div>
            </div>

            <div v-if="isGenerating || progressPercent > 0" class="progress-section">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
              </div>
              <div class="progress-summary">
                <span class="progress-stage-text">{{ progressStage || "処理中..." }}</span>
                <span class="progress-percent">{{ progressPercent }}%</span>
              </div>
            </div>

            <div v-if="generateError" class="video-generate-error">
              {{ generateError }}
            </div>

            <!-- fps selector -->
            <div class="video-controls-grid">
              <div class="mini-card">
                <div class="mini-label">FPS</div>
                <input type="number" v-model.number="fps" class="small-input" min="1" max="120" />
              </div>

              <div class="mini-card speed-card">
                <div class="mini-label">再生速度</div>
                <div class="speed-chip-row">
                  <button type="button" class="speed-chip" :class="{ active: speed === 1 }" @click="speed = 1">
                    1x
                  </button>
                  <button type="button" class="speed-chip" :class="{ active: speed === 2 }" @click="speed = 2">
                    2x
                  </button>
                  <button type="button" class="speed-chip" :class="{ active: speed === 4 }" @click="speed = 4">
                    4x
                  </button>
                  <button type="button" class="speed-chip" :class="{ active: speed === 8 }" @click="speed = 8">
                    8x
                  </button>
                  <button type="button" class="speed-chip" :class="{ active: speed === 16 }" @click="speed = 16">
                    16x
                  </button>
                  <button type="button" class="speed-chip" :class="{ active: speed === 32 }" @click="speed = 32">
                    32x
                  </button>
                  <button type="button" class="speed-chip" :class="{ active: speed === 64 }" @click="speed = 64">
                    64x
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- second box -->
          <div class="right-bottom-mini-card">
            <div class="right-bottom-mini-card-heading">
              <span class="history-title">生成履歴</span>
            </div>

            <div class="video-history-list">
              <div v-for="v in videos" :key="v.name" :class="{ active: videoUrl === withBase(v.url) }"
                class="video-row smart-video-row">
                <div class="video-main">
                  <div class="video-icon"><FontAwesomeIcon :icon="['far', 'file-video']" /></div>
                  <div class="video-texts">
                    <div class="video-name">{{ formatName(v.name) }}</div>
                    <div class="video-sub">MP4 / タイムラプス動画</div>
                  </div>
                </div>
                <div class="video-actions">
                  <button class="icon-btn-dark" @click="playVideo(v)" title="再生"><FontAwesomeIcon :icon="['fas', 'play']" /></button>
                  <button class="icon-btn-blue" @click="downloadVideo(v)" title="ダウンロード"><FontAwesomeIcon :icon="['fas', 'download']" /></button>
                  <button class="icon-btn-red" @click="deleteVideo(v.name)" title="削除"><FontAwesomeIcon :icon="['fas', 'trash-can']" /></button>
                </div>
              </div>

              <div v-if="!videos.length" class="video-empty">
                生成済み動画はまだありません。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <transition name="toast-fade">
    <div v-if="toast.show" class="toast" :class="`toast--${toast.type}`">
      <div class="toast-icon">
        <span v-if="toast.type === 'success'">✓</span>
        <span v-else-if="toast.type === 'error'">!</span>
        <span v-else-if="toast.type === 'warning'">!</span>
        <span v-else>i</span>
      </div>

      <div class="toast-content">
        <div class="toast-title">{{ toast.title }}</div>
        <div class="toast-message">{{ toast.message }}</div>
      </div>

      <button class="toast-close" @click="hideToast">×</button>
    </div>
  </transition>

  <transition name="modal-fade">
    <div v-if="confirmState.show" class="modal-backdrop">
      <div class="confirm-modal">
        <div class="confirm-header">
          <div class="confirm-title">{{ confirmState.title }}</div>
        </div>

        <div class="confirm-body">
          {{ confirmState.message }}
        </div>

        <div class="confirm-actions">
          <button class="secondary-btn" @click="resolveConfirm(false)">キャンセル</button>
          <button class="danger-btn-inline" @click="resolveConfirm(true)">OK</button>
        </div>
      </div>
    </div>
  </transition>
  <Footer />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue"
import api from "../api/api"
import Navbar from "../components/Navbar.vue"
import Footer from "../components/Footer.vue"


const baseUrl =
  window.autoview?.apiUrl ||
  (window.location.protocol === "file:"
    ? "http://127.0.0.1:8080"
    : window.location.origin)

const cameras = ref([])
const selectedCameraId = ref(null)

function toDatetimeLocalValue(date) {
  const pad = n => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getDefaultRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const end = new Date()
  end.setHours(23, 59, 0, 0)

  return {
    from: toDatetimeLocalValue(start),
    to: toDatetimeLocalValue(end)
  }
}

const defaultRange = getDefaultRange()
const from = ref(defaultRange.from)
const to = ref(defaultRange.to)
const fps = ref(12)

const files = ref([])
const selected = ref([])
const videoUrl = ref("")
const videoBlobUrl = ref("")
const speed = ref(2)
const videos = ref([])

const mode = ref("timelapse")
const latestTick = ref(Date.now())
const latestImageBlobUrl = ref("")

const isGenerating = ref(false)
const downloadingImages = ref(false)
const progressPercent = ref(0)
const progressStage = ref("")
const generateError = ref("")
const abortController = ref(null)

const toast = ref({ show: false, type: "success", title: "", message: "" })
const confirmState = ref({ show: false, title: "", message: "", resolver: null })

let fakeProgressTimer = null
let toastTimer = null
let objectUrls = []

function getAuthHeaders() {
  const token = localStorage.getItem("auth_token") || ""
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function rememberObjectUrl(url) {
  objectUrls.push(url)
  return url
}

function revokeObjectUrl(url) {
  if (!url || !url.startsWith("blob:")) return
  try {
    URL.revokeObjectURL(url)
  } catch (_) { }
  objectUrls = objectUrls.filter(u => u !== url)
}

function cleanupObjectUrls() {
  for (const url of objectUrls) {
    try {
      URL.revokeObjectURL(url)
    } catch (_) { }
  }
  objectUrls = []
  latestImageBlobUrl.value = ""
  videoBlobUrl.value = ""
}

async function fetchProtectedBlobUrl(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include"
  })

  if (res.status === 401) throw new Error("login required")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const blob = await res.blob()
  if (!blob || blob.size === 0) throw new Error("Empty file")

  return rememberObjectUrl(URL.createObjectURL(blob))
}

function withBase(url) {
  if (!url) return ""
  if (url.startsWith("blob:")) return url
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  return `${baseUrl}${url}`
}

function toMillis(v) {
  if (!v) return 0
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : 0
}

function isAuthError(err) {
  const msg = String(err?.message || "").toLowerCase()
  return msg.includes("login required") || msg.includes("http 401") || msg.includes("401")
}

function handleApiError(err, fallbackTitle = "エラー", fallbackMessage = "処理に失敗しました。") {
  console.error(err)

  if (isAuthError(err)) {
    localStorage.removeItem("auth_token")
    localStorage.removeItem("auth_user")
    showToast("warning", "ログイン切れ", "再度ログインしてください。")
    setTimeout(() => {
      window.location.hash = "#/login"
    }, 500)
    return true
  }

  showToast("error", fallbackTitle, err?.message || fallbackMessage)
  return false
}

async function loadLatestImageProtected() {
  if (!selectedCameraId.value) return

  const oldUrl = latestImageBlobUrl.value
  latestImageBlobUrl.value = ""
  revokeObjectUrl(oldUrl)

  try {
    const url = `${baseUrl}/api/timelapse/latest?camera_id=${selectedCameraId.value}&t=${Date.now()}`
    latestImageBlobUrl.value = await fetchProtectedBlobUrl(url)
  } catch (e) {
    console.warn("latest image preview failed:", e)
  }
}

async function loadVideoProtected(url) {
  const oldUrl = videoBlobUrl.value
  videoBlobUrl.value = ""
  revokeObjectUrl(oldUrl)
  videoBlobUrl.value = await fetchProtectedBlobUrl(url)
}


function refreshLatestPreview() {
  latestTick.value = Date.now()
  loadLatestImageProtected()
}

function onCameraChange() {
  localStorage.setItem("timelapse_selected_camera_id", String(selectedCameraId.value || ""))
  selected.value = []
  files.value = []
  refreshLatestPreview()
}

function toggleSelect(name) {
  if (selected.value.includes(name)) {
    selected.value = selected.value.filter(f => f !== name)
  } else {
    selected.value.push(name)
  }
}

function previewImage(file) {
  toggleSelect(file.name)
  mode.value = "timelapse"

  // cleanup previous blob (if any)
  revokeObjectUrl(latestImageBlobUrl.value)

  latestImageBlobUrl.value = withBase(file.url)
}

function formatName(name) {
  const m = String(name || "").match(/(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})/)
  if (!m) return name
  return `${m[1].replaceAll("-", "/")} ${m[2].replace("-", ":")}`
}

function buildImageZipName() {
  const cam = cameras.value.find(c => Number(c.id) === Number(selectedCameraId.value))
  const camName = String(cam?.name || `camera_${selectedCameraId.value}`)
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")

  const fromText = from.value ? from.value.replace(/[:T]/g, "-") : "from"
  const toText = to.value ? to.value.replace(/[:T]/g, "-") : "to"

  return `${camName}_${fromText}_to_${toText}.zip`
}

function startFakeProgress() {
  stopFakeProgress()
  progressPercent.value = 0
  progressStage.value = "動画生成を開始しています..."

  fakeProgressTimer = setInterval(() => {
    if (progressPercent.value < 20) {
      progressPercent.value += 4
      progressStage.value = "画像を確認しています..."
    } else if (progressPercent.value < 45) {
      progressPercent.value += 3
      progressStage.value = "動画を準備しています..."
    } else if (progressPercent.value < 75) {
      progressPercent.value += 2
      progressStage.value = "エンコード中..."
    } else if (progressPercent.value < 92) {
      progressPercent.value += 1
      progressStage.value = "まもなく完了します..."
    }
  }, 300)
}

function stopFakeProgress() {
  if (fakeProgressTimer) {
    clearInterval(fakeProgressTimer)
    fakeProgressTimer = null
  }
}

function showToast(type, title, message) {
  toast.value = { show: true, type, title, message }

  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

function hideToast() {
  toast.value.show = false
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
}

function askConfirm(title, message) {
  return new Promise(resolve => {
    confirmState.value = { show: true, title, message, resolver: resolve }
  })
}

function resolveConfirm(result) {
  if (confirmState.value.resolver) {
    confirmState.value.resolver(result)
  }

  confirmState.value = { show: false, title: "", message: "", resolver: null }
}

function validateRange() {
  if (!selectedCameraId.value) {
    showToast("warning", "カメラ未選択", "対象のカメラを選択してください。")
    return false
  }

  if (!from.value || !to.value) {
    showToast("warning", "期間未設定", "開始日時と終了日時を指定してください。")
    return false
  }

  const fromTime = toMillis(from.value)
  const toTime = toMillis(to.value)

  if (fromTime >= toTime) {
    showToast("warning", "期間エラー", "終了日時は開始日時より後にしてください。")
    return false
  }

  return true
}

async function loadCameras() {
  try {
    const data = await api.getCameras()
    cameras.value = Array.isArray(data) ? data : []

    if (!cameras.value.length) {
      selectedCameraId.value = null
      return
    }

    const savedId = Number(localStorage.getItem("timelapse_selected_camera_id") || 0)

    if (savedId && cameras.value.some(c => Number(c.id) === savedId)) {
      selectedCameraId.value = savedId
    } else {
      selectedCameraId.value = cameras.value[0].id
    }

    await loadLatestImageProtected()
  } catch (e) {
    handleApiError(e, "読込失敗", "カメラ一覧の読込に失敗しました。")
  }
}

async function loadVideos() {
  try {
    const data = await api.getTimelapseVideos()
    videos.value = data.files || []
  } catch (e) {
    handleApiError(e, "読込失敗", "動画一覧の読込に失敗しました。")
  }
}

async function loadFiles() {
  if (!validateRange()) return

  try {
    const data = await api.getTimelapseFiles({
      camera_id: selectedCameraId.value,
      from: toMillis(from.value),
      to: toMillis(to.value)
    })

    // ✅ Direct assign (NO blob processing)
    files.value = data.files || []

    if (files.value.length) {
      showToast("success", "読込完了", `${files.value.length} 枚の画像を読み込みました。`)
    } else {
      showToast("info", "画像なし", "指定期間に画像はありませんでした。")
    }

  } catch (e) {
    handleApiError(e, "読込失敗", "画像の読込に失敗しました。")
  }
}

async function downloadImagesZip() {
  if (!validateRange()) return

  downloadingImages.value = true

  try {
    const url =
      `${baseUrl}/api/timelapse/files/download-zip?camera_id=${selectedCameraId.value}` +
      `&from=${toMillis(from.value)}&to=${toMillis(to.value)}`

    const res = await fetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
      credentials: "include"
    })

    if (res.status === 401) throw new Error("login required")

    if (!res.ok) {
      let errorMessage = "ZIPダウンロードに失敗しました。"
      try {
        const data = await res.json()
        errorMessage = data.error || errorMessage
      } catch (_) { }
      throw new Error(errorMessage)
    }

    const blob = await res.blob()
    if (!blob || blob.size === 0) throw new Error("ZIPファイルが空です。")

    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = downloadUrl
    a.download = buildImageZipName()
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(downloadUrl)

    showToast("success", "ZIP作成完了", "画像ZIPのダウンロードを開始しました。")
  } catch (e) {
    handleApiError(e, "ZIP失敗", "画像ZIPの作成に失敗しました。")
  } finally {
    downloadingImages.value = false
  }
}

async function deleteFiles() {
  if (!selected.value.length) {
    showToast("warning", "画像未選択", "削除する画像を選択してください。")
    return
  }

  const ok = await askConfirm("画像削除", `選択した ${selected.value.length} 枚の画像を削除しますか？`)
  if (!ok) return

  try {
    await api.deleteTimelapseFiles({
      camera_id: selectedCameraId.value,
      files: selected.value
    })

    const deletedCount = selected.value.length
    selected.value = []
    await loadFiles()
    refreshLatestPreview()
    showToast("success", "削除完了", `${deletedCount} 枚の画像を削除しました。`)
  } catch (e) {
    handleApiError(e, "削除失敗", "削除処理でエラーが発生しました。")
  }
}

async function deleteVideo(name) {
  const ok = await askConfirm("動画削除", "この動画を削除しますか？")
  if (!ok) return

  try {
    await api.deleteTimelapseVideo(name)

    if (videoUrl.value && videoUrl.value.includes(name)) {
      videoUrl.value = ""
      revokeObjectUrl(videoBlobUrl.value)
      videoBlobUrl.value = ""
      if (mode.value === "video") mode.value = "timelapse"
    }

    await loadVideos()
    showToast("success", "削除完了", "動画を削除しました。")
  } catch (e) {
    handleApiError(e, "削除失敗", "動画削除に失敗しました。")
  }
}

async function preview() {
  if (!validateRange()) return

  // Prevent multiple clicks
  if (isGenerating.value) return

  generateError.value = ""
  isGenerating.value = true
  progressPercent.value = 0
  progressStage.value = "開始中..."
  abortController.value = new AbortController()
  startFakeProgress()

  try {
    const params = {
      camera_id: selectedCameraId.value,
      from: toMillis(from.value),
      to: toMillis(to.value),
      fps: fps.value,
      speed: speed.value
    }

    showToast("info", "生成開始", "動画生成を開始しました。しばらくお待ちください。")

    const data = await api.getTimelapsePreview(params, {
      signal: abortController.value.signal
    })

    if (!data.ok || !data.url) {
      throw new Error(data.error || "動画生成に失敗しました。")
    }

    progressPercent.value = 100
    progressStage.value = "動画生成が完了しました"

    videoUrl.value = withBase(data.url) + `?t=${Date.now()}`

    try {
      await loadVideoProtected(videoUrl.value)
    } catch (e) {
      console.warn("protected video load failed, fallback to direct url:", e)
    }

    mode.value = "video"

    await loadVideos()
    showToast("success", "生成完了", "動画の生成が完了しました。")
  } catch (e) {
    if (e.name === 'AbortError') {
      showToast("info", "キャンセル", "動画生成をキャンセルしました。")
      return
    }

    console.error("preview error:", e)

    if (isAuthError(e)) {
      handleApiError(e)
    } else {
      const errorMsg = e.message || "動画生成に失敗しました。"
      generateError.value = errorMsg
      showToast("error", "生成失敗", errorMsg)
    }
  } finally {
    abortController.value = null
    stopFakeProgress()
    setTimeout(() => {
      isGenerating.value = false
    }, 300)
  }
}

function cancelPreview() {
  if (abortController.value) {
    abortController.value.abort()
  }
}

async function downloadVideo(v) {
  try {
    const res = await fetch(withBase(v.url), {
      method: "GET",
      headers: getAuthHeaders(),
      credentials: "include"
    })

    if (res.status === 401) throw new Error("login required")
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const blob = await res.blob()
    if (!blob || blob.size === 0) throw new Error("動画ファイルが空です。")

    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = downloadUrl
    a.download = String(v.name || "timelapse.mp4").replace(/\.json$/i, ".mp4")
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(downloadUrl)

    showToast("success", "ダウンロード開始", "動画ダウンロードを開始しました。")
  } catch (e) {
    handleApiError(e, "ダウンロード失敗", "動画のダウンロードに失敗しました。")
  }
}

async function playVideo(v) {
  videoUrl.value = withBase(v.url) + `?t=${Date.now()}`

  try {
    await loadVideoProtected(videoUrl.value)
  } catch (e) {
    console.warn("protected video load failed, fallback to direct url:", e)
  }

  mode.value = "video"
  showToast("info", "再生準備", "選択した動画をプレビューに表示しました。")
}

function onVideoError(e) {
  console.error("video playback error:", e)
  console.error("videoUrl:", videoUrl.value)
  console.error("videoBlobUrl:", videoBlobUrl.value)
  showToast("error", "動画再生エラー", "動画ファイルを再生できませんでした。")
}

function fullscreen() {
  const el = document.querySelector(".viewer")
  if (el?.requestFullscreen) el.requestFullscreen()
}

onMounted(async () => {
  try {
    await loadCameras()
    await loadVideos()
    refreshLatestPreview()
  } catch (e) {
    console.error("TimelapseExportView init error:", e)
  }
})

onBeforeUnmount(() => {
  stopFakeProgress()
  hideToast()
  cleanupObjectUrls()
})
</script>

<style scoped>
@import "../styles/theme.css";

/* ===== LAYOUT ===== */
.page-body {
  max-width: 1200px;
  margin: 40px auto;
  padding: 16px;
}

.heading {
  padding: 16px 0 0;
}

.heading h2 {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
}

.heading h2 span {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 16px;
  flex: 0 0 36px;
}

.sub {
  color: var(--text-muted);
}

.export-layout {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 20px;
  padding: 16px 0;
}

/* ===== COLUMNS ===== */
.left-col,
.right-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ===== CARD ===== */
.card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: 0.2s;
}

.card:hover {
  box-shadow: var(--shadow-md);
}

/* ===== FIELD ===== */
.card-operation-wrapper {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.card-operation-wrapper .field {
  flex: 1;
  max-width: 320px;
  margin-bottom: 0;
}

.card-operation-wrapper .toolbar {
  flex: 0 0 auto;
  margin: 0;
}

.field {
  margin-bottom: 14px;
}

.field-label {
  font-weight: 600;
  color: var(--text-heading);
  margin-bottom: 6px;
}

.pic-holder-heading {
  font-weight: 600;
  margin-top: 0px;
  margin-bottom: 0px;
}

.picture-operation {
  display: flex;
  justify-content: space-between;
}

.helper-text {
  font-size: 14px;
  color: var(--text-muted);
  margin-top: 8px;
}

.mini-label {
  font-size: 14px;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.preview-actions {
  align-self: flex-start;
}

.progress-section {
  display: grid;
  gap: 8px;
  width: 100%;
  margin-bottom: 16px;
}

.progress-bar {
  width: 100%;
  height: 1px;
  background: var(--surface-alt);
  border-radius: 1px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.3s ease;
}

.progress-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.progress-stage-text,
.progress-percent {
  font-size: 12px;
  color: var(--text-muted);
}

.progress-percent {
  font-weight: 600;
  color: var(--text-heading);
}

.video-generate-error {
  margin-top: 12px;
}

.create-video-btn {
  font-size: 14px;
}

.right-bottom-mini-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0;
  margin-top: 18px;
  height: 690px;
  overflow: hidden;
}

.right-bottom-mini-card-heading {
  padding: 16px;
  background-color: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 6px 6px 0 0;
}

.video-history-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.video-empty {
  margin: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

.history-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-heading);
}

.progress-stage-text {
  font-size: 12px;
  color: var(--text-muted);
}

.progress-top-line {
  font-size: 12px;
}

.progress-bar {
  width: 100%;
  height: 2px;
  background: var(--surface-alt);
  border-radius: 1px;
  overflow: hidden;
  margin: 8px 0;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.3s ease;
}

.cancel-btn {
  margin-top: 8px;
  padding: 6px 12px;
  background: var(--error);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
}

/* ===== INPUT ===== */
.input {
  width: 100%;
  height: 36px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-body);
  font-size: 14px;
}

.camera-select {
  min-width: 220px;
  padding-right: 36px;

  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;

  background: var(--surface);
  color: var(--text-body);

  border: 1px solid var(--border);
  border-radius: var(--radius-sm);

  cursor: pointer;
  transition: 0.2s;

  /* Custom arrow */
  background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' fill='%236b7280' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z' clip-rule='evenodd'/%3E%3C/svg%3E");

  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 16px;

}

/* Hover */
.camera-select:hover {
  border-color: var(--primary);
}

.camera-select.is-placeholder {
  color: var(--text-muted);
}

.camera-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

/* Fix dropdown menu look (browser override) */
.camera-select option {
  color: var(--text-body);
  background: #ffffff;
}

/* ===== TOOLBAR ===== */
.toolbar {
  display: flex;
  gap: 8px;
  margin: 10px 0 14px;
}

.toolbar button {
  border: 1px solid var(--border);
  background: var(--surface-alt);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
}

.toolbar button.activeToolbar {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

/* ===== VIEWER ===== */
.viewer {
  background: var(--surface-alt);
  border-radius: var(--radius);
  aspect-ratio: 16 / 9;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.viewer img,
.viewer video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.empty-view {
  color: var(--text-muted);
}

/* ===== DATE ROW ===== */
.datetime-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* ===== BUTTONS ===== */
.primary-btn {
  background: var(--primary);
  color: #fff;
}

.secondary-btn {
  background: var(--surface-alt);
  color: var(--text-body);
}

.danger-btn {
  background: var(--error);
  margin-top: 12px;
}

.primary-btn,
.secondary-btn,
.danger-btn {
  border: none;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  color: #ffffff;
}

/* ===== THUMBNAILS ===== */
.thumbs {
  background-color: var(--surface-alt);
  width: 100%;
  height: 204px;
  padding: 8px;
  border: solid 1px var(--border);
  border-radius: 6px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 8px;
  overflow-y: auto;
}
.thumb-label{
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 16px 6px 0px 6px;
}
.thumb-count{
  font-size: 14px;
  color: var(--text-muted);
}
.empty-thumbs{
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 90px;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-muted);
}

.thumb {
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 2px solid transparent;
  background: var(--surface-alt);
  aspect-ratio: 16 / 9;
}

.thumb img {
  width: 100%;
  height: auto;
  object-fit: cover;
}

.thumb.selected {
  border-color: var(--error);
}

.thumb-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}

.thumb-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.thumb-actions .danger-btn {
  margin-top: 0;
}

/* ===== VIDEO SECTION ===== */
.video-controls-grid {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 12px;
}
.small-input{
  border: solid 1px var(--border);
  border-radius: 3px;
  padding: 3px;
  width: 100%;
}

.mini-card {
  border: 1px solid var(--border);
  background: var(--surface-alt);
  border-radius: var(--radius);
  padding: 10px;
}

.speed-chip {
  border-radius: 999px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 12px;
  cursor: pointer;
}

.speed-chip {
  margin-right: 16px;
}

.speed-chip.active {
  background: var(--primary);
  color: #fff;

}

/* ===== VIDEO ROW ===== */
.smart-video-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  margin-bottom: 8px;
}

.video-main {
  display: flex;
  gap: 10px;
  align-items: center;
}

.video-icon {
  width: 40px;
  height: 40px;
  background: var(--primary-soft);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-name {
  font-weight: 600;
  font-size: 14px;
}

.video-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.video-actions {
  display: flex;
  gap: 8px;
}

.icon-btn-dark,
.icon-btn-blue,
.icon-btn-red {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
}

.icon-btn-dark {
  background: var(--surface-alt);
}

.icon-btn-blue {
  background: var(--primary);
  color: #fff;
  text-decoration: none;
}

.icon-btn-red {
  background: var(--error);
  color: #fff;
}

.toast {
  position: fixed;
  top: 18px;
  right: 18px;
  width: min(380px, calc(100vw - 24px));
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  color: #fff;
  z-index: 99999;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
}

.toast--success {
  background: linear-gradient(135deg, #1d8f4d, #23b45d);
}

.toast--error {
  background: linear-gradient(135deg, #b93a34, #dd4c45);
}

.toast--warning {
  background: linear-gradient(135deg, #9a6a11, #cf8c17);
}

.toast--info {
  background: linear-gradient(135deg, #2468b3, #2f83de);
}

.toast-icon {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.18);
  font-weight: 800;
  flex: 0 0 34px;
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-weight: 800;
  margin-bottom: 4px;
}

.toast-message {
  font-size: 13px;
  line-height: 1.45;
  opacity: 0.96;
}

.toast-close {
  border: none;
  background: transparent;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.25s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) translateX(10px);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 99998;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.confirm-modal {
  width: min(460px, 100%);
  background: var(--surface);
  color: var(--text-body);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}

.confirm-header {
  padding: 18px 18px 8px;
}

.confirm-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-heading);
}

.confirm-body {
  padding: 0 18px 18px;
  line-height: 1.6;
  white-space: pre-line;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px 18px;
}

.danger-btn-inline {
  border: none;
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  cursor: pointer;
  background: var(--error);
  color: #fff;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.22s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 1100px) {
  .export-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .card-operation-wrapper {
    flex-direction: column;
    align-items: stretch;
  }

  .card-operation-wrapper .field {
    max-width: none;
  }

  .card-operation-wrapper .toolbar {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .picture-operation,
  .thumb-toolbar,
  .smart-video-row {
    flex-direction: column;
    align-items: stretch;
  }

  .datetime-row,
  .video-controls-grid {
    grid-template-columns: 1fr;
  }

  .bottom-top {
    align-items: stretch;
  }
}
</style>
