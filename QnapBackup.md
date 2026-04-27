STEP 1: QNAPのフォルダをUbuntuに認識させる（マウント）
# マウント用の場所を作成
sudo mkdir -p /mnt/qnap_backup

# QNAPを接続（IPアドレスはご自身の環境に合わせてください）
# username/password はQNAPのログイン情報です
sudo mount -t cifs //192.168.x.x/Github /mnt/qnap_backup -o username=admin,password=your_password


STEP 2: QNAP側に「受け皿（空箱）」を作る
cd /mnt/qnap_backup
mkdir AutoviewPro.git
cd AutoviewPro.git

# 共有用の「空の箱（ベアリポジトリ）」として初期化
git init --bare --shared

Gemini の回答
QNAPに Github という共有フォルダを作成済みですね。そこにUbuntu（NUC）からGitでバックアップするための**「現実的で確実な手順」**をまとめました。

GitHubの100MB制限に悩まされることなく、社内LANの爆速スピードでバックアップできるようになります。

STEP 1: QNAPのフォルダをUbuntuに認識させる（マウント）
まず、UbuntuからQNAPのフォルダに読み書きできるようにします。

Bash
# マウント用の場所を作成
sudo mkdir -p /mnt/qnap_backup

# QNAPを接続（IPアドレスはご自身の環境に合わせてください）
# username/password はQNAPのログイン情報です
sudo mount -t cifs //192.168.x.x/Github /mnt/qnap_backup -o username=admin,password=your_password
STEP 2: QNAP側に「受け皿（空箱）」を作る
次に、QNAPの中に「AutoviewPro専用の保管庫」を1回だけ作成します。

Bash
cd /mnt/qnap_backup
mkdir AutoviewPro.git
cd AutoviewPro.git

# 共有用の「空の箱（ベアリポジトリ）」として初期化
git init --bare --shared
STEP 3: バックアップ用のスクリプトを作成
qnap-sync.sh
#!/bin/bash

# 1. もしQNAPがリモートに登録されていなければ登録する
if ! git remote | grep -q "qnap"; then
    git remote add qnap /mnt/qnap_backup/AutoviewPro.git
    echo "QNAPをリモート先に登録しました。"
fi

# 2. .gitignore は作成しておく（node_modulesは重いので基本除外がおすすめ）
if [ ! -f .gitignore ]; then
    echo "node_modules/" > .gitignore
    echo ".DS_Store" >> .gitignore
fi

# 3. 変更をすべて追加してコミット
git add .
msg="Internal Backup: $(date '+%Y-%m-%d %H:%M:%S')"
git commit -m "$msg"

# 4. QNAPへ送信
echo "QNAPへバックアップ中..."
if git push qnap main; then
    echo "------------------------------------"
    echo "【成功】QNAPへのバックアップが完了しました！"
else
    echo "------------------------------------"
    echo "【失敗】マウント状態などを確認してください。"
fi