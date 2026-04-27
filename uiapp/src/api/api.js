// src/api/api.js
function isElectron() {
  return !!window.autoview
}

function getAuthToken() {
  return localStorage.getItem("auth_token") || ""
}

function getAuthUser() {
  try {
    const raw = localStorage.getItem("auth_user")
    return raw ? JSON.parse(raw) : null
  } catch (_) {
    return null
  }
}

function setAuthSession(token, user) {
  localStorage.setItem("auth_token", token || "")
  localStorage.setItem("auth_user", JSON.stringify(user || null))
}

function clearAuthSession() {
  localStorage.removeItem("auth_token")
  localStorage.removeItem("auth_user")
}

function buildJsonOptions(method = "GET", data) {
  const token = getAuthToken()

  const options = {
    method,
    headers: {}
  }

  if (token) {
    options.headers.Authorization = `Bearer ${token}`
  }

  if (data !== undefined) {
    options.headers["Content-Type"] = "application/json"
    options.body = JSON.stringify(data)
  }

  return options
}

async function safeJsonFetch(url, options = {}) {
  const finalOptions = {
    ...options,
    headers: {
      ...(options.headers || {})
    }
  }

  const token = getAuthToken()
  if (token && !finalOptions.headers.Authorization) {
    finalOptions.headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(url, {
  ...finalOptions,
  credentials: "include"
})
  const text = await res.text()

  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch (_) {
    data = {}
  }

  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status} for ${url}`
    console.error("HTTP ERROR:", res.status, url, text)

    if (res.status === 401) {
      clearAuthSession()
    }

    throw new Error(msg)
  }

  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch (err) {
    console.error("NOT JSON RESPONSE:", url, text)
    throw new Error(`Expected JSON but got non-JSON response from ${url}`)
  }
}

const api = {
  isElectron,

  // =========================
  // Auth
  // =========================

  login: async (username, password) => {
    const data = await safeJsonFetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    })

    if (data?.ok && data?.token) {
      setAuthSession(data.token, data.user || null)
    }

    return data
  },

  logout: async () => {
    try {
      await safeJsonFetch("/api/auth/logout", buildJsonOptions("POST"))
    } catch (_) {
      // ignore logout request failure
    } finally {
      clearAuthSession()
    }

    return { ok: true }
  },

  getMe: async () => {
    return await safeJsonFetch("/api/auth/me")
  },

  getStoredUser: () => {
    return getAuthUser()
  },

  isLoggedIn: () => {
    return !!getAuthToken()
  },

  clearSession: () => {
    clearAuthSession()
  },

  get: async (url) => {
    return await safeJsonFetch(url)
  },

  post: async (url, data) => {
    return await safeJsonFetch(url, buildJsonOptions("POST", data))
  },

  put: async (url, data) => {
    return await safeJsonFetch(url, buildJsonOptions("PUT", data))
  },

  delete: async (url) => {
    return await safeJsonFetch(url, buildJsonOptions("DELETE"))
  },

  // =========================
// Cameras (FORCE API, FIX LOGIN REQUIRED)
// =========================

getCameras: async () => {
  return await safeJsonFetch("/api/cameras")
},

getCamera: async (id) => {
  return await safeJsonFetch(`/api/cameras/${id}`)
},

saveCamera: async (cam) => {
  return await safeJsonFetch("/api/cameras/save", buildJsonOptions("POST", cam))
},

addCamera: async (cam) => {
  return await api.saveCamera(cam)
},

updateCamera: async (cam) => {
  return await safeJsonFetch("/api/cameras/update", buildJsonOptions("POST", cam))
},

deleteCamera: async (id) => {
  return await safeJsonFetch(`/api/cameras/${id}`, buildJsonOptions("DELETE"))
},

setCameraEnabled: async (id, enabled) => {
  const cam = await api.getCamera(id)

  return await api.updateCamera({
    ...cam,
    enabled: enabled ? 1 : 0
  })
},

  // =========================
  // Layout
  // =========================

  startLayout: async (count, seconds = 10) => {
    if (isElectron() && window.autoview?.startLayout) {
      return await window.autoview.startLayout({ count, seconds })
    }

    return await safeJsonFetch(`/api/layout/${count}`)
  },

  getLayout: async (count) => {
    if (isElectron() && window.autoview?.getLayout) {
      return await window.autoview.getLayout(count)
    }

    return await safeJsonFetch(`/api/layout/${count}`)
  },

  saveLayout: async (payload) => {
    if (isElectron() && window.autoview?.saveLayout) {
      return await window.autoview.saveLayout(payload)
    }

    return await safeJsonFetch("/api/layout/save", buildJsonOptions("POST", payload))
  },

  stop: async () => {
    if (isElectron() && window.autoview?.stopStream) {
      return await window.autoview.stopStream()
    }

    return await safeJsonFetch("/api/stop")
  },

  stopStream: async () => {
    return await api.stop()
  },

  // =========================
  // Live camera / preview
  // =========================

  startLiveTest: async (cam) => {
    if (isElectron() && window.autoview?.startLiveTest) {
      return await window.autoview.startLiveTest(cam)
    }

    return await safeJsonFetch(`/api/camera/${cam.id}`)
  },

  stopLiveTest: async () => {
    if (isElectron() && window.autoview?.stopLiveTest) {
      return await window.autoview.stopLiveTest()
    }

    return await api.stop()
  },

  // =========================
  // People count
  // =========================

  getPeople: async () => {
    if (isElectron() && window.autoview?.getPeople) {
      return await window.autoview.getPeople()
    }

    return await safeJsonFetch("/api/people")
  },

  // =========================
  // Speakers
  // =========================

  getSpeakers: async () => {
    if (isElectron() && window.autoview?.getSpeakers) {
      return await window.autoview.getSpeakers()
    }

    return await safeJsonFetch("/api/speakers")
  },

  getSpeaker: async (id) => {
    return await safeJsonFetch(`/api/speakers/${id}`)
  },

  saveSpeaker: async (speaker) => {
    if (isElectron() && window.autoview?.saveSpeaker) {
      return await window.autoview.saveSpeaker(speaker)
    }

    return await safeJsonFetch("/api/speakers/save", buildJsonOptions("POST", speaker))
  },

  addSpeaker: async (speaker) => {
    return await api.saveSpeaker(speaker)
  },

  updateSpeaker: async (speaker) => {
    if (isElectron() && window.autoview?.updateSpeaker) {
      return await window.autoview.updateSpeaker(speaker)
    }

    return await safeJsonFetch("/api/speakers/update", buildJsonOptions("POST", speaker))
  },

  deleteSpeaker: async (id) => {
    if (isElectron() && window.autoview?.deleteSpeaker) {
      return await window.autoview.deleteSpeaker(id)
    }

    return await safeJsonFetch(`/api/speakers/${id}`, buildJsonOptions("DELETE"))
  },

  speakerTest: async (sp) => {
    const payload = {
      ip: sp.ip || sp.ip_address || sp.host,
      rtp_ip: sp.rtp_ip || "",
      file_path: sp.file_path || "logo.mp3"
    }

    if (isElectron() && window.autoview?.speakerTest) {
      return await window.autoview.speakerTest(payload)
    }

    return await safeJsonFetch("/api/speaker/test", buildJsonOptions("POST", payload))
  },

  // =========================
  // Speaker Events
  // =========================

  getSpeakerEvents: async () => {
    return await safeJsonFetch("/api/speaker-events")
  },

  getSpeakerEvent: async (id) => {
    return await safeJsonFetch(`/api/speaker-events/${id}`)
  },

  saveSpeakerEvent: async (payload) => {
    return await safeJsonFetch("/api/speaker-events/save", buildJsonOptions("POST", payload))
  },

  updateSpeakerEvent: async (payload) => {
    return await safeJsonFetch("/api/speaker-events/update", buildJsonOptions("POST", payload))
  },

  deleteSpeakerEvent: async (payload) => {
    return await safeJsonFetch("/api/speaker-events/delete", buildJsonOptions("POST", payload))
  },

  startSpeakerEvent: async (payload) => {
    return await safeJsonFetch("/api/speaker-events/start", buildJsonOptions("POST", payload))
  },

  stopSpeakerEvent: async (payload) => {
    return await safeJsonFetch("/api/speaker-events/stop", buildJsonOptions("POST", payload))
  },

  getRunningSpeakerEvents: async () => {
    return await safeJsonFetch("/api/speaker-events/running")
  },

  // =========================
  // Map / geocode
  // =========================

  geocodeAddress: async (address) => {
    if (isElectron() && window.autoview?.geocodeAddress) {
      return await window.autoview.geocodeAddress(address)
    }

    return await safeJsonFetch(`/api/geocode?address=${encodeURIComponent(address)}`)
  },

  getMapCameras: async () => {
    if (isElectron() && window.autoview?.getMapCameras) {
      return await window.autoview.getMapCameras()
    }

    return await safeJsonFetch("/api/map/cameras")
  },

  getMapSpeakers: async () => {
    if (isElectron() && window.autoview?.getMapSpeakers) {
      return await window.autoview.getMapSpeakers()
    }

    return await safeJsonFetch("/api/map/speakers")
  },

  setTempLocation: async (data) => {
    if (isElectron() && window.autoview?.setTempLocation) {
      return await window.autoview.setTempLocation(data)
    }

    return await safeJsonFetch("/api/map/temp-location", buildJsonOptions("POST", data))
  },

  getTempLocation: async () => {
    if (isElectron() && window.autoview?.getTempLocation) {
      return await window.autoview.getTempLocation()
    }

    return await safeJsonFetch("/api/map/temp-location")
  },

  clearTempLocation: async () => {
    if (isElectron() && window.autoview?.clearTempLocation) {
      return await window.autoview.clearTempLocation()
    }

    return await safeJsonFetch("/api/map/temp-location/clear", buildJsonOptions("POST"))
  },

  // =========================
  // Events
  // =========================

  getEvents: async (payload = {}) => {
    if (isElectron() && window.autoview?.getEvents) {
      return await window.autoview.getEvents(payload)
    }

    const limit = Number(payload.limit || 20)
    return await safeJsonFetch(`/api/events?limit=${limit}`)
  },

  getOpenEvents: async () => {
    if (isElectron() && window.autoview?.getOpenEvents) {
      return await window.autoview.getOpenEvents()
    }

    return await safeJsonFetch("/api/events/open")
  },

  createEvent: async (payload) => {
    if (isElectron() && window.autoview?.createEvent) {
      return await window.autoview.createEvent(payload)
    }

    return await safeJsonFetch("/api/events/create", buildJsonOptions("POST", payload))
  },

  closeEvent: async (payload) => {
    if (isElectron() && window.autoview?.closeEvent) {
      return await window.autoview.closeEvent(payload)
    }

    return await safeJsonFetch("/api/events/close", buildJsonOptions("POST", payload))
  },

  deleteEvent: async (id) => {
    if (isElectron() && window.autoview?.deleteEvent) {
      return await window.autoview.deleteEvent(id)
    }

    return await safeJsonFetch(`/api/events/${id}`, buildJsonOptions("DELETE"))
  },

  // =========================
  // Rules
  // =========================

  getRules: async () => {
    if (isElectron() && window.autoview?.getRules) {
      return await window.autoview.getRules()
    }

    return await safeJsonFetch("/api/rules")
  },

  saveRule: async (payload) => {
    if (isElectron() && window.autoview?.saveRule) {
      return await window.autoview.saveRule(payload)
    }

    return await safeJsonFetch("/api/rules/save", buildJsonOptions("POST", payload))
  },

  updateRule: async (payload) => {
    if (isElectron() && window.autoview?.updateRule) {
      return await window.autoview.updateRule(payload)
    }

    return await safeJsonFetch("/api/rules/update", buildJsonOptions("POST", payload))
  },

  // =========================
  // Clips
  // =========================

  getClips: async () => {
    if (isElectron() && window.autoview?.getClips) {
      return await window.autoview.getClips()
    }

    return await safeJsonFetch("/api/clips")
  },

  saveClip: async (payload) => {
    if (isElectron() && window.autoview?.saveClip) {
      return await window.autoview.saveClip(payload)
    }

    return await safeJsonFetch("/api/clips/save", buildJsonOptions("POST", payload))
  },

  updateClip: async (payload) => {
    if (isElectron() && window.autoview?.updateClip) {
      return await window.autoview.updateClip(payload)
    }

    return await safeJsonFetch("/api/clips/update", buildJsonOptions("POST", payload))
  },

  // =========================
  // Timelapse
  // =========================

  getTimelapseLogs: async () => {
    return await safeJsonFetch("/api/timelapse/logs")
  },

  startTimelapseService: async () => {
    return await safeJsonFetch("/api/timelapse/start", buildJsonOptions("POST"))
  },

  stopTimelapseService: async () => {
    return await safeJsonFetch("/api/timelapse/stop", buildJsonOptions("POST"))
  },

  getTimelapseStatus: async () => {
    return await safeJsonFetch("/api/timelapse/status")
  },

  runTimelapseNow: async (cameraId) => {
    return await safeJsonFetch("/api/timelapse/run", buildJsonOptions("POST", {
      camera_id: cameraId
    }))
  },

  getTimelapseFiles: async ({ camera_id, from, to }) => {
    const params = new URLSearchParams()

    if (camera_id != null) params.set("camera_id", camera_id)
    if (from != null) params.set("from", from)
    if (to != null) params.set("to", to)

    return await safeJsonFetch(`/api/timelapse/files?${params.toString()}`)
  },

  deleteTimelapseFiles: async (payload) => {
    return await safeJsonFetch("/api/timelapse/delete", buildJsonOptions("POST", payload))
  },

  getTimelapsePreview: async ({ camera_id, from, to, fps, speed }) => {
    const params = new URLSearchParams()

    if (camera_id != null) params.set("camera_id", camera_id)
    if (from != null) params.set("from", from)
    if (to != null) params.set("to", to)
    if (fps != null) params.set("fps", fps)
    if (speed != null) params.set("speed", speed)

    return await safeJsonFetch(`/api/timelapse/preview?${params.toString()}`)
  },

  getTimelapseVideos: async () => {
    return await safeJsonFetch("/api/timelapse/videos")
  },

  deleteTimelapseVideo: async (name) => {
    return await safeJsonFetch("/api/timelapse/video/delete", buildJsonOptions("POST", { name }))
  },

  getLatestTimelapseImageUrl: (cameraId) => {
    return `/api/timelapse/latest?camera_id=${encodeURIComponent(cameraId)}`
  },

  getLiveJpegUrl: (cameraId) => {
    return `/api/live/jpeg?cam=${encodeURIComponent(cameraId)}&t=${Date.now()}`
  }
}

export default api