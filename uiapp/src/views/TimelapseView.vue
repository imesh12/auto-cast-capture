<template>
  <div class="panel-title">
    <div>
      <h3><span class="title-icon">
          <FontAwesomeIcon :icon="['fas', 'hourglass-half']" />
        </span>{{ isCreateMode ? "タイムラプス新規作成" : "タイムラプス設定" }}</h3>
      <p>
        スケジュール保存後はまだ撮影開始されません。保存後に「開始」ボタンを押すと有効になります。
      </p>
    </div>
    <div>
      <button class="cancel-btn" @click="cancelTimelapseEdit">
        <FontAwesomeIcon :icon="['fas', 'xmark']" />
      </button>
    </div>

  </div>
  <div class="timelapse-page">
    <div class="single-column">
      <div class="panel">

        <div class="field">
          <label class="field-label">カメラ</label>
          <select v-model.number="selectedCameraId" @change="loadCamera" class="input">
            <option v-for="c in cameras" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>

          <div v-if="isCreateMode && !cameras.length" class="helper-text">
            使用可能なカメラがありません。既存スケジュールを削除すると再利用できます。
          </div>
        </div>
      </div>


      <div class="schedule-card">
        <h4>
 スケジュール設定
        </h4>
        <!-- day selector -->
        <div class="field">
          <label class="field-label">撮影日</label>
          <div class="day-select">
            <div class="day-preset-controls">
              <select
                :value="dayMode"
                class="input day-preset-select"
                @change="applyDayMode($event.target.value)"
              >
                <option value="custom">カスタム</option>
                <option value="everyday">毎日</option>
                <option value="weekdays">平日</option>
                <option value="weekends">土日</option>
              </select>
              <button type="button" class="day-reset-btn" @click="resetDaySelection">
                <FontAwesomeIcon :icon="['fas', 'arrow-rotate-right']" />
              </button>
            </div>

            <div class="days-grid">
              <label v-for="d in days" :key="d.value" class="day-chip">
                <input type="checkbox" :value="d.value" v-model="selectedDays" @change="dayMode = 'custom'">
                <span>{{ d.label }}</span>
              </label>

            </div>

            
          </div>
        </div>

        <!-- time selector -->
        <div class="field">
          <label class="field-label">撮影時間</label>

          <div class="time-select">
            <!-- time selector left col -->
            <div class="time-mode-field">
              <label>撮影時間を指定</label>
              <select
                :value="timeMode"
                class="input time-mode-select"
                @change="applyTimeMode($event.target.value)"
              >
                <option value="custom">時間指定</option>
                <option value="allDay">終日</option>
              </select>
            </div>

            <!-- time selector right col -->
            <div class="time-row" :class="{ disabled: timeMode === 'allDay' }">
              <div class="time-box">
                <label>開始</label>
                <select v-model.number="cam.tl_start_hour" class="input" :disabled="timeMode === 'allDay'">
                  <option :value="null">選択してください</option>
                  <option v-for="h in hourOptionsStart" :key="h" :value="h">
                    {{ formatHour(h) }}
                  </option>
                </select>
              </div>

              <div class="time-separator">〜</div>

              <div class="time-box">
                <label>終了</label>
                <select v-model.number="cam.tl_end_hour" class="input" :disabled="timeMode === 'allDay'">
                  <option :value="null">選択してください</option>
                  <option v-for="h in hourOptionsEnd" :key="h" :value="h">
                    {{ formatHour(h) }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div class="helper-text">
            ※ 現在は時間単位の設定です。30分単位が必要な場合は backend 側の拡張が必要です。
          </div>
        </div>
        <!-- mode selector -->
        <div class="field mode-field">
          <label class="field-label">撮影モード</label>
          <select
            v-model.number="cam.tl_interval"
            class="input mode-select"
            :class="{ 'is-placeholder': !Number(cam.tl_interval) }"
          >
            <option :value="0" disabled>モードを選択してください</option>
            <option v-for="m in intervalOptions" :key="m.value" :value="m.value">
              {{ m.label }}
            </option>
          </select>
        </div>

        <div class="summary-box">
          <div class="summary-head">
            <div class="summary-title">現在の設定</div>

            <div class="mini-status-row">
              <span v-if="hasUnsavedChanges" class="mini-badge warning">未保存</span>
              <span v-else-if="hasTimelapseSchedule(cam)" class="mini-badge success">保存済み</span>
              <span v-else class="mini-badge neutral">未設定</span>
            </div>
          </div>

          <div class="summary-text">{{ scheduleSummary }}</div>
        </div>

        <div class="action-row">
          <button class="primary-btn" @click="save" :disabled="!selectedCameraId">
            {{ isCreateMode ? "💾 作成して保存" : "💾 保存" }}
          </button>

          <button class="danger-btn-inline" @click="deleteTimelapseConfig"
            :disabled="!selectedCameraId || isCreateModeWithoutSavedSchedule">
            🗑 タイムラプス設定のみ削除
          </button>
        </div>
      </div>

      <div class="control-card">
        <div class="status-grid">
          <div class="status-block">
            <div class="status-label">カメラ状態</div>
            <div class="status-badge" :class="cameraStatusClass">
              {{ cameraStatusText }}
            </div>
            <div class="status-sub">{{ cameraStatusDescription }}</div>
          </div>

          <div class="status-block">
            <div class="status-label">サービス状態</div>
            <div class="status-badge" :class="serviceStatusClass">
              {{ serviceStatusText }}
            </div>
            <div class="status-sub">
              {{ isRunning ? "スケジューラーが稼働中です" : "スケジューラーは停止中です" }}
            </div>
          </div>
        </div>

        <div class="status-detail-grid">
          <div class="detail-card">
            <div class="detail-label">最終撮影</div>
            <div class="detail-value">{{ formatStatusDate(cam.tl_last_file_at) }}</div>
          </div>

          <div class="detail-card">
            <div class="detail-label">最終実行</div>
            <div class="detail-value">{{ formatStatusDate(cam.tl_last_run) }}</div>
          </div>
        </div>

        <div v-if="cam.last_error" class="error-box">
          <strong>最終エラー:</strong> {{ cam.last_error }}
        </div>

        <div class="control-actions">
          <button class="start-btn" @click="startTL" :disabled="startDisabled">
            ▶ 開始
          </button>

          <button class="stop-btn" @click="stopTL" :disabled="stopDisabled">
            ⏹ 停止
          </button>
        </div>
      </div>

      <div class="log-card">
        <div class="log-header">
          <h3>📜 動作ログ</h3>
          <div class="log-count">{{ logs.length }} 件</div>
        </div>

        <div class="log-list">
          <div v-for="l in logs" :key="`${l.time}-${l.msg}`" class="log-item" :class="logClassName(l.type)">
            <div class="log-time">{{ formatLogTime(l.time) }}</div>
            <div class="log-body">
              <div class="log-type">{{ logLabel(l.type) }}</div>
              <div class="log-message">{{ l.msg }}</div>
            </div>
          </div>

          <div v-if="!logs.length" class="log-empty">
            ログはまだありません。
          </div>
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
import { ref, onMounted, onBeforeUnmount, computed, watch } from "vue"
import { useRouter } from "vue-router"
import api from "../api/api"

const router = useRouter()

const cameras = ref([])
const cam = ref({
  timelapse_enabled: false,
  tl_interval: 0,
  tl_start_hour: null,
  tl_end_hour: null,
  tl_days: "",
  tl_status: "stopped",
  tl_is_running: 0,
  tl_last_run: 0,
  tl_last_file_at: 0,
  last_error: ""
})

const selectedCameraId = ref(null)
const selectedDays = ref([])

const dayMode = ref("custom")
const timeMode = ref("custom")

const isRunning = ref(false)
const logs = ref([])

const hasUnsavedChanges = ref(false)
const savedSnapshot = ref("")

const isCreateMode = ref(localStorage.getItem("timelapse_create_new") === "1")

const toast = ref({
  show: false,
  type: "success",
  title: "",
  message: ""
})

const confirmState = ref({
  show: false,
  title: "",
  message: "",
  resolver: null
})

let statusTimer = null
let toastTimer = null

const days = [
  { label: "日", value: 0 },
  { label: "月", value: 1 },
  { label: "火", value: 2 },
  { label: "水", value: 3 },
  { label: "木", value: 4 },
  { label: "金", value: 5 },
  { label: "土", value: 6 }
]

const dayLabels = {
  0: "日",
  1: "月",
  2: "火",
  3: "水",
  4: "木",
  5: "金",
  6: "土"
}

const intervalOptions = [
  { label: "2秒ごと", value: 2 },
  { label: "10分ごと", value: 600 },
  { label: "15分ごと", value: 900 },
  { label: "30分ごと", value: 1800 },
  { label: "1時間ごと", value: 3600 },
  { label: "3時間ごと", value: 10800 },
  { label: "6時間ごと", value: 21600 },
  { label: "1日ごと", value: 86400 }
]

const hourOptionsStart = Array.from({ length: 24 }, (_, i) => i)
const hourOptionsEnd = Array.from({ length: 24 }, (_, i) => i + 1)

const isCreateModeWithoutSavedSchedule = computed(() => {
  if (!isCreateMode.value) return false
  return !hasTimelapseSchedule(cam.value)
})

const scheduleSummary = computed(() => {
  const hasDays = selectedDays.value.length > 0
  const hasInterval = Number(cam.value.tl_interval) > 0
  const hasTime =
    timeMode.value === "allDay" ||
    (
      cam.value.tl_start_hour !== null &&
      cam.value.tl_start_hour !== undefined &&
      cam.value.tl_end_hour !== null &&
      cam.value.tl_end_hour !== undefined
    )

  if (!hasDays && !hasInterval && !hasTime) {
    return "スケジュール未設定"
  }

  const dayText = hasDays ? getDaySummary(selectedDays.value) : "曜日未選択"

  const timeText =
    timeMode.value === "allDay"
      ? "終日"
      : (
        cam.value.tl_start_hour !== null &&
          cam.value.tl_end_hour !== null
          ? `${formatHour(cam.value.tl_start_hour)}〜${formatHour(cam.value.tl_end_hour)}`
          : "時間未設定"
      )

  const modeText =
    intervalOptions.find(x => x.value === Number(cam.value.tl_interval))?.label || "モード未設定"

  return `${dayText} / ${timeText} / ${modeText}`
})

const serviceStatusText = computed(() => (isRunning.value ? "稼働中" : "停止中"))
const serviceStatusClass = computed(() => (isRunning.value ? "running" : "stopped"))

const cameraStatusText = computed(() => {
  const status = String(cam.value.tl_status || "").toLowerCase()
  const hasSchedule = hasTimelapseSchedule(cam.value)
  const enabled =
    Number(cam.value.timelapse_enabled) === 1 || cam.value.timelapse_enabled === true

  if (!hasSchedule) return "未設定"
  if (!enabled) return "停止中"
  if (status === "error") return "エラー"
  if (status === "waiting_day" || status === "waiting_time") return "待機中"
  return "稼働中"
})

const cameraStatusClass = computed(() => {
  const text = cameraStatusText.value

  if (text === "稼働中") return "running"
  if (text === "待機中") return "hold"
  if (text === "エラー") return "stopped"
  if (text === "未設定") return "neutral"
  return "stopped"
})

const cameraStatusDescription = computed(() => {
  const status = String(cam.value.tl_status || "").toLowerCase()
  const hasSchedule = hasTimelapseSchedule(cam.value)
  const enabled =
    Number(cam.value.timelapse_enabled) === 1 || cam.value.timelapse_enabled === true

  const intervalLabel =
    intervalOptions.find(x => x.value === Number(cam.value.tl_interval))?.label || "設定間隔"

  if (!hasSchedule) return "先にスケジュールを保存してください。"
  if (!enabled) return "保存済みですが、まだ開始されていません。"
  if (status === "error") return cam.value.last_error || "撮影に失敗しました。"

  if (status === "capturing") {
    return "スケジュールは稼働中です。現在撮影中です。"
  }

  if (status === "ok") {
    return cam.value.tl_last_file_at
      ? `スケジュールは稼働中です。最新撮影: ${formatStatusDate(cam.value.tl_last_file_at)}`
      : "スケジュールは稼働中です。正常に動作しています。"
  }

  if (status === "waiting_day") {
    return "本日は撮影対象の曜日ではありません。"
  }

  if (status === "waiting_time") {
    return "現在は撮影時間外です。"
  }

  if (status === "waiting_interval" || status === "hold") {
    return `スケジュールは稼働中です。${intervalLabel} の次回撮影を待機しています。`
  }

  return "状態を確認してください。"
})

const startDisabled = computed(() => {
  if (!selectedCameraId.value) return true
  if (!hasTimelapseSchedule(cam.value)) return true
  if (hasUnsavedChanges.value) return true
  return Number(cam.value.timelapse_enabled) === 1 || cam.value.timelapse_enabled === true
})

const stopDisabled = computed(() => {
  if (!selectedCameraId.value) return true
  return !(Number(cam.value.timelapse_enabled) === 1 || cam.value.timelapse_enabled === true)
})

function isAuthError(error) {
  const msg = String(error?.message || "").toLowerCase()
  return msg.includes("login required") || msg.includes("http 401") || msg.includes("401")
}

async function handleAuthError(error) {
  if (!isAuthError(error)) return false
  api.clearSession()
  await router.replace("/login")
  return true
}

function parseDays(str) {
  if (str == null || str === "") return []
  return String(str)
    .split(",")
    .map(v => Number(v))
    .filter(v => !Number.isNaN(v))
    .sort((a, b) => a - b)
}

function hasTimelapseSchedule(camera) {
  return (
    Number(camera?.tl_interval || 0) > 0 ||
    String(camera?.tl_days || "").trim() !== ""
  )
}

function formatHour(h) {
  if (h == null || h === "") return "--:--"
  const hh = String(h).padStart(2, "0")
  return `${hh}:00`
}

function formatStatusDate(v) {
  const n = Number(v || 0)
  if (!n) return "—"
  return new Date(n).toLocaleString()
}

function sameDays(a, b) {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

function detectDayMode() {
  const sorted = [...selectedDays.value].sort((a, b) => a - b)

  if (sameDays(sorted, [0, 1, 2, 3, 4, 5, 6])) {
    dayMode.value = "everyday"
  } else if (sameDays(sorted, [1, 2, 3, 4, 5])) {
    dayMode.value = "weekdays"
  } else if (sameDays(sorted, [0, 6])) {
    dayMode.value = "weekends"
  } else {
    dayMode.value = "custom"
  }
}

function detectTimeMode() {
  const start = cam.value.tl_start_hour
  const end = cam.value.tl_end_hour

  if (
    (start === null || start === undefined || start === "") &&
    (end === null || end === undefined || end === "")
  ) {
    timeMode.value = "custom"
    return
  }

  timeMode.value =
    Number(start) === 0 && Number(end) === 24 ? "allDay" : "custom"
}

function applyDayMode(modeName) {
  dayMode.value = modeName

  if (modeName === "everyday") {
    selectedDays.value = [0, 1, 2, 3, 4, 5, 6]
  } else if (modeName === "weekdays") {
    selectedDays.value = [1, 2, 3, 4, 5]
  } else if (modeName === "weekends") {
    selectedDays.value = [0, 6]
  } else if (modeName === "custom") {
    if (!selectedDays.value.length) {
      selectedDays.value = []
    }
  }
}

function resetDaySelection() {
  dayMode.value = "custom"
  selectedDays.value = []
}

function applyTimeMode(modeName) {
  timeMode.value = modeName

  if (modeName === "allDay") {
    cam.value.tl_start_hour = 0
    cam.value.tl_end_hour = 24
  } else if (modeName === "custom") {
    if (
      Number(cam.value.tl_start_hour) === 0 &&
      Number(cam.value.tl_end_hour) === 24
    ) {
      cam.value.tl_start_hour = 8
      cam.value.tl_end_hour = 17
    } else if (cam.value.tl_start_hour == null || cam.value.tl_end_hour == null) {
      cam.value.tl_start_hour = 8
      cam.value.tl_end_hour = 17
    }
  }
}

function getDaySummary(values) {
  const sorted = [...values].sort((a, b) => a - b)

  if (sameDays(sorted, [0, 1, 2, 3, 4, 5, 6])) return "毎日"
  if (sameDays(sorted, [1, 2, 3, 4, 5])) return "平日"
  if (sameDays(sorted, [0, 6])) return "土日"
  if (sorted.length === 0) return "曜日未選択"

  return sorted
    .map(v => dayLabels[v])
    .filter(Boolean)
    .join("・")
}

function formatLogTime(v) {
  return new Date(v).toLocaleString()
}

function logLabel(type) {
  if (type === "error") return "エラー"
  if (type === "warn") return "警告"
  if (type === "info") return "情報"
  if (type === "debug") return "確認"
  return type || "ログ"
}

function logClassName(type) {
  if (type === "error") return "log-error"
  if (type === "warn") return "log-warn"
  if (type === "info") return "log-info"
  if (type === "debug") return "log-debug"
  return ""
}

function cancelTimelapseEdit() {
  localStorage.removeItem("timelapse_create_new")
  router.push("/manage-event")
}

function isSelectedCameraTimelapseActive() {
  return Number(cam.value.timelapse_enabled) === 1 || cam.value.timelapse_enabled === true
}

function buildScheduleSnapshot(camera) {
  return JSON.stringify({
    id: Number(camera?.id || 0),
    tl_interval: Number(camera?.tl_interval || 0),
    tl_start_hour:
      camera?.tl_start_hour === null || camera?.tl_start_hour === undefined || camera?.tl_start_hour === ""
        ? null
        : Number(camera.tl_start_hour),
    tl_end_hour:
      camera?.tl_end_hour === null || camera?.tl_end_hour === undefined || camera?.tl_end_hour === ""
        ? null
        : Number(camera.tl_end_hour),
    tl_days: [...selectedDays.value].sort((a, b) => a - b).join(","),
    timelapse_enabled: Number(camera?.timelapse_enabled) === 1 || camera?.timelapse_enabled === true
  })
}

function markSavedSnapshot() {
  savedSnapshot.value = buildScheduleSnapshot(cam.value)
  hasUnsavedChanges.value = false
}

function checkUnsavedChanges() {
  hasUnsavedChanges.value = buildScheduleSnapshot(cam.value) !== savedSnapshot.value
}

function showToast(type, title, message) {
  toast.value = {
    show: true,
    type,
    title,
    message
  }

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
    confirmState.value = {
      show: true,
      title,
      message,
      resolver: resolve
    }
  })
}

function resolveConfirm(result) {
  if (confirmState.value.resolver) {
    confirmState.value.resolver(result)
  }

  confirmState.value = {
    show: false,
    title: "",
    message: "",
    resolver: null
  }
}

function enterCreateMode() {
  isCreateMode.value = true
  localStorage.setItem("timelapse_create_new", "1")
}

function exitCreateMode() {
  isCreateMode.value = false
  localStorage.removeItem("timelapse_create_new")
}

async function fetchFullCamera(cameraId) {
  return await api.getCamera(cameraId)
}

async function selectCameraAndReload(cameraId) {
  selectedCameraId.value = Number(cameraId)
  localStorage.setItem("timelapse_selected_camera_id", String(cameraId))

  const fullCam = await fetchFullCamera(cameraId)

  cam.value = {
    ...fullCam,
    timelapse_enabled: Number(fullCam.timelapse_enabled) === 1,
    tl_interval: Number(fullCam.tl_interval || 0),
    tl_start_hour:
      fullCam.tl_start_hour === null || fullCam.tl_start_hour === undefined || fullCam.tl_start_hour === ""
        ? null
        : Number(fullCam.tl_start_hour),
    tl_end_hour:
      fullCam.tl_end_hour === null || fullCam.tl_end_hour === undefined || fullCam.tl_end_hour === ""
        ? null
        : Number(fullCam.tl_end_hour),
    tl_status: fullCam.tl_status || "stopped",
    tl_is_running: Number(fullCam.tl_is_running || 0),
    tl_last_run: Number(fullCam.tl_last_run || 0),
    tl_last_file_at: Number(fullCam.tl_last_file_at || 0),
    last_error: fullCam.last_error || ""
  }

  selectedDays.value = parseDays(cam.value.tl_days)
  detectDayMode()
  detectTimeMode()
  markSavedSnapshot()
}

watch(
  () => selectedDays.value,
  () => {
    detectDayMode()
  },
  { deep: true }
)

watch(
  () => [cam.value.tl_start_hour, cam.value.tl_end_hour],
  () => {
    detectTimeMode()
  }
)

watch(selectedCameraId, (val) => {
  if (val != null) {
    localStorage.setItem("timelapse_selected_camera_id", String(val))
  }
})

watch(
  () => [
    cam.value.tl_interval,
    cam.value.tl_start_hour,
    cam.value.tl_end_hour,
    cam.value.timelapse_enabled,
    selectedDays.value.join(","),
    dayMode.value,
    timeMode.value
  ],
  () => {
    checkUnsavedChanges()
  }
)

async function loadCameras(preferredCameraId = null) {
  const allCameras = await api.getCameras()
  const allList = Array.isArray(allCameras) ? allCameras : []

  cameras.value = isCreateMode.value
    ? allList.filter(c => !hasTimelapseSchedule(c))
    : allList

  if (!cameras.value.length) {
    selectedCameraId.value = null
    cam.value = {
      timelapse_enabled: false,
      tl_interval: 0,
      tl_start_hour: null,
      tl_end_hour: null,
      tl_days: "",
      tl_status: "stopped",
      tl_is_running: 0,
      tl_last_run: 0,
      tl_last_file_at: 0,
      last_error: ""
    }
    selectedDays.value = []
    savedSnapshot.value = ""
    hasUnsavedChanges.value = false
    return
  }

  if (preferredCameraId && cameras.value.some(c => Number(c.id) === Number(preferredCameraId))) {
    selectedCameraId.value = Number(preferredCameraId)
    await loadCamera()
    return
  }

  if (isCreateMode.value) {
    if (!selectedCameraId.value || !cameras.value.some(c => Number(c.id) === Number(selectedCameraId.value))) {
      selectedCameraId.value = cameras.value[0].id
    }
    await loadCamera()
    return
  }

  const savedId = Number(localStorage.getItem("timelapse_selected_camera_id") || 0)

  if (savedId && cameras.value.some(c => Number(c.id) === savedId)) {
    selectedCameraId.value = savedId
  } else if (
    selectedCameraId.value &&
    cameras.value.some(c => Number(c.id) === Number(selectedCameraId.value))
  ) {
    // keep current selection
  } else {
    selectedCameraId.value = cameras.value[0].id
  }

  await loadCamera()
}

async function loadCamera() {
  const found = cameras.value.find(x => Number(x.id) === Number(selectedCameraId.value))
  if (!found) return

  cam.value = {
    ...found,
    timelapse_enabled: Number(found.timelapse_enabled) === 1,
    tl_interval: Number(found.tl_interval || 0),
    tl_start_hour:
      found.tl_start_hour === null || found.tl_start_hour === undefined || found.tl_start_hour === ""
        ? null
        : Number(found.tl_start_hour),
    tl_end_hour:
      found.tl_end_hour === null || found.tl_end_hour === undefined || found.tl_end_hour === ""
        ? null
        : Number(found.tl_end_hour),
    tl_status: found.tl_status || "stopped",
    tl_is_running: Number(found.tl_is_running || 0),
    tl_last_run: Number(found.tl_last_run || 0),
    tl_last_file_at: Number(found.tl_last_file_at || 0),
    last_error: found.last_error || ""
  }

  selectedDays.value = parseDays(cam.value.tl_days)

  detectDayMode()
  detectTimeMode()
  markSavedSnapshot()
}

async function save() {
  if (!selectedCameraId.value) {
    showToast("warning", "カメラ未選択", "対象のカメラを選択してください。")
    return
  }

  if (!selectedDays.value.length) {
    showToast("warning", "撮影日未設定", "撮影する曜日を選択してください。")
    return
  }

  if (!Number(cam.value.tl_interval)) {
    showToast("warning", "撮影モード未設定", "撮影間隔を選択してください。")
    return
  }

  if (
    timeMode.value === "custom" &&
    (
      cam.value.tl_start_hour == null ||
      cam.value.tl_end_hour == null ||
      Number(cam.value.tl_start_hour) >= Number(cam.value.tl_end_hour)
    )
  ) {
    showToast("warning", "時間設定エラー", "開始時間と終了時間を正しく設定してください。")
    return
  }

  try {
    const fullCam = await fetchFullCamera(selectedCameraId.value)

    if (isSelectedCameraTimelapseActive()) {
      const ok = await askConfirm(
        "動作中の設定を編集します",
        "このカメラのタイムラプスは現在動作中です。\n編集を続けると一度停止します。よろしいですか？"
      )
      if (!ok) return

      const stopPayload = {
        ...fullCam,
        id: selectedCameraId.value,
        timelapse_enabled: 0,
        tl_status: "stopped",
        tl_is_running: 0
      }

      const stopData = await api.updateCamera(stopPayload)
      if (!stopData.ok) {
        showToast("error", "停止失敗", "編集中の停止処理に失敗しました。")
        return
      }
    }

    const payload = {
      ...fullCam,
      id: selectedCameraId.value,
      timelapse_enabled: 0,
      tl_days: [...selectedDays.value].sort((a, b) => a - b).join(","),
      tl_start_hour: timeMode.value === "allDay" ? 0 : Number(cam.value.tl_start_hour),
      tl_end_hour: timeMode.value === "allDay" ? 24 : Number(cam.value.tl_end_hour),
      tl_interval: Number(cam.value.tl_interval),
      tl_status: "stopped",
      tl_is_running: 0,
      last_error: ""
    }

    const data = await api.updateCamera(payload)
    if (!data.ok) {
      console.error("save failed:", data)
      showToast("error", "保存失敗", data.error || "設定の保存に失敗しました。")
      return
    }

    exitCreateMode()

    await loadCameras(selectedCameraId.value)
    await selectCameraAndReload(selectedCameraId.value)
    await loadStatus()
    await loadLogs()

    showToast(
      "success",
      "保存完了",
      "スケジュールを保存しました。今すぐ「開始」することも、あとで開始することもできます。"
    )
  } catch (e) {
    console.error("save error:", e)
    if (await handleAuthError(e)) return
    showToast("error", "保存失敗", "保存処理でエラーが発生しました。")
  }
}

async function deleteTimelapseConfig() {
  if (!selectedCameraId.value) {
    showToast("warning", "カメラ未選択", "対象のカメラを選択してください。")
    return
  }

  const ok = await askConfirm(
    "設定削除",
    "このカメラのタイムラプス設定のみを削除します。\nカメラ情報自体は削除されません。よろしいですか？"
  )
  if (!ok) return

  try {
    const fullCam = await fetchFullCamera(selectedCameraId.value)

    const payload = {
      ...fullCam,
      id: selectedCameraId.value,
      timelapse_enabled: 0,
      tl_interval: 0,
      tl_start_hour: null,
      tl_end_hour: null,
      tl_days: "",
      tl_last_run: 0,
      tl_last_file_at: 0,
      tl_status: "stopped",
      tl_is_running: 0,
      last_error: ""
    }

    const data = await api.updateCamera(payload)
    if (!data.ok) {
      console.error("delete failed:", data)
      showToast("error", "削除失敗", data.error || "設定削除に失敗しました。")
      return
    }

    selectedDays.value = []
    dayMode.value = "custom"
    timeMode.value = "custom"

    enterCreateMode()

    await loadCameras()
    await loadStatus()
    await loadLogs()

    savedSnapshot.value = ""
    hasUnsavedChanges.value = false

    showToast("success", "削除完了", "タイムラプス設定を削除しました。")
  } catch (e) {
    console.error("deleteTimelapseConfig error:", e)
    if (await handleAuthError(e)) return
    showToast("error", "削除失敗", "削除処理でエラーが発生しました。")
  }
}

async function run() {
  if (!selectedCameraId.value) {
    showToast("warning", "カメラ未選択", "対象のカメラを選択してください。")
    return
  }

  try {
    const data = await api.runTimelapseNow(selectedCameraId.value)

    if (!data.ok) {
      showToast("error", "テスト撮影失敗", data.error || "テスト撮影に失敗しました。")
      return
    }

    await loadCameras(selectedCameraId.value)
    await loadLogs()
    showToast("success", "テスト撮影完了", "静止画を1枚撮影しました。Export タブで確認できます。")
  } catch (e) {
    console.error("run error:", e)
    if (await handleAuthError(e)) return
    showToast("error", "テスト撮影失敗", "テスト撮影中にエラーが発生しました。")
  }
}

async function startTL() {
  if (!selectedCameraId.value) {
    showToast("warning", "カメラ未選択", "対象のカメラを選択してください。")
    return
  }

  if (hasUnsavedChanges.value) {
    showToast("warning", "未保存の変更", "先に保存してから開始してください。")
    return
  }

  try {
    const savedCam = await fetchFullCamera(selectedCameraId.value)

    const savedDays = parseDays(savedCam.tl_days)
    const savedInterval = Number(savedCam.tl_interval || 0)

    if (!savedDays.length || !savedInterval) {
      showToast("warning", "設定不足", "先にスケジュールを保存してください。")
      return
    }

    const enableData = await api.updateCamera({
      ...savedCam,
      id: selectedCameraId.value,
      timelapse_enabled: 1,
      tl_status: "waiting_interval",
      tl_is_running: 0,
      last_error: ""
    })

    if (!enableData.ok) {
      showToast("error", "開始失敗", "開始前の有効化に失敗しました。")
      return
    }

    const data = await api.startTimelapseService()

    if (!data.ok) {
      showToast("error", "開始失敗", "タイムラプス開始に失敗しました。")
      return
    }

    await loadStatus()
    await loadLogs()
    await loadCameras(selectedCameraId.value)
    await selectCameraAndReload(selectedCameraId.value)

    showToast("success", "開始しました", "タイムラプスを開始しました。")
  } catch (e) {
    console.error("startTL error:", e)
    if (await handleAuthError(e)) return
    showToast("error", "開始失敗", "開始処理でエラーが発生しました。")
  }
}

async function stopTL() {
  if (!selectedCameraId.value) {
    showToast("warning", "カメラ未選択", "対象のカメラを選択してください。")
    return
  }

  const ok = await askConfirm("停止確認", "このタイムラプスを停止しますか？")
  if (!ok) return

  try {
    const savedCam = await fetchFullCamera(selectedCameraId.value)

    if (savedCam && savedCam.ok !== false) {
      await api.updateCamera({
        ...savedCam,
        id: selectedCameraId.value,
        timelapse_enabled: 0,
        tl_status: "stopped",
        tl_is_running: 0,
        last_error: ""
      })
    }

    const data = await api.stopTimelapseService()

    if (!data.ok) {
      showToast("error", "停止失敗", "停止に失敗しました。")
      return
    }

    await loadStatus()
    await loadLogs()
    await loadCameras(selectedCameraId.value)
    await selectCameraAndReload(selectedCameraId.value)

    showToast("success", "停止しました", "タイムラプスを停止しました。")
  } catch (e) {
    console.error("stopTL error:", e)
    if (await handleAuthError(e)) return
    showToast("error", "停止失敗", "停止処理でエラーが発生しました。")
  }
}

async function loadStatus() {
  try {
    const data = await api.getTimelapseStatus()
    isRunning.value = !!data.running
  } catch (e) {
    if (await handleAuthError(e)) return
    throw e
  }
}

async function loadLogs() {
  try {
    const data = await api.getTimelapseLogs()
    logs.value = data.logs || []
    isRunning.value = !!data.running
  } catch (e) {
    if (await handleAuthError(e)) return
    throw e
  }
}

onMounted(async () => {
  try {
    if (!api.isLoggedIn()) {
      await router.replace("/login")
      return
    }

    await api.getMe()

    await loadCameras()
    await loadStatus()
    await loadLogs()

    statusTimer = setInterval(async () => {
      try {
        await loadStatus()
        await loadLogs()
      } catch (e) {
        console.error("TimelapseView polling error:", e)
      }
    }, 3000)
  } catch (e) {
    console.error("TimelapseView init error:", e)
    await handleAuthError(e)
  }
})

onBeforeUnmount(() => {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }

  hideToast()
})
</script>

<style scoped>
@import "../styles/theme.css";

.timelapse-page {
  width: min(1180px, calc(100% - 40px));
  margin: 0 auto;
  padding-bottom: 48px;
  color: var(--text-body);
  --card-radius: 16px;
  --control-height: 42px;
  --control-radius: 9px;
}

.single-column {
  width: 100%;
}

.panel {
  border: 1px solid var(--border);
  padding: 20px;
  background: var(--surface);
  color: var(--text-body);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow-md);
}

.panel-title {
  width: min(1180px, calc(100% - 40px));
  margin: 24px auto 16px;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
  color: var(--text-body);
}

.panel-title h3 {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 21px;
  font-weight: 700;
  color: var(--text-heading);
}

.panel-title p {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}



.title-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 15px;
  margin-right: 0;
  flex: 0 0 34px;
}

.field {
  margin-bottom: 20px;
}

.field:last-child {
  margin-bottom: 0;
}

.field-label {
  display: block;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 7px;
  color: var(--text-heading);
}

.day-select {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.day-preset-controls {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  flex: 1 1 330px;
  min-width: 280px;
  max-width: 430px;
}

.day-preset-select {
  min-width: 0;
}

.day-reset-btn {
  width: var(--control-height);
  height: var(--control-height);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--control-radius);
  background: #fff;
  color: var(--primary);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  transition: color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.day-reset-wrap {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.day-reset-btn:hover {
  color: var(--primary-hover);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.input {
  width: 100%;
  min-height: var(--control-height);
  padding: 0 14px;
  border-radius: var(--control-radius);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-body);
  box-sizing: border-box;
  font-size: 14px;
  line-height: var(--control-height);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

select.input {
  appearance: none;
  padding-right: 40px;
  background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' fill='%236b7280' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z' clip-rule='evenodd'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 16px;
}

.input::placeholder {
  color: var(--text-placeholder);
}

.input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.helper-box {
  border: 1px solid var(--border);
  background: var(--primary-soft);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-size: 13px;
  color: var(--primary-hover);
  margin: 10px 0 16px;
}

.schedule-card,
.control-card,
.log-card {
  border: 1px solid var(--border);
  border-radius: var(--card-radius);
  padding: 20px;
  margin-bottom: 16px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.schedule-card {
  margin-top: 16px;
}

.schedule-card h4 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 18px;
  color: var(--text-heading);
  font-size: 16px;
  font-weight: 700;
}

.preset-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 0;
}

.chip {
  border: 1px solid var(--border);
  background: var(--surface-alt);
  color: var(--text-body);
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.chip:hover,
.chip.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 38px);
  justify-content: end;
  gap: 10px;
  align-items: center;
  margin-left: auto;
}

.day-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-body);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  width: 40px;
  height: 38px;
  padding: 0;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
  user-select: none;
}

.day-chip input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.day-chip:hover {
  border-color: var(--primary);
  color: var(--primary-hover);
}

.day-chip:has(input:checked) {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  box-shadow: var(--shadow-sm);
}

.time-select {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}

.time-mode-field {
  flex: 1 1 520px;
  min-width: 240px;
}

.time-mode-field label,
.time-box label {
  display: block;
  margin-bottom: 7px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
}

.time-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex: 0 0 auto;
}

.time-mode-select {
  min-width: 0;
}

.time-box {
  width: 148px;
}

.time-separator {
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--control-height);
  padding: 0 2px;
  font-size: 18px;
  color: var(--text-muted);
}

.disabled {
  opacity: 0.55;
}

.helper-text {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.mode-select {
  width: 100%;
  min-height: var(--control-height);
  padding: 0 40px 0 14px;
  border-radius: var(--control-radius);
  border-color: var(--border);
  background-color: var(--surface);
  color: var(--text-body);
  font-size: 14px;
  line-height: var(--control-height);
  appearance: none;
  box-shadow: none;
}

.mode-select.is-placeholder,
.mode-select option:disabled {
  color: var(--text-placeholder);
}

.summary-box {
  border: 1px solid var(--border);
  background: var(--surface-alt);
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 4px;
}

.summary-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.summary-title {
  font-weight: 600;
  margin-bottom: 0;
  color: var(--text-heading);
}

.summary-text {
  color: var(--text-body);
  font-size: 13px;
  line-height: 1.55;
}

.mini-status-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.mini-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
}

.mini-badge.success {
  background: rgba(16, 185, 129, 0.12);
  color: var(--success);
  border-color: rgba(16, 185, 129, 0.25);
}

.mini-badge.warning {
  background: rgba(245, 158, 11, 0.14);
  color: var(--warning);
  border-color: rgba(245, 158, 11, 0.3);
}

.mini-badge.neutral {
  background: var(--surface);
  color: var(--text-muted);
  border-color: var(--border);
}

.action-row {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}

.primary-btn,
.secondary-btn,
.start-btn,
.stop-btn,
.test-btn,
.danger-btn-inline,
.cancel-btn {
  min-height: 40px;
  border: 1px solid transparent;
  border-radius: 9px;
  padding: 0 16px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.primary-btn {
  background: var(--primary);
  color: #fff;
}

.secondary-btn {
  background: var(--surface-alt);
  color: var(--text-body);
  border: 1px solid var(--border);
}

.start-btn {
  background: var(--primary);
  color: #fff;
}

.stop-btn {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.22);
  color: var(--error);
}

.test-btn {
  background: var(--text-muted);
}

.danger-btn-inline {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.22);
  color: var(--error);
}

.cancel-btn {
  width: 40px;
  height: 40px;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--error);
  color: #fff;
  padding: 0;
  flex: 0 0 40px;
}

.cancel-btn:hover {
  background: #dc2626;
  color: #fff;
}

.primary-btn:hover,
.start-btn:hover {
  background: var(--primary-hover);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.secondary-btn:hover {
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.stop-btn:hover,
.danger-btn-inline:hover {
  background: var(--error);
  color: #fff;
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.start-btn:disabled,
.stop-btn:disabled,
.primary-btn:disabled,
.secondary-btn:disabled,
.test-btn:disabled,
.danger-btn-inline:disabled,
.cancel-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
  filter: grayscale(0.15);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.status-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.status-block,
.detail-card {
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}

.status-label,
.detail-label {
  color: var(--text-muted);
  font-size: 12px;
  margin-bottom: 8px;
}

.detail-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-heading);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 6px;
}

.status-badge.running {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
  border: 1px solid rgba(16, 185, 129, 0.28);
}

.status-badge.ok {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
  border: 1px solid rgba(16, 185, 129, 0.28);
}

.status-badge.capturing {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.28);
}

.status-badge.hold {
  background: var(--primary-soft);
  color: var(--primary-hover);
  border: 1px solid var(--primary-soft);
}

.status-badge.stopped {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.22);
}

.status-badge.neutral {
  background: var(--surface);
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.status-sub {
  color: var(--text-muted);
  font-size: 13px;
}

.error-box {
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.08);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  color: var(--error);
  margin-bottom: 12px;
  font-size: 13px;
  word-break: break-word;
}

.control-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.log-header h3 {
  color: var(--text-heading);
  font-size: 16px;
  font-weight: 700;
}

.log-count {
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-alt);
  padding: 0 9px;
  font-size: 12px;
  color: var(--text-muted);
}

.log-list {
  max-height: 250px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 4px;
}

.log-item {
  display: grid;
  grid-template-columns: 156px 1fr;
  gap: 10px;
  align-items: start;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid var(--border);
}

.log-time {
  font-size: 12px;
  color: var(--text-muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  white-space: nowrap;
}

.log-type {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border-radius: 999px;
  padding: 0 8px;
  background: var(--surface-alt);
  color: var(--text-muted);
  border: 1px solid var(--border);
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 5px;
}

.log-message {
  font-size: 13px;
  color: var(--text-body);
  word-break: break-word;
}

.log-error {
  border-color: rgba(239, 68, 68, 0.22);
  background: rgba(239, 68, 68, 0.04);
}

.log-warn {
  border-color: rgba(245, 158, 11, 0.24);
  background: rgba(245, 158, 11, 0.05);
}

.log-info {
  border-color: rgba(59, 130, 246, 0.18);
  background: rgba(59, 130, 246, 0.04);
}

.log-debug {
  border-color: var(--border);
  background: var(--surface);
}

.log-empty {
  color: var(--text-muted);
  font-size: 13px;
  padding: 10px 0;
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
  color: var(--text-body);
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

@media (max-width: 700px) {
  .panel-title,
  .timelapse-page {
    width: min(100% - 24px, 1180px);
  }

  .panel-title {
    align-items: flex-start;
    padding: 16px;
  }

  .day-select {
    align-items: stretch;
  }

  .day-preset-controls {
    max-width: none;
    min-width: 0;
  }

  .days-grid {
    width: 100%;
    grid-template-columns: repeat(7, minmax(32px, 1fr));
    gap: 8px;
    justify-content: stretch;
    margin-left: 0;
  }

  .day-chip {
    width: 100%;
    height: 36px;
  }

  .time-select,
  .time-row {
    align-items: stretch;
  }

  .time-row {
    flex-wrap: wrap;
  }

  .time-box {
    flex: 1 1 140px;
    width: auto;
  }

  .time-separator {
    height: var(--control-height);
  }

  .status-grid,
  .status-detail-grid {
    grid-template-columns: 1fr;
  }

  .summary-head,
  .control-actions,
  .action-row,
  .confirm-actions {
    flex-wrap: wrap;
  }

  .log-item {
    grid-template-columns: 1fr;
  }

  .toast {
    left: 12px;
    right: 12px;
    width: auto;
  }
}
</style>
