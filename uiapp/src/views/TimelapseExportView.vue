<template>
  <div class="export-layout">
    <div class="left-col">
      <div class="card">
        <h3>🖼 プレビュー</h3>

        <div class="field">
          <label class="field-label">カメラ</label>
          <select v-model.number="selectedCameraId" class="input" @change="onCameraChange">
            <option v-for="c in cameras" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
        </div>

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

        <div class="viewer">
          <img v-if="mode === 'timelapse' && latestImageBlobUrl" :src="latestImageBlobUrl" />
         <video
  v-else-if="mode === 'video' && (videoBlobUrl || videoUrl)"
  :src="videoBlobUrl || videoUrl"
  controls
  autoplay
  playsinline
  @error="onVideoError"
/>
          <div v-else class="empty-view">プレビューがありません</div>
        </div>
      </div>

      <div class="card">
        <h3>🖼 素材一覧</h3>

        <div class="field">
          <label class="field-label">期間指定</label>
          <div class="datetime-row">
            <input type="datetime-local" v-model="from" class="input" />
            <input type="datetime-local" v-model="to" class="input" />
          </div>
        </div>

        <div class="field compact-row">
          <button class="secondary-btn" @click="loadFiles" :disabled="!selectedCameraId">
            画像を読込
          </button>

          <button
            class="primary-btn"
            @click="downloadImagesZip"
            :disabled="!selectedCameraId || downloadingImages"
          >
            <span v-if="downloadingImages" class="btn-spinner"></span>
            {{ downloadingImages ? "ZIP作成中..." : "⬇ ZIPダウンロード" }}
          </button>
        </div>

        <div class="thumb-toolbar">
          <div class="thumb-count">
            読込画像: <strong>{{ files.length }}</strong> 枚
          </div>
          <div class="thumb-count">
            選択中: <strong>{{ selected.length }}</strong> 枚
          </div>
        </div>

        <div class="thumbs">
          <div
            v-for="f in files"
            :key="f.name"
            class="thumb"
            :class="{ selected: selected.includes(f.name) }"
          >
            <img
              loading="lazy"
              decoding="async"
              width="100"
              height="70"
              :src="withBase(f.url)"
              @click="previewImage(f)"
            />
          </div>

          <div v-if="!files.length" class="empty-thumbs">
            指定期間の画像はまだありません。
          </div>
        </div>

        <button class="danger-btn" @click="deleteFiles" :disabled="!selected.length">
          🗑 選択画像を削除
        </button>
      </div>
    </div>

    <div class="right-col">
      <div class="card">
        <div class="bottom-top">
          <div>
            <label class="field-label">動画生成</label>
            <div class="helper-text">
              期間・速度を指定して MP4 動画を生成します。
            </div>
          </div>

          <div class="preview-actions">
            <button
              class="primary-btn create-video-btn"
              @click="preview"
              :disabled="!selectedCameraId || isGenerating"
            >
              <span v-if="isGenerating" class="btn-spinner"></span>
              {{ isGenerating ? "生成中..." : "🎬 生成して再生" }}
            </button>

            <a
              v-if="videoUrl && !isGenerating"
              :href="videoUrl"
              download
              class="icon-link download-link-strong"
              title="ダウンロード"
            >
              ⬇
            </a>
          </div>
        </div>

        <div class="video-controls-grid">
          <div class="mini-card">
            <div class="mini-label">FPS</div>
            <input type="number" v-model.number="fps" class="small-input" min="1" max="120" />
          </div>

          <div class="mini-card speed-card">
            <div class="mini-label">再生速度</div>
            <div class="speed-chip-row">
              <button
                type="button"
                class="speed-chip"
                :class="{ active: speed === 2 }"
                @click="speed = 2"
              >
                2x
              </button>
              <button
                type="button"
                class="speed-chip"
                :class="{ active: speed === 4 }"
                @click="speed = 4"
              >
                4x
              </button>
              <button
                type="button"
                class="speed-chip"
                :class="{ active: speed === 8 }"
                @click="speed = 8"
              >
                8x
              </button>
              <button
                type="button"
                class="speed-chip"
                :class="{ active: speed === 16 }"
                @click="speed = 16"
              >
                16x
              </button>
              <button
                type="button"
                class="speed-chip"
                :class="{ active: speed === 32 }"
                @click="speed = 32"
              >
                32x
              </button>
              <button
                type="button"
                class="speed-chip"
                :class="{ active: speed === 64 }"
                @click="speed = 64"
              >
                64x
              </button>
            </div>
          </div>
        </div>

        <div v-if="isGenerating || progressPercent > 0" class="progress-card">
          <div class="progress-top-line">
            <span>{{ progressStage || "処理中..." }}</span>
            <span>{{ progressPercent }}%</span>
          </div>

          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </div>

        <div v-if="generatedInfo && !isGenerating" class="last-generated-card">
          <div class="last-generated-info">
            <div class="last-generated-title">最新生成動画</div>
            <div class="last-generated-meta">
              {{ speedLabel(generatedInfo.speed) }} / FPS {{ generatedInfo.fps }}
            </div>
          </div>

          <div class="last-generated-actions">
            <button class="small-dark-btn" @click="mode = 'video'">再生</button>
            <a :href="generatedInfo.url" download class="small-blue-btn">ダウンロード</a>
          </div>
        </div>

        <div v-if="generateError" class="video-generate-error">
          {{ generateError }}
        </div>

        <h4 class="history-title">生成履歴</h4>

        <div
          v-for="v in videos"
          :key="v.name"
          :class="{ active: videoUrl === withBase(v.url) }"
          class="video-row smart-video-row"
        >
          <div class="video-main">
            <div class="video-icon">🎞</div>
            <div class="video-texts">
              <div class="video-name">{{ formatName(v.name) }}</div>
              <div class="video-sub">MP4 / タイムラプス動画</div>
            </div>
          </div>

          <div class="video-actions">
            <button class="icon-btn-dark" @click="playVideo(v)" title="再生">▶</button>
            <a class="icon-btn-blue" :href="withBase(v.url)" download title="ダウンロード">⬇</a>
            <button class="icon-btn-red" @click="deleteVideo(v.name)" title="削除">🗑</button>
          </div>
        </div>

        <div v-if="!videos.length" class="video-empty">
          生成済み動画はまだありません。
        </div>
      </div>
    </div>
  </div>

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
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue"
import api from "../api/api"

const baseUrl =
  window.autoview?.apiUrl ||
  (window.location.protocol === "file:"
    ? "http://127.0.0.1:8080"
    : window.location.origin)

const cameras = ref([])
const selectedCameraId = ref(null)

const from = ref("")
const to = ref("")
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
const generatedInfo = ref(null)

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
  } catch (_) {}
  objectUrls = objectUrls.filter(u => u !== url)
}

function cleanupObjectUrls() {
  for (const url of objectUrls) {
    try {
      URL.revokeObjectURL(url)
    } catch (_) {}
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

function speedLabel(v) {
  if (Number(v) === 1) return "等倍"
  return `${v}倍速`
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

  if (toMillis(from.value) >= toMillis(to.value)) {
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
      } catch (_) {}
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

  generateError.value = ""
  generatedInfo.value = null
  isGenerating.value = true
  progressPercent.value = 0
  progressStage.value = "開始中..."
  startFakeProgress()

  try {
    const data = await api.getTimelapsePreview({
      camera_id: selectedCameraId.value,
      from: toMillis(from.value),
      to: toMillis(to.value),
      fps: fps.value,
      speed: speed.value
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

    generatedInfo.value = {
      url: videoBlobUrl.value || withBase(data.url),
      originalUrl: withBase(data.url),
      name: data.name || data.filename || "timelapse.mp4",
      fps: Number(fps.value),
      speed: Number(speed.value),
      from: from.value,
      to: to.value
    }

    await loadVideos()
    showToast("success", "生成完了", "動画の生成が完了しました。")
  } catch (e) {
    console.error("preview error:", e)

    if (isAuthError(e)) {
      handleApiError(e)
    } else {
      generateError.value = e.message || "動画生成に失敗しました。"
      showToast("error", "生成失敗", generateError.value)
    }
  } finally {
    stopFakeProgress()
    setTimeout(() => {
      isGenerating.value = false
    }, 300)
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
.export-layout {
  display:grid;
  grid-template-columns: 1.05fr 1fr;
  gap:18px;
}

.left-col,
.right-col {
  display:flex;
  flex-direction:column;
  gap:18px;
}

.card {
  border: 1px solid #333;
  border-radius: 14px;
  padding: 14px;
  background: #181818;
  color:#fff;
}

.field {
  margin-bottom: 14px;
}

.field-label {
  display: block;
  font-weight: 700;
  margin-bottom: 8px;
}

.input {
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #444;
  background: #1a1a1a;
  color: #fff;
  box-sizing: border-box;
}

.small-input {
  width: 80px;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #444;
  background: #1a1a1a;
  color: #fff;
  box-sizing: border-box;
}

.toolbar {
  padding: 10px 0 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar button {
  border: 1px solid #444;
  background: #1a1a1a;
  color: #fff;
  border-radius: 10px;
  padding: 8px 12px;
  cursor: pointer;
}

.toolbar button.activeToolbar {
  background: #0a84ff;
  border-color: #0a84ff;
}

.viewer {
  background: black;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 420px;
  border-radius: 12px;
  overflow:hidden;
}

.viewer video,
.viewer img {
  width: 100%;
  height: 420px;
  object-fit: contain;
}

.empty-view {
  color: #999;
}

.datetime-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.compact-row {
  display: flex;
  gap: 12px;
  align-items: end;
  flex-wrap: wrap;
}

.thumb-toolbar {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  margin-bottom:12px;
  color:#cfcfcf;
  font-size:13px;
}

.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.thumb {
  width: 100px;
  height: 70px;
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
}

.thumb.selected {
  border: 2px solid #ff4747;
  box-shadow: 0 0 0 1px #ff4747 inset;
}

.helper-text {
  margin-top: 8px;
  font-size: 12px;
  color: #aaa;
}

.bottom-top {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  margin-bottom: 12px;
}

.preview-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.primary-btn,
.secondary-btn,
.danger-btn,
.danger-btn-inline {
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
  color: #fff;
}

.primary-btn {
  background: #0a84ff;
}

.secondary-btn {
  background: #444;
}

.danger-btn,
.danger-btn-inline {
  background: #8a2b2b;
}

.danger-btn {
  margin-top: 12px;
}

.create-video-btn {
  min-width: 180px;
  font-weight: 700;
}

.video-controls-grid {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px;
  margin-bottom: 14px;
}

.mini-card {
  border: 1px solid #333;
  background: #1b1b1b;
  border-radius: 14px;
  padding: 12px;
}

.mini-label {
  font-size: 12px;
  color: #aaa;
  margin-bottom: 8px;
}

.speed-card {
  min-width: 0;
}

.speed-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.speed-chip {
  border: 1px solid #3a3a3a;
  background: #232323;
  color: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
}

.speed-chip.active {
  background: #0a84ff;
  border-color: #0a84ff;
}

.progress-card {
  margin-bottom: 14px;
  border: 1px solid #2e4f70;
  background: #162331;
  border-radius: 14px;
  padding: 12px;
}

.progress-top-line {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #d7ebff;
  margin-bottom: 8px;
}

.progress-bar {
  width: 100%;
  height: 12px;
  border-radius: 999px;
  background: #283746;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #0a84ff, #63b3ff);
  transition: width 0.25s ease;
}

.last-generated-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border: 1px solid #2d5d32;
  background: #132016;
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 14px;
}

.last-generated-title {
  font-weight: 700;
  color: #d9ffd9;
  margin-bottom: 4px;
}

.last-generated-meta {
  font-size: 12px;
  color: #a9d8a9;
}

.last-generated-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.small-dark-btn,
.small-blue-btn {
  border: none;
  border-radius: 10px;
  padding: 8px 12px;
  color: #fff;
  cursor: pointer;
  text-decoration: none;
  font-size: 13px;
}

.small-dark-btn {
  background: #2a2a2a;
}

.small-blue-btn {
  background: #0a84ff;
}

.video-generate-error {
  border: 1px solid #7a2f2f;
  background: #2a1717;
  border-radius: 12px;
  padding: 10px 12px;
  color: #ffb6b6;
  margin-bottom: 14px;
  font-size: 13px;
}

.history-title {
  margin: 14px 0 10px;
}

.video-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: #1c1c1c;
}

.video-row.active {
  background: #0f375c;
}

.smart-video-row {
  justify-content: space-between;
  border: 1px solid #2d2d2d;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.video-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.video-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #272727;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-texts {
  min-width: 0;
}

.video-name {
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.video-sub {
  font-size: 12px;
  color: #a9a9a9;
  margin-top: 2px;
}

.video-actions {
  display: flex;
  gap: 8px;
}

.icon-btn-dark,
.icon-btn-blue,
.icon-btn-red,
.icon-link,
.download-link-strong {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: #fff;
  border: none;
  cursor: pointer;
}

.icon-btn-dark {
  background: #2d2d2d;
}

.icon-btn-blue,
.download-link-strong {
  background: #0a84ff;
}

.icon-btn-red {
  background: #a93226;
}

.download-link-strong {
  font-size: 18px;
}

.video-empty,
.empty-thumbs {
  color: #aaa;
  font-size: 13px;
  padding: 10px 0;
}

.btn-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: -2px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.toast {
  position: fixed;
  top: 18px;
  right: 18px;
  width: min(380px, calc(100vw - 24px));
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 14px;
  border-radius: 16px;
  color: #fff;
  z-index: 99999;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(10px);
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
  background: rgba(255,255,255,0.18);
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
  background: #171717;
  color: #fff;
  border: 1px solid #333;
  border-radius: 18px;
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.confirm-header {
  padding: 18px 18px 8px;
}

.confirm-title {
  font-size: 18px;
  font-weight: 800;
}

.confirm-body {
  padding: 0 18px 18px;
  color: #d4d4d4;
  line-height: 1.6;
  white-space: pre-line;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px 18px;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.22s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

@media (max-width: 1100px) {
  .export-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .datetime-row,
  .video-controls-grid {
    grid-template-columns: 1fr;
  }

  .bottom-top,
  .last-generated-card,
  .smart-video-row {
    flex-direction: column;
    align-items: stretch;
  }

  .video-actions,
  .last-generated-actions,
  .preview-actions,
  .confirm-actions {
    flex-wrap: wrap;
  }

  .thumb-toolbar {
    flex-direction:column;
    align-items:flex-start;
  }

  .toast {
    left: 12px;
    right: 12px;
    width: auto;
  }
}
</style>