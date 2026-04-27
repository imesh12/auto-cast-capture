<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2>タイムラプス管理</h2>
        <p class="sub">
          タイムラプスの作成・運用・書き出しを、この画面からまとめて行えます。
        </p>
      </div>

      <button class="refresh-btn" @click="loadAll" :disabled="loading">
        {{ loading ? "読込中..." : "更新" }}
      </button>
    </div>

    <div class="plugin-grid">
      <button
        v-for="card in pluginCards"
        :key="card.key"
        class="plugin-card"
        :class="{ active: currentTab === card.key }"
        @click="selectTab(card.key)"
      >
        <div class="plugin-icon">{{ card.icon }}</div>
        <div class="plugin-body">
          <div class="plugin-title">{{ card.label }}</div>
          <div class="plugin-value">{{ card.value }}</div>
          <div class="plugin-desc">{{ card.desc }}</div>
        </div>
      </button>
    </div>

    <div class="panel-switch">
      <button
        :class="{ active: currentTab === 'timelapse' }"
        @click="selectTab('timelapse')"
      >
        Timelapse
      </button>

      <button
        :class="{ active: currentTab === 'export' }"
        @click="selectTab('export')"
      >
        Export
      </button>
    </div>

    <div v-if="currentTab === 'timelapse'" class="panel">
      <div class="panel-header">
        <div>
          <h3>タイムラプス一覧</h3>
          <p class="sub">
            保存済みスケジュールの確認、編集、削除ができます。
          </p>
        </div>

        <div class="header-actions">
          <button class="ghost-btn" @click="openCreateTimelapse">
            タイムラプス新規作成
          </button>

          <button
            v-if="showInlineEditor"
            class="ghost-btn danger-ghost"
            @click="closeTimelapseEditor"
          >
            閉じる
          </button>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-box">
          <div class="stat-label">スケジュール数</div>
          <div class="stat-value">{{ timelapseRows.length }}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">有効</div>
          <div class="stat-value">{{ enabledTimelapseCount }}</div>
        </div>

        <div class="stat-box">
          <div class="stat-label">稼働中</div>
          <div class="stat-value">{{ activeTimelapseCount }}</div>
        </div>
      </div>

      <div v-if="timelapseRows.length" class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>カメラ</th>
              <th>状態</th>
              <th>スケジュール</th>
              <th>最終実行</th>
              <th>最終エラー</th>
              <th>操作</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="cam in timelapseRows" :key="cam.id">
              <td>{{ cam.id }}</td>

              <td>
                <div class="camera-name">{{ cam.name || `Camera ${cam.id}` }}</div>
                <div class="camera-sub">{{ cam.snapshot_url || "-" }}</div>
              </td>

              <td>
                <span class="status-badge" :class="timelapseStatusClass(cam)">
                  {{ timelapseStatusText(cam) }}
                </span>
              </td>

              <td>{{ scheduleText(cam) }}</td>

              <td>{{ formatTimestamp(cam.tl_last_run || cam.tl_last_file_at) }}</td>

              <td class="error-cell">
                {{ cam.last_error || "-" }}
              </td>

              <td>
                <div class="action-row">
                  <button
                    class="small-btn ghost"
                    @click="editTimelapse(cam)"
                    :disabled="busyCameraId === cam.id"
                  >
                    編集
                  </button>

                  <button
                    class="small-btn danger"
                    @click="deleteTimelapseConfigOnly(cam)"
                    :disabled="busyCameraId === cam.id"
                  >
                    スケジュール削除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-box">
        保存済みのタイムラプス設定はありません。
      </div>

      <div v-if="showInlineEditor" class="inline-view">
        <TimelapseView />
      </div>
    </div>

    <div v-else-if="currentTab === 'export'" class="panel export-panel">
      <div class="panel-header">
        <div>
          <h3>エクスポート</h3>
          <p class="sub">
            保存済み画像を期間指定で読み込み、MP4 動画として書き出せます。
          </p>
        </div>
      </div>

      <TimelapseExportView />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue"
import { useRouter } from "vue-router"
import api from "../api/api"
import TimelapseView from "./TimelapseView.vue"
import TimelapseExportView from "./TimelapseExportView.vue"

const router = useRouter()

const currentTab = ref("timelapse")
const showInlineEditor = ref(false)
const loading = ref(false)
const busyCameraId = ref(null)

const cameras = ref([])

const dayLabels = {
  0: "日",
  1: "月",
  2: "火",
  3: "水",
  4: "木",
  5: "金",
  6: "土"
}

const timelapseRows = computed(() => {
  return cameras.value.filter(cam => {
    const hasSchedule =
      Number(cam.timelapse_enabled) === 1 ||
      Number(cam.tl_interval || 0) > 0 ||
      String(cam.tl_days || "").trim() !== ""

    return hasSchedule
  })
})

const enabledTimelapseCount = computed(() => {
  return timelapseRows.value.filter(cam => Number(cam.timelapse_enabled) === 1).length
})

const activeTimelapseCount = computed(() => {
  return timelapseRows.value.filter(cam => isTimelapseActive(cam)).length
})

const pluginCards = computed(() => [
  {
    key: "timelapse",
    icon: "⏱️",
    label: "Timelapse",
    value: `${activeTimelapseCount.value}/${enabledTimelapseCount.value}`,
    desc: "稼働中 / 有効"
  },
  {
    key: "export",
    icon: "🎞️",
    label: "Export",
    value: `${timelapseRows.value.length}`,
    desc: "画像から動画を書き出し"
  }
])

function selectTab(tab) {
  currentTab.value = tab
  showInlineEditor.value = false

  if (tab !== "timelapse") {
    localStorage.removeItem("timelapse_create_new")
  }
}

function parseDays(str) {
  if (str == null || str === "") return []
  return String(str)
    .split(",")
    .map(v => Number(v))
    .filter(v => !Number.isNaN(v))
    .sort((a, b) => a - b)
}

function formatHour(hour) {
  const h = Number(hour)
  if (!Number.isFinite(h)) return "--:--"
  return `${String(h).padStart(2, "0")}:00`
}

function formatInterval(sec) {
  const n = Number(sec || 0)
  if (!n) return "未設定"
  if (n < 60) return `${n}秒ごと`
  if (n % 86400 === 0) return `${n / 86400}日ごと`
  if (n % 3600 === 0) return `${n / 3600}時間ごと`
  if (n % 60 === 0) return `${n / 60}分ごと`
  return `${n}秒ごと`
}

function formatDays(daysStr) {
  const days = parseDays(daysStr)
  if (!days.length) return "曜日未設定"
  if (days.join(",") === "0,1,2,3,4,5,6") return "毎日"
  if (days.join(",") === "1,2,3,4,5") return "平日"
  if (days.join(",") === "0,6") return "土日"
  return days.map(d => dayLabels[d] || d).join("・")
}

function formatTimestamp(value) {
  const n = Number(value)
  if (!n) return "-"
  const d = new Date(n)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toLocaleString()
}

function scheduleText(cam) {
  const interval = formatInterval(cam.tl_interval)
  const days = formatDays(cam.tl_days)

  const start = cam.tl_start_hour
  const end = cam.tl_end_hour

  let timeText = "時間未設定"
  if (Number(start) === 0 && Number(end) === 24) {
    timeText = "終日"
  } else if (start != null && end != null && start !== "" && end !== "") {
    timeText = `${formatHour(start)} - ${formatHour(end)}`
  }

  return `${interval} / ${timeText} / ${days}`
}

function timelapseStatusText(cam) {
  const enabled = Number(cam.timelapse_enabled) === 1
  const hasSchedule =
    Number(cam.tl_interval || 0) > 0 ||
    String(cam.tl_days || "").trim() !== ""

  const status = String(cam.tl_status || "").toLowerCase()

  if (!hasSchedule && !enabled) return "未設定"
  if (!enabled) return "停止中"
  if (status === "error") return "エラー"
  if (status === "waiting_day" || status === "waiting_time") return "待機中"
  return "稼働中"
}

function timelapseStatusClass(cam) {
  const text = timelapseStatusText(cam)

  if (text === "稼働中") return "running"
  if (text === "待機中") return "idle"
  if (text === "エラー") return "error"
  if (text === "未設定") return "idle"
  return "stopped"
}

function isTimelapseActive(cam) {
  const enabled = Number(cam.timelapse_enabled) === 1
  const status = String(cam.tl_status || "").toLowerCase()

  if (!enabled) return false
  if (status === "error") return false
  return true
}

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

async function loadCameras() {
  try {
    const data = await api.getCameras()
    cameras.value = Array.isArray(data) ? data : []
  } catch (e) {
    console.log("loadCameras error:", e)
    if (await handleAuthError(e)) return
    cameras.value = []
  }
}

async function loadAll() {
  loading.value = true
  try {
    await loadCameras()
  } finally {
    loading.value = false
  }
}

async function updateCameraByHttp(payload) {
  return await api.updateCamera(payload)
}

function openCreateTimelapse() {
  localStorage.removeItem("timelapse_selected_camera_id")
  localStorage.setItem("timelapse_create_new", "1")
  currentTab.value = "timelapse"
  showInlineEditor.value = true
}

function closeTimelapseEditor() {
  showInlineEditor.value = false
  localStorage.removeItem("timelapse_create_new")
}

async function editTimelapse(cam) {
  if (isTimelapseActive(cam)) {
    const ok = window.confirm(
      `「${cam.name || `Camera ${cam.id}`}」は現在動作中です。\n編集するため一度停止します。続行しますか？`
    )
    if (!ok) return

    try {
      busyCameraId.value = cam.id

      const result = await updateCameraByHttp({
        ...cam,
        timelapse_enabled: 0,
        tl_status: "stopped",
        tl_is_running: 0,
        last_error: ""
      })

      if (!result.ok) {
        throw new Error(result.error || "failed to stop camera timelapse")
      }

      await loadCameras()
    } catch (e) {
      console.log("editTimelapse stop error:", e)
      if (await handleAuthError(e)) return
      alert(`編集前の停止に失敗しました: ${e.message}`)
      return
    } finally {
      busyCameraId.value = null
    }
  }

  localStorage.setItem("timelapse_selected_camera_id", String(cam.id))
  localStorage.removeItem("timelapse_create_new")
  showInlineEditor.value = true
}

async function deleteTimelapseConfigOnly(cam) {
  const active = isTimelapseActive(cam)

  const ok = active
    ? window.confirm(
        `「${cam.name || `Camera ${cam.id}`}」は現在動作中です。\n停止してスケジュールを削除しますか？`
      )
    : window.confirm(
        `「${cam.name || `Camera ${cam.id}`}」のタイムラプス設定を削除しますか？`
      )

  if (!ok) return

  try {
    busyCameraId.value = cam.id

    const result = await updateCameraByHttp({
      ...cam,
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
    })

    if (!result.ok) {
      throw new Error(result.error || "delete schedule failed")
    }

    if (localStorage.getItem("timelapse_selected_camera_id") === String(cam.id)) {
      localStorage.removeItem("timelapse_selected_camera_id")
    }

    await loadCameras()
  } catch (e) {
    console.log("deleteTimelapseConfigOnly error:", e)
    if (await handleAuthError(e)) return
    alert(`スケジュール削除に失敗しました: ${e.message}`)
  } finally {
    busyCameraId.value = null
  }
}

onMounted(async () => {
  if (!api.isLoggedIn()) {
    await router.replace("/login")
    return
  }

  try {
    await api.getMe()
  } catch (error) {
    console.log("auth check error:", error)
    await handleAuthError(error)
    return
  }

  await loadAll()
})
</script>

<style scoped>
.page{
  min-height:calc(100vh - 60px);
  background:#202020;
  color:#fff;
  padding:20px;
  box-sizing:border-box;
}

.page-header{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:16px;
  margin-bottom:18px;
}

.sub{
  margin:6px 0 0 0;
  color:#c9c9c9;
  font-size:14px;
}

.refresh-btn,
.ghost-btn,
.small-btn,
.panel-switch button,
.plugin-card{
  cursor:pointer;
}

.refresh-btn,
.ghost-btn,
.panel-switch button,
.small-btn{
  border:none;
  border-radius:8px;
  padding:10px 14px;
}

.refresh-btn{
  background:#00bcd4;
  color:#111;
  font-weight:700;
}

.header-actions{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
}

.plugin-grid{
  display:grid;
  grid-template-columns:repeat(2, minmax(0, 1fr));
  gap:14px;
  margin-bottom:18px;
}

.plugin-card{
  display:flex;
  align-items:center;
  gap:14px;
  text-align:left;
  padding:18px;
  border:1px solid #3e3e3e;
  border-radius:12px;
  background:#2b2b2b;
  color:#fff;
}

.plugin-card.active{
  border-color:#00bcd4;
  box-shadow:0 0 0 1px #00bcd4 inset;
}

.plugin-icon{
  font-size:30px;
  width:48px;
  text-align:center;
}

.plugin-title{
  font-size:18px;
  font-weight:700;
}

.plugin-value{
  margin-top:4px;
  font-size:22px;
  font-weight:700;
}

.plugin-desc{
  margin-top:4px;
  color:#c9c9c9;
  font-size:13px;
}

.panel-switch{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  margin-bottom:18px;
}

.panel-switch button{
  background:#343434;
  color:#fff;
}

.panel-switch button.active{
  background:#00bcd4;
  color:#111;
  font-weight:700;
}

.panel{
  background:#2b2b2b;
  border:1px solid #3f3f3f;
  border-radius:12px;
  padding:18px;
}

.panel-header{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:16px;
  margin-bottom:16px;
}

.ghost-btn{
  background:#3a3a3a;
  color:#fff;
}

.danger-ghost{
  background:#7a2f2f;
}

.stats-row{
  display:grid;
  grid-template-columns:repeat(3, minmax(0, 1fr));
  gap:12px;
  margin-bottom:18px;
}

.stat-box{
  background:#202020;
  border:1px solid #444;
  border-radius:10px;
  padding:14px;
}

.stat-label{
  color:#cfcfcf;
  font-size:13px;
  margin-bottom:8px;
}

.stat-value{
  font-size:26px;
  font-weight:700;
}

.table-wrap{
  overflow:auto;
}

.table{
  width:100%;
  border-collapse:collapse;
}

.table th,
.table td{
  padding:12px 10px;
  border-bottom:1px solid #444;
  text-align:left;
  vertical-align:top;
}

.camera-name{
  font-weight:700;
}

.camera-sub{
  margin-top:4px;
  color:#bdbdbd;
  font-size:12px;
  word-break:break-all;
}

.error-cell{
  max-width:220px;
  word-break:break-word;
  color:#ffd1d1;
  font-size:12px;
}

.status-badge{
  display:inline-block;
  padding:6px 10px;
  border-radius:999px;
  font-size:12px;
  font-weight:700;
}

.status-badge.running{
  background:#1f6f3c;
  color:#fff;
}

.status-badge.ok{
  background:#1f6f3c;
  color:#fff;
}

.status-badge.stopped{
  background:#8f2f2f;
  color:#fff;
}

.status-badge.idle{
  background:#355c7d;
  color:#fff;
}

.status-badge.error{
  background:#8f2f2f;
  color:#fff;
}

.action-row{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
}

.small-btn{
  background:#00bcd4;
  color:#111;
  font-weight:700;
  padding:8px 12px;
}

.small-btn.ghost{
  background:#555;
  color:#fff;
}

.small-btn.danger{
  background:#b33434;
  color:#fff;
}

.empty-box{
  padding:18px;
  border:1px dashed #555;
  border-radius:10px;
  color:#d1d1d1;
  background:#202020;
}

.inline-view{
  margin-top:20px;
  border-top:1px solid #444;
  padding-top:20px;
}

.export-panel{
  padding-bottom:24px;
}

@media (max-width: 1100px){
  .plugin-grid{
    grid-template-columns:1fr;
  }

  .stats-row{
    grid-template-columns:1fr;
  }

  .panel-header,
  .page-header{
    flex-direction:column;
    align-items:stretch;
  }
}
</style>