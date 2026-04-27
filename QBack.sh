#!/bin/bash

echo "--- バックアップを開始します ---"

# 1. 変更をすべて追加
git add .

# 2. 現在の日時をメッセージにして保存
current_time=$(date "+%Y-%m-%d %H:%M:%S")
git commit -m "timelapse.js replace before Backup: $current_time"

# 3. QNAP (Gitea) へ送信
echo ">> QNAP (Gitea) へ送信中..."
git push origin map-refactor:main

# 4. GitHub へ送信 (もし登録してあれば)
echo ">> GitHub へ送信中..."
git push https://github.com/jinno0606s/AutoviewPro.git map-refactor:main

echo "--- すべて完了しました！ ---"
read -p "Press [Enter] to close..."