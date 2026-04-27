const { contextBridge, ipcRenderer } = require("electron")

const API_URL = "http://127.0.0.1:8080"

contextBridge.exposeInMainWorld("autoview", {
  apiUrl: API_URL,

  // Layout / stream
  startLayout: (payload) => ipcRenderer.invoke("start-layout", payload),
  stopStream: () => ipcRenderer.invoke("stop-stream"),
  stopSequence: () => ipcRenderer.invoke("stop-sequence"),
  getLayout: (count) => ipcRenderer.invoke("get-layout", count),
  saveLayout: (payload) => ipcRenderer.invoke("save-layout", payload),

  // Cameras
  getCameras: () => ipcRenderer.invoke("get-cameras"),
  getCamera: (id) => ipcRenderer.invoke("get-camera", id),
  saveCamera: (cam) => ipcRenderer.invoke("save-camera", cam),
  updateCamera: (cam) => ipcRenderer.invoke("update-camera", cam),
  setCameraEnabled: (data) => ipcRenderer.invoke("set-camera-enabled", data),
  deleteCamera: (id) => ipcRenderer.invoke("delete-camera", id),
  
  // Live test
  startLiveTest: (data) => ipcRenderer.invoke("start-live-test", data),
  stopLiveTest: () => ipcRenderer.invoke("stop-live-test"),

  // Speakers
  getSpeakers: () => ipcRenderer.invoke("get-speakers"),
  saveSpeaker: (data) => ipcRenderer.invoke("save-speaker", data),
  updateSpeaker: (data) => ipcRenderer.invoke("update-speaker", data),
  speakerTest: (data) => ipcRenderer.invoke("speaker-test", data),

  // GEO / MAP
  geocodeAddress: (address) => ipcRenderer.invoke("geocode-address", address),
  getMapCameras: () => ipcRenderer.invoke("get-map-cameras"),
  getMapSpeakers: () => ipcRenderer.invoke("get-map-speakers"),
  setTempLocation: (data) => ipcRenderer.invoke("set-temp-location", data),
  getTempLocation: () => ipcRenderer.invoke("get-temp-location"),
  clearTempLocation: () => ipcRenderer.invoke("clear-temp-location"),

  // Events
  getEvents: (payload) => ipcRenderer.invoke("get-events", payload),
  getOpenEvents: () => ipcRenderer.invoke("get-open-events"),
  createEvent: (payload) => ipcRenderer.invoke("create-event", payload),
  closeEvent: (payload) => ipcRenderer.invoke("close-event", payload),

  // Rules
  getRules: () => ipcRenderer.invoke("get-rules"),
  saveRule: (payload) => ipcRenderer.invoke("save-rule", payload),
  updateRule: (payload) => ipcRenderer.invoke("update-rule", payload),

  // Clips
  getClips: () => ipcRenderer.invoke("get-clips"),
  saveClip: (payload) => ipcRenderer.invoke("save-clip", payload),
  updateClip: (payload) => ipcRenderer.invoke("update-clip", payload),

  // People
  getPeople: () => ipcRenderer.invoke("get-people")
})