STEP1（1日でできる）

👉 「最小版」

mockCtxで動く

画像保存

EVENT出す

👉 まずここ

🥈 STEP2

👉 Coreと接続

pluginRunner

eventEngine

🥉 STEP3

👉 UI接続

ManualEventView

TimelapseView

🏁 STEP4

👉 実用版

スケジュール

ファイル管理

ffmpeg動画生成

event_timelapse/
 ├ index.js
 ├ main.js
 ├ manifest.json
 ├ config.json
 ├ mockCtx.js
 ├ test.js
 └ ui/
     └ TimelapseView.vue

{
  "name": "event_timelapse",
  "label": "タイムラプス",
  "icon": "⏱",
  "ui": "/plugins/event_timelapse/ui/TimelapseView.vue"
}

data/
 ├ timelapse/
 │   └ camera_1/
 ├ events/
 └ uploads/
 