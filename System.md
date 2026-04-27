いまの **AutoViewPro** を土台にして、**本格的な MAP防災システム**として完成形の設計をまとめます。

これは単なる監視画面ではなく、

```text
見る
判断する
知らせる
動かす
記録する
```

を1つの MAP で回すシステムです。

---

# 1. システムの定義

AutoViewPro の完成形はこれです。

```text
MAP中心 防災運用プラットフォーム
```

役割は4つです。

```text
1 状況把握
2 事件・災害検知
3 放送・通知
4 記録・追跡
```

---

# 2. 全体アーキテクチャ

```text
                  ┌──────────────────┐
                  │   Mobile / PC    │
                  │   Operator UI    │
                  └────────┬─────────┘
                           │
                           │ HTTPS / LAN
                           │
┌────────────────────────────────────────────────────┐
│                  AutoViewPro Core                  │
│                                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ MAP Engine  │  │ Event Engine│  │ Rule Engine│ │
│  └─────────────┘  └─────────────┘  └────────────┘ │
│                                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ Video Engine│  │ Speaker Ctrl│  │ Notify     │ │
│  │ GStreamer   │  │ AXIS/VAPIX  │  │ LINE/Mail  │ │
│  └─────────────┘  └─────────────┘  └────────────┘ │
│                                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ Camera DB   │  │ Speaker DB  │  │ Event DB   │ │
│  └─────────────┘  └─────────────┘  └────────────┘ │
└────────────────────────────────────────────────────┘
        │                 │                 │
        │                 │                 │
        ▼                 ▼                 ▼
   RTSP Cameras      AXIS Speakers      External Events
                                          Jetson / AOA
                                          Earthquake API
                                          Sensors / GPIO
```

---

# 3. 画面構成

実運用なら画面は最低5つです。

```text
1 Dashboard
2 Map
3 Cameras
4 Speakers
5 Events
```

追加であると強いもの。

```text
6 Zones
7 Playback / Logs
8 Mobile UI
9 Public / Tourism UI
```

---

# 4. 各画面の役割

## Dashboard

運用の入口です。

```text
レイアウト切替
単画面表示
シーケンス秒
現在イベント一覧
緊急放送ボタン
QRコード
```

## Map

中枢です。

```text
カメラ位置
スピーカー位置
ゾーン
イベント発生点
状態色
```

クリック操作。

```text
カメラ → LIVE
スピーカー → テスト放送
イベント → 詳細
```

## Cameras

設備管理画面です。

```text
RTSP URL
住所
緯度経度
有効/無効
テスト表示
MAP確認
```

## Speakers

放送設備管理です。

```text
名前
IP / RTP / HTTPS
住所
緯度経度
テスト音声
パネル表示
MAP確認
```

## Events

防災運用の履歴です。

```text
時刻
種別
場所
関連カメラ
関連スピーカー
通知先
対応状況
```

---

# 5. MAPの情報モデル

MAPには最低この4種類を載せます。

```text
1 Cameras
2 Speakers
3 Zones
4 Events
```

表示例。

```text
🟢 Camera Online
🔴 Camera Offline
🔵 Speaker
🟠 Warning Event
🔴 Emergency Event
```

Zone は多角形か円で定義します。

```text
避難所
河川区域
土砂災害区域
観光区域
駐車場
登山口
```

---

# 6. イベント設計

イベントは防災システムの中心です。
共通フォーマットを決めます。

```json
{
  "id": "evt_001",
  "type": "earthquake",
  "level": "warning",
  "source": "jma_api",
  "title": "震度4以上",
  "message": "地震が発生しました",
  "lat": 35.87,
  "lng": 139.65,
  "camera_id": 3,
  "speaker_id": 2,
  "created_at": "2026-03-08T18:30:00+09:00",
  "status": "new"
}
```

イベント種別の基本セット。

```text
earthquake
flood
landslide
bear
intrusion
crowd
camera_offline
speaker_offline
manual
```

重大度。

```text
info
warning
critical
```

---

# 7. ルールエンジン

イベントを受けて自動動作します。

```text
IF event
THEN action
```

例。

```text
IF earthquake >= warning
THEN
  map focus
  speaker alert
  panel text
  mobile notify
```

```text
IF bear detected
THEN
  show nearest camera
  speaker warning in zone
  mobile notify to rangers
```

```text
IF crowd > threshold
THEN
  show camera
  panel = 混雑しています
  audio clip = 注意喚起
```

---

# 8. Video Engine 設計

いまの安定版を維持します。

```text
RTSP
→ decode
→ compositor
→ HDMI display
```

原則。

```text
pipeline は凍結
UIとイベントだけ拡張
```

表示モード。

```text
1 / 4 / 9 / 12
単画面
シーケンス
イベント自動単画面
```

イベント時は自動でこうします。

```text
通常 = シーケンス
警報 = 対象カメラを単画面表示
```

---

# 9. Speaker 制御設計

AXIS スピーカーは3段階で使います。

## 通常運用

一番安定する方法。

```text
AudioClip
Panel text
```

## ライブ放送

必要時のみ。

```text
RTP
```

## API

機器制御。

```text
HTTPS VAPIX
```

アクション種類。

```text
play clip
display text
tts generate + clip
rtp live stream
stop audio
clear panel
```

実運用ではこれを推奨します。

```text
通常警報 = AudioClip
短い案内 = Panel
ライブ呼びかけ = RTP
```

---

# 10. 通知設計

通知は3層に分けます。

## 1次通知

現地向け。

```text
Speaker
Panel
HDMI表示
```

## 2次通知

運用者向け。

```text
Mobile UI
LINE
Mail
Slack
```

## 3次通知

記録向け。

```text
Event DB
CSV export
PDF report
```

---

# 11. データベース設計

最低限必要なテーブルです。

## cameras

```text
id
name
rtsp_url
address
lat
lng
enabled
zone_id
group_name
note
```

## speakers

```text
id
name
ip
rtp_ip
https_url
address
lat
lng
enabled
zone_id
note
```

## zones

```text
id
name
type
color
geojson
priority
note
```

## events

```text
id
type
level
source
title
message
lat
lng
camera_id
speaker_id
zone_id
status
created_at
closed_at
operator
```

## rules

```text
id
name
event_type
condition_json
action_json
enabled
```

## clips

```text
id
name
speaker_id
clip_no
text
file_path
enabled
```

---

# 12. 外部イベント連携

ここが本格化の鍵です。

入力ソースを増やします。

```text
Jetson AI
AOA人数カウント
地震API
河川水位API
雨量API
火災センサー
手動通報
```

受信方法。

```text
HTTP POST
MQTT
WebSocket
Polling
```

おすすめはこれです。

```text
Jetson → MQTT
公共API → Polling
手動 → UI
```

---

# 13. AI連携

Jetson 側で検知し、AutoViewPro は統合表示に徹します。

例。

```text
Jetson:
  bear detected on cam_7
  lat/lng included
  confidence 0.93

AutoViewPro:
  event create
  map center
  show camera
  speaker warning
  mobile notify
```

AIは検知専用、AutoViewPro は運用専用に分離します。

---

# 14. スマホUI

スマホは簡易オペレーションに特化します。

```text
Map簡易表示
1/4/9/12切替
STOP
緊急放送
イベント一覧
確認ボタン
```

防災用途では次の2ボタンが重要です。

```text
緊急放送
解除
```

---

# 15. 観光システムへの分岐

あなたの発想通り、公開側を別UIにすると観光システムになります。

```text
内部UI = 防災運用
外部UI = 観光案内
```

公開側はこうします。

```text
YouTube Live
観光スポットMAP
混雑表示
イベント案内
天気
交通情報
```

つまり1つの基盤で

```text
防災
監視
観光
```

を分けて運用できます。

---

# 16. 運用フロー

完成形ではこう動きます。

## 地震

```text
地震API受信
→ Event生成
→ MAP赤表示
→ 対象ZoneのSpeaker再生
→ Panelに避難案内
→ Mobile通知
→ Eventログ保存
```

## 熊検知

```text
Jetson検知
→ Event生成
→ MAPに🐻表示
→ 最寄りCamera表示
→ Speaker警告
→ Mobile通知
```

## 混雑

```text
人数カウント超過
→ Zone警告
→ Camera表示
→ Panel表示
→ AudioClip再生
```

---

# 17. フェーズ分け

一気に全部は作らず、4段階で進めるのが安全です。

## Phase 1

いまほぼ到達済み。

```text
Camera
Speaker
Map
Mobile
```

## Phase 2

防災基盤。

```text
Zones
Events
Rules
Speaker panel
Notification
```

## Phase 3

AI・外部連携。

```text
Jetson
Earthquake API
AOA
Sensors
```

## Phase 4

公開系。

```text
YouTube Live
Tourism UI
Public Map
```

---

# 18. まず最優先で作るべきもの

本格的な MAP防災システムにするなら、次の3つが最優先です。

```text
1 events テーブル
2 zones テーブル
3 rule engine
```

これが入ると “監視画面” から “防災管理システム” に変わります。

---

# 19. 完成形の定義

最終的な AutoViewPro はこうなります。

```text
MAP防災統合プラットフォーム
├ 監視
├ 放送
├ 通知
├ AI検知
├ 記録
└ 公開案内
```

つまり

```text
PSIM + 小型VMS + 防災放送 + 観光ポータル
```

に近いです。

---

# 20. 次に具体化するなら

実装順として一番良いのはこれです。

```text
1 SpeakerSettings 完成
2 Map に Cameras + Speakers 同時表示
3 events / zones DB追加
4 Event画面追加
5 ルールエンジン追加
```

次に進めるなら、**events / zones を含めた SQLite スキーマ完全版**から作るのが一番きれいです。
