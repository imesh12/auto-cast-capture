
🚀 AutoviewPro（常時24時間運用設計）
🎯 ゴール
👉 Electron = App container
👉 Vite = Development engine

⚡ Quick Start
📁 UI App
cd uiapp
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
npm run build
npm run dev
📁 Main App
cd ..(root)
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
npm start
.env Setup
📁 uiapp/.env

VITE_MAPBOX_TOKEN=pk.
VITE_MAP_CENTER_LAT=35.8617
VITE_MAP_CENTER_LNG=139.6455
VITE_MAP_ZOOM=12
VITE_API_BASE_URL=http://<PC_IP>:8080
GSTREAMER_VIDEO_SINK=d3d11videosink
📁 root .env

MAPBOX_TOKEN=pk.
VITE_API_BASE_URL=http://localhost:8080
GSTREAMER_VIDEO_SINK=d3d11videosink

















🚀 AutoviewPro（常時24時間運用設計）
🎯 ゴール
1.クマの検知 
2.河川監視
3. 海岸港の波浪監視、警戒放送システム
4.駐車場監視 
5.混雑監視　人数カウント 
6.地震監視　 
7.観光地監視　youtube配信 
8.タイムラプス　映像監視


gst-launch の kill / spawn を廃止

RTSP 再接続なし

切替黒ゼロ

24時間連続稼働

将来 16 / 25 / 36 へ拡張可能

AutoviewPro/
├── core/
│   ├── pipeline.js      ← GStreamer常駐制御
│   ├── router.js        ← タイル割当管理
│   └── health.js        ← 再接続/監視
│
├── server/
│   ├── main.js          ← Electron main
│   └── ipc.js           ← IPC定義
│
├── ui/                  ← Vue
│
├── db/
│   └── cameras.db
│
└── logs/
├─ package.json


起動時に 12スロット compositor を一度だけ作る
↓
各タイルは常時存在
↓
映像の入力だけ差し替える

rtspsrc_1 → decode → queue → comp.sink_0
rtspsrc_2 → decode → queue → comp.sink_1
...
videotestsrc(black) → comp.sink_11
            ↓
        compositor
            ↓
        autovideosink

slot0 → cam1
slot1 → cam2
slot2 → cam3
slot3 → cam4
slot4〜11 → black     

AutoviewPro/
│
├─ server/
│   └─ main.js          ← Electronメイン
│
├─ core/
│   └─ pipeline.js      ← GStreamer制御
│
ui/
├─ App.vue
├─ router.js      ← ★新規
├─ DashboardView.vue
├─ CameraSettingsView.vue
└─ LayoutSettings.vue
│
├─ preload.js
├─ package.json
└─ cameras.db   ← 自動生成
│
uiapp/
│  vite.config.js
│   ├─ dist/
│   │   ├─ index.html
│   │   └─ assets/


② Electron インストール
npm install

起動
cd uiapp
npm run build

cd ..
pkill gst-launch-1.0
DISPLAY=:0 npm startpkill gst-launch-1.0
DISPLAY=:0 npm start



New Chat

Camera / 手動 / 将来AI
        ↓
      Event登録
        ↓
    rules で判定
        ↓
 Speaker再生 / Event状態更新
        ↓
 Dashboard + Map に表示


AutoviewPro/
├─ server/
├─ core/
├─ preload.js
├─ package.json
│
├─ uiapp/
│   ├─ src/api/api.js
│   ├─ src/components/EventPanel.vue
│   ├─ src/views/ManualEventView.vue
│   │   ├─ App.vue
│   │   ├─ router.js
│   │   ├─ DashboardView.vue
│   │   ├─ CameraSettingsView.vue
│   │   └─ LayoutSettings.vue
│   │
│   ├─ dist/
│   ├─ index.html
│   └─ vite.config.js



plugin 追加
20260318


AutoviewPro
├─ core/
│       ├ pipeline.js
│       ├ ptzControl.js
│       └ speaker.js
        ├ timelapse.js         ★追加
        ├ peopleCount.js
├ server
│   ├ main.js
│   ├ webApiServer.js   ← API中枢
│
├ preload.js
│ package.json
├ uiapp
│   ├ src
│   │   ├ api
│   │   │   └ api.js     ← ★最重要（統一）
│   │   │
│   │   ├ components
│   │   │   ├ MapPopup.vue
│   │   │   ├ PtzPopup.vue
│   │   │   └ EventPanel.vue
│   │   │
│   │   ├ views
│   │   │   ├ DashboardView.vue
│   │   │   ├ CameraSettingsView.vue
│   │   │   ├ SpeakerSettingsView.vue
│   │   │   ├ LayoutSettings.vue
│   │   │   └ MonitoringCenterView.vue
│           ├ EventListView.vue        ★追加
│           ├ TimelapseView.vue        ★追加
│           ├ PeopleCountView.vue      ★追加
│   │   │
│   │   ├ router.js
│   │   └ App.vue
│   │
│   └ dist
│   ├─ index.html
│   └─ vite.config.js


20260319  timlapse 追加　構成
AutoviewPro
├ core/
│   ├ pipeline.js
│   ├ ptzControl.js
│   ├ speaker.js
│   ├ timelapse.js         ★追加（EVENTロジック）
│   ├ peopleCount.js       
│   └ utils/               
│       └ file.js
│
├ server/
│   ├ main.js
│   ├ webApiServer.js      ← API中枢
│   └ routes/              ★追加（API分割）
│       ├ cameras.js
│       ├ timelapse.js
│       └ people.js
│
├ preload.js
├ package.json
│
├ data/                    ★追加（重要）
│   ├ timelapse/
│   ├ events/
│   └ uploads/
│
├ uiapp/
│   ├ src/
│   │   ├ api/
│   │   │   └ api.js       ← ★最重要（統一）
│   │   │
│   │   ├ components/
│   │   │   ├ MapPopup.vue
│   │   │   ├ PtzPopup.vue
│   │   │   └ EventPanel.vue
│   │   │
│   │   ├ views/
│   │   │   ├ DashboardView.vue
│   │   │   ├ CameraSettingsView.vue
│   │   │   ├ SpeakerSettingsView.vue
│   │   │   ├ LayoutSettings.vue
│   │   │   ├ MonitoringCenterView.vue
│   │   │   ├ EventListView.vue        ★追加
│   │   │   ├ TimelapseView.vue        ★追加
│   │   │   └ PeopleCountView.vue      ★追加 未
│   │   │
│   │   ├ router.js
│   │   └ App.vue
│   │
│   └ dist/
│       ├ index.html
│       └ vite.config.js

```
# SQLLITE3
sqlite3 ~/.config/autoview/cameras.db
.tables                      //table
PRAGMA table_info(cameras);  //カラム確認
.read schema.sql
.q


📸 撮影
🖼 サムネ
🗑 削除
🎬 プレビュー
📦 履歴
▶ 再生切替
⬇ ダウンロード
▶ 手動録画


---
cd ~/AutoviewPro/uiapp
npm run build

cd ~/AutoviewPro
npm start


