<script setup>
import { ref, onMounted, computed } from "vue"
import { useRouter } from "vue-router"
import api from "../api/api"
import Navbar from "../components/Navbar.vue"


const router = useRouter()

const DEFAULT_RTSP_PORT = 554
const DEFAULT_HTTP_PORT = 80
const DEFAULT_STREAM_TYPE = "axis"
const DEFAULT_CAPTURE_MODE = "snapshot"

const cameras = ref([])
const loading = ref(false)
const savingIds = ref(new Set())

const newCameraName = ref("")
const newStreamType = ref(DEFAULT_STREAM_TYPE)
const newCameraIp = ref("")
const newPort = ref(DEFAULT_RTSP_PORT)
const newUsername = ref("")
const newPassword = ref("")
const newCustomStreamPath = ref("")
const newCaptureMode = ref(DEFAULT_CAPTURE_MODE)
const newSnapshotUrl = ref("")
const showAddCam = ref(false)

function safePort(v, fallback = DEFAULT_RTSP_PORT) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function safeText(v) {
  return String(v ?? "").trim()
}

function normalizeCaptureMode(v) {
  return safeText(v).toLowerCase() === "rtsp" ? "rtsp" : "snapshot"
}

function getDefaultStreamPath(type) {
  switch (String(type || "").toLowerCase()) {
    case "axis":
      return "/axis-media/media.amp"
    case "hikvision":
      return "/Streaming/Channels/101"
    case "dahua":
      return "/cam/realmonitor?channel=1&subtype=0"
    case "generic":
      return "/stream1"
    case "custom":
      return ""
    default:
      return "/stream1"
  }
}

function getDefaultSnapshotPath(type) {
  switch (String(type || "").toLowerCase()) {
    case "axis":
      return "/axis-cgi/jpg/image.cgi"
    case "hikvision":
      return "/ISAPI/Streaming/channels/101/picture"
    case "dahua":
      return "/cgi-bin/snapshot.cgi"
    case "generic":
      return "/snapshot.jpg"
    case "custom":
      return ""
    default:
      return "/snapshot.jpg"
  }
}

function getEffectiveStreamPath(type, customPath = "") {
  if (String(type || "").toLowerCase() === "custom") {
    return String(customPath || "").trim()
  }
  return getDefaultStreamPath(type)
}

function normalizePath(pathValue) {
  const s = String(pathValue || "").trim()
  if (!s) return ""
  return s.startsWith("/") ? s : `/${s}`
}

function buildRtspUrl({
  ip,
  port,
  username,
  password,
  streamType = DEFAULT_STREAM_TYPE,
  customStreamPath = ""
}) {
  const host = safeText(ip)
  if (!host) return ""

  const finalPort = safePort(port, DEFAULT_RTSP_PORT)
  const rawPath = getEffectiveStreamPath(streamType, customStreamPath)
  const finalPath = normalizePath(rawPath)

  const user = safeText(username)
  const pass = safeText(password)

  const auth =
    user || pass
      ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`
      : ""

  if (!finalPath) {
    return `rtsp://${auth}${host}:${finalPort}`
  }

  return `rtsp://${auth}${host}:${finalPort}${finalPath}`
}

function getBaseRtspUrl(url) {
  try {
    const parsed = new URL(url)
    const auth = parsed.username
      ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}@`
      : ""
    return `${parsed.protocol}//${auth}${parsed.host}`
  } catch {
    if (!url) return ""
    const parts = url.split("/")
    return parts.slice(0, 3).join("/")
  }
}

function buildSnapshotUrl({
  ip,
  username,
  password,
  streamType = DEFAULT_STREAM_TYPE,
  customSnapshotPath = "",
  httpPort = DEFAULT_HTTP_PORT
}) {
  const host = safeText(ip)
  if (!host) return ""

  const rawPath =
    String(streamType || "").toLowerCase() === "custom"
      ? safeText(customSnapshotPath)
      : getDefaultSnapshotPath(streamType)

  const finalPath = normalizePath(rawPath)

  const user = safeText(username)
  const pass = safeText(password)

  const auth =
    user || pass
      ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`
      : ""

  const finalHttpPort = safePort(httpPort, DEFAULT_HTTP_PORT)
  const portPart = finalHttpPort === 80 ? "" : `:${finalHttpPort}`

  if (!finalPath) {
    return `http://${auth}${host}${portPart}`
  }

  return `http://${auth}${host}${portPart}${finalPath}`
}

function extractIpFromRtsp(url) {
  try {
    if (!url) return ""
    const u = new URL(url)
    return u.hostname || ""
  } catch {
    return ""
  }
}

function extractPortFromRtsp(url) {
  try {
    if (!url) return DEFAULT_RTSP_PORT
    const u = new URL(url)
    return u.port ? Number(u.port) : DEFAULT_RTSP_PORT
  } catch {
    return DEFAULT_RTSP_PORT
  }
}

function inferStreamType(streamPath) {
  const p = String(streamPath || "").trim().toLowerCase()

  if (p === "/axis-media/media.amp") return "axis"
  if (p === "/streaming/channels/101") return "hikvision"
  if (p === "/cam/realmonitor?channel=1&subtype=0") return "dahua"
  if (p === "/stream1") return "generic"
  if (p) return "custom"

  return DEFAULT_STREAM_TYPE
}

function normalizeCamera(cam = {}) {
  const streamPath = cam.stream_path || ""
  const streamType = cam.stream_type || inferStreamType(streamPath)
  const cameraIp = cam.camera_ip || extractIpFromRtsp(cam.rtsp_url) || ""
  const username = cam.username || ""
  const password = cam.password || ""

  return {
    ...cam,
    camera_ip: cameraIp,
    port: cam.port || extractPortFromRtsp(cam.rtsp_url) || DEFAULT_RTSP_PORT,
    username,
    password,
    stream_type: streamType,
    capture_mode: normalizeCaptureMode(cam.capture_mode || DEFAULT_CAPTURE_MODE),
    snapshot_url:
      safeText(cam.snapshot_url) ||
      buildSnapshotUrl({
        ip: cameraIp,
        username,
        password,
        streamType,
        httpPort: DEFAULT_HTTP_PORT
      }),
    stream_path:
      streamType === "custom"
        ? streamPath || ""
        : getDefaultStreamPath(streamType)
  }
}

function syncCameraStream(cam) {
  if (cam.stream_type !== "custom") {
    cam.stream_path = getDefaultStreamPath(cam.stream_type)
  }

  cam.rtsp_url = buildRtspUrl({
    ip: cam.camera_ip,
    port: cam.port,
    username: cam.username,
    password: cam.password,
    streamType: cam.stream_type,
    customStreamPath: cam.stream_path
  })
}

function syncCameraSnapshot(cam) {
  if (!safeText(cam.snapshot_url)) {
    cam.snapshot_url = buildSnapshotUrl({
      ip: cam.camera_ip,
      username: cam.username,
      password: cam.password,
      streamType: cam.stream_type,
      httpPort: DEFAULT_HTTP_PORT
    })
  }
}

const newRtspPreview = computed(() =>
  buildRtspUrl({
    ip: newCameraIp.value,
    port: newPort.value,
    username: newUsername.value,
    password: newPassword.value,
    streamType: newStreamType.value,
    customStreamPath: newCustomStreamPath.value
  })
)

const newSnapshotPreview = computed(() =>
  buildSnapshotUrl({
    ip: newCameraIp.value,
    username: newUsername.value,
    password: newPassword.value,
    streamType: newStreamType.value,
    httpPort: DEFAULT_HTTP_PORT
  })
)

function resetNewCameraForm() {
  newCameraName.value = ""
  newStreamType.value = DEFAULT_STREAM_TYPE
  newCameraIp.value = ""
  newPort.value = DEFAULT_RTSP_PORT
  newUsername.value = ""
  newPassword.value = ""
  newCustomStreamPath.value = ""
  newCaptureMode.value = DEFAULT_CAPTURE_MODE
  newSnapshotUrl.value = ""
}

function addSavingId(id) {
  const next = new Set(savingIds.value)
  next.add(id)
  savingIds.value = next
}

function removeSavingId(id) {
  const next = new Set(savingIds.value)
  next.delete(id)
  savingIds.value = next
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
  loading.value = true

  try {
    const result = await api.getCameras()
    cameras.value = (Array.isArray(result) ? result : []).map(normalizeCamera)
  } catch (error) {
    console.error("loadCameras error:", error)
    if (await handleAuthError(error)) return
    alert(`Failed to load cameras: ${error.message}`)
    cameras.value = []
  } finally {
    loading.value = false
  }
}

async function addCamera() {
  if (!safeText(newCameraName.value) || !safeText(newCameraIp.value)) {
    alert("Camera name and camera IP are required.")
    return
  }

  const streamPath =
    newStreamType.value === "custom"
      ? safeText(newCustomStreamPath.value)
      : getDefaultStreamPath(newStreamType.value)

  const payload = {
    name: safeText(newCameraName.value),
    stream_type: safeText(newStreamType.value) || DEFAULT_STREAM_TYPE,
    camera_ip: safeText(newCameraIp.value),
    port: safePort(newPort.value, DEFAULT_RTSP_PORT),
    username: safeText(newUsername.value),
    password: safeText(newPassword.value),
    stream_path: streamPath,
    capture_mode: normalizeCaptureMode(newCaptureMode.value),
    snapshot_url: safeText(newSnapshotUrl.value) || newSnapshotPreview.value,
    rtsp_url: buildRtspUrl({
      ip: newCameraIp.value,
      port: newPort.value,
      username: newUsername.value,
      password: newPassword.value,
      streamType: newStreamType.value,
      customStreamPath: newCustomStreamPath.value
    }),
    enabled: 1,
    people_count_enabled: 0,
    people_count_type: "ai"
  }

  try {
    await api.saveCamera(payload)
    await loadCameras()
    resetNewCameraForm()
    alert("Camera added successfully.")
  } catch (error) {
    console.error("addCamera error:", error)
    if (await handleAuthError(error)) return
    alert(`Camera save failed: ${error.message}`)
  }
}

async function saveCamera(cam) {
  if (!cam?.id) return

  addSavingId(cam.id)

  try {
    syncCameraStream(cam)
    syncCameraSnapshot(cam)

    const payload = {
      id: cam.id,
      name: safeText(cam.name),
      stream_type: safeText(cam.stream_type) || DEFAULT_STREAM_TYPE,
      camera_ip: safeText(cam.camera_ip),
      port: safePort(cam.port, DEFAULT_RTSP_PORT),
      username: safeText(cam.username),
      password: safeText(cam.password),
      stream_path:
        cam.stream_type === "custom"
          ? safeText(cam.stream_path)
          : getDefaultStreamPath(cam.stream_type),
      rtsp_url: cam.rtsp_url,
      enabled: Number(cam.enabled ?? 1) ? 1 : 0,
      people_count_enabled: Number(cam.people_count_enabled ?? 0) ? 1 : 0,
      people_count_type: safeText(cam.people_count_type) || "ai",
      address: safeText(cam.address || ""),
      lat: cam.lat ?? null,
      lng: cam.lng ?? null,
      manufacturer: safeText(cam.manufacturer || "generic"),
      model: safeText(cam.model || ""),
      protocol: safeText(cam.protocol || "rtsp"),
      manual_rtsp_url: safeText(cam.manual_rtsp_url || ""),
      snapshot_url: safeText(cam.snapshot_url || ""),
      capture_mode: normalizeCaptureMode(cam.capture_mode || DEFAULT_CAPTURE_MODE),
      notes: safeText(cam.notes || ""),
      timelapse_enabled: Number(cam.timelapse_enabled ?? 0) ? 1 : 0,
      tl_interval: cam.tl_interval ?? 0,
      tl_start_hour: cam.tl_start_hour ?? null,
      tl_end_hour: cam.tl_end_hour ?? null,
      tl_days: cam.tl_days ?? "",
      tl_folder_name: safeText(cam.tl_folder_name || ""),
      tl_output_dir: safeText(cam.tl_output_dir || "./data/timelapse"),
      tl_notify_email: safeText(cam.tl_notify_email || ""),
      tl_notify_after_sec: cam.tl_notify_after_sec ?? 1800,
      tl_status: safeText(cam.tl_status || "stopped"),
      tl_is_running: Number(cam.tl_is_running ?? 0) ? 1 : 0
    }

    await api.updateCamera(payload)
    await loadCameras()
    alert(`Camera "${cam.name}" saved successfully.`)
  } catch (error) {
    console.error("saveCamera error:", error)
    if (await handleAuthError(error)) return
    alert(`Camera update failed: ${error.message}`)
  } finally {
    removeSavingId(cam.id)
  }
}

async function deleteCamera(cam) {
  if (!cam?.id) return

  const ok = window.confirm(`Are you sure you want to delete camera "${cam.name}"?`)
  if (!ok) return

  addSavingId(cam.id)

  try {
    await api.deleteCamera(cam.id)
    await loadCameras()
    alert("Camera deleted successfully.")
  } catch (error) {
    console.error("deleteCamera error:", error)
    if (await handleAuthError(error)) return
    alert(`Camera delete failed: ${error.message}`)
  } finally {
    removeSavingId(cam.id)
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
    console.error("auth check error:", error)
    await handleAuthError(error)
    return
  }

  await loadCameras()
})
</script>

<template>

  <Navbar />
  <div class="view-root">
    <div>
    </div>
    <div class="page-header">
      <div>
        <h2>カメラ管理</h2>
        <p class="sub">Web UIからカメラの追加・管理を行います。</p>
      </div>

      <div class="header-actions">
        <button @click="showAddCam = !showAddCam" class="add-camera-btn">
          新カメラ登録
        </button>
        <button class="refresh-btn" :disabled="loading" @click="loadCameras" title="Refresh">
          <FontAwesomeIcon :icon="['fas', 'arrow-rotate-right']" />
        </button>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Camera Name</th>
            <th>Brand</th>
            <th>IP</th>
            <th>RTSP Port</th>
            <th>Username</th>
            <th>Password</th>
            <th>Capture Mode</th>
            <th>Snapshot URL</th>
            <th>RTSP URL</th>
            <th>Save</th>
            <th>Delete</th>
          </tr>
        </thead>

        <tbody>
          <tr v-if="!cameras.length && !loading">
            <td colspan="12" class="empty-row">No cameras found.</td>
          </tr>

          <tr v-for="cam in cameras" :key="cam.id">
            <td>{{ cam.id }}</td>

            <td>
              <input v-model="cam.name" placeholder="Camera Name" />
            </td>

            <td>
              <select v-model="cam.stream_type">
                <option value="axis">AXIS</option>
                <option value="hikvision">HIKVISION</option>
                <option value="dahua">DAHUA</option>
                <option value="generic">GENERIC</option>
                <option value="custom">CUSTOM</option>
              </select>
            </td>

            <td>
              <input v-model="cam.camera_ip" placeholder="192.168.1.100" />
            </td>

            <td>
              <input v-model="cam.port" type="number" placeholder="554" style="width: 90px" />
            </td>

            <td>
              <input v-model="cam.username" placeholder="Username" />
            </td>

            <td>
              <input v-model="cam.password" type="password" placeholder="Password" />
            </td>

            <td>
              <select v-model="cam.capture_mode">
                <option value="snapshot">Snapshot First</option>
                <option value="rtsp">RTSP Only</option>
              </select>
            </td>

            <td>
              <input v-model="cam.snapshot_url" placeholder="http://... (manual override)" />
            </td>

            <td class="rtsp-cell">
              {{
                getBaseRtspUrl(
                  buildRtspUrl({
                    ip: cam.camera_ip,
                    port: cam.port,
                    username: cam.username,
                    password: cam.password,
                    streamType: cam.stream_type,
                    customStreamPath: cam.stream_path
                  })
                )
              }}
            </td>

            <td>
              <button class="save-btn" :disabled="savingIds.has(cam.id)" @click="saveCamera(cam)">
                {{ savingIds.has(cam.id) ? "Saving..." : "SAVE" }}
              </button>
            </td>

            <td>
              <button class="delete-btn" :disabled="savingIds.has(cam.id)" @click="deleteCamera(cam)">
                <FontAwesomeIcon :icon="['fas', 'trash-can']" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- add camera -->
     <div class="add-cam-wrapper" v-show="showAddCam">
    <div class="add-card">
      <h3>カメラ管理</h3>

      <div class="add">
        <div class="input-cam-info">
          <div>
        <label class="input-label">カメラ名</label>
          <input v-model="newCameraName" placeholder="例：カメラ1" style="width: 245px" />
          </div>
<div>
  <label class="input-label">カメラブランド</label>
          <select v-model="newStreamType"  style="width: 245px">
            <option value="axis">AXIS</option>
            <option value="hikvision">HIKVISION</option>
            <option value="dahua">DAHUA</option>
            <option value="generic">GENERIC</option>
            <option value="custom">CUSTOM</option>
          </select>
</div>


        </div>
        <div class="input-ip-port">
          <div>
            <label class="input-label">カメラIP</label>
            <input v-model="newCameraIp" placeholder="192.168.1.2" style="width: 400px" />
          </div>
          <div>
            <label class="input-label">カメラIP</label>
                      <input v-model="newPort" type="number" placeholder="RTSP Port" style="width: 90px" />
          </div>

        </div>
        <div class="input-user-pass">
          <div>
            <label class="input-label">ユーザー</label>
            <input v-model="newUsername" placeholder="root" style="width: 245px" />
          </div>
          <div>
            <label class="input-label">パスワード</label>
          <input v-model="newPassword" type="password" placeholder="********" style="width: 245px" />
          </div>
          
        </div>
        <label class="input-label">撮影モード</label>
        <select v-model="newCaptureMode"  style="width: 500px; margin-bottom: 16px;" >
          <option value="snapshot">Snapshot First</option>
          <option value="rtsp">RTSP Only</option>
        </select>

        <!-- <input v-model="newSnapshotUrl" placeholder="Snapshot URL (optional override)" style="width: 280px;margin-bottom: 16px;" /> -->

        <div class="preview-box">
          <div class="preview-label">Snapshot URL</div>
          <div class="preview-value">
            {{ newSnapshotUrl || newSnapshotPreview || "Snapshot URL auto-created here" }}
          </div>
        </div>

        <div class="preview-box">
          <div class="preview-label">RTSP URL</div>
          <div class="preview-value">
            {{ newRtspPreview || "RTSP URL auto-created here" }}
          </div>
        </div>

        <button :disabled="!newCameraName || !newCameraIp" @click="addCamera" class="confirm-btn">
          確定
        </button>
        <button @click="showAddCam = false" class="cancel-btn">
          キャンセル
        </button>

      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
@import "../styles/theme.css";

.view-root {
  width: 100%;
  min-height: calc(100vh - 60px);
  color: var(--text-body);
  padding: 20px;
  box-sizing: border-box;
  margin-top: 64px;
}

.page-header {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.sub {
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 14px;
}

.refresh-btn {
  background: var(--surface-alt);
  color: var(--text-body);
}

.table-wrap {
  overflow-x: auto;
}

table {
  min-width: 1550px;
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
}

td,
th {
  border: 1px solid var(--border);
  padding: 10px;
  text-align: center;
  vertical-align: middle;
  color: var(--text-body);
}

th {
  font-size: 14px;
}

td {
  font-size: 12px;
}

input {
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-body);
  width: 100%;
  box-sizing: border-box;
}

select {
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-body);
  min-width: 120px;
}

.add-camera-btn, .confirm-btn {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--primary);
  color: #fff;
  cursor: pointer;
}
.add-camera-btn:hover {
  background: rgba(37, 99, 235);
}
.confirm-btn:hover{
  background: rgba(37, 99, 235);
}
.refresh-btn{
    padding: 10px 14px;
  border-radius: var(--radius-sm);
   border: none;
   background-color: var(--text-light-grey);
   color: var(--text-body);
}

/* button:hover {
   background: rgb(37, 99, 235);
} */

button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.save-btn {
  background: var(--success);
  color: #fff;
}

.save-btn:hover {
  background: #059669;
}

.delete-btn {
  background: var(--error);
  color: #fff;
}

.delete-btn:hover {
  background: #f87171;
}
.cancel-btn{
  color: #fd0e0e;
  font-size: 14px;
  margin: 0px auto 0px auto;
  background-color: none;
}
.add-cam-wrapper{
   position: relative;
}
.add-card {
  width: 38%;
  border: solid 1px var(--border);
  border-radius: 8px;
  background-color: #fff;
  padding: 16px;
  position: absolute;
  left: 50%;
  margin-top: 80px;
  transform: translate(-50%, -50%);
  z-index: 100;
}

.add {
  margin-top: 10px;
}

.add-card h3 {
  margin-bottom: 14px;
  font-size: 18px;
  color: var(--text-heading);
}
.input-label{
  font-size: 13px;
  color: var(--text-body);
}
input::placeholder{
  font-size: 12px;
}
.input-cam-info {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.input-ip-port{
    display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.input-user-pass{
    display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.add button {
  grid-column: 1 / -1;
  justify-self: start;
}

.rtsp-cell {
  width: 1%;
  white-space: nowrap;
  font-size: 12px;
  color: var(--primary);
}

.preview-box {
  min-width: 440px;
  max-width: 100%;
  padding: 12px 14px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-body);
  font-size: 12px;
  overflow: hidden;
  margin-bottom: 16px;
}

.preview-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.preview-value {
  color: var(--text-body);
  display: inline-block;
  max-width: 320px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-row {
  color: var(--text-muted);
  padding: 18px;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
</style>