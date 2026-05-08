<template>
  <div class="terms-shell">
    <Navbar />

    <main class="terms-page">
      <section class="terms-hero">
        <p class="terms-eyebrow">Terms of Service</p>
        <h1>TimeLapse Pro 利用規約</h1>
        <p>
          本利用規約（以下、「本規約」といいます。）は、株式会社コムワークス（以下、「当社」といいます。）が提供する
          TimeLapse Pro（以下、「本サービス」といいます。）の利用条件を定めるものです。本サービスを利用する法人、
          団体、または個人（以下、「利用者」といいます。）は、本規約に同意した上で本サービスを利用するものとします。
        </p>
      </section>

      <section class="terms-document" aria-label="利用規約本文">
        <article v-for="section in terms" :key="section.title" class="terms-section">
          <h2>{{ section.title }}</h2>

          <template v-for="(block, index) in section.blocks" :key="index">
            <h3 v-if="block.subtitle">{{ block.subtitle }}</h3>

            <ol v-if="block.type === 'ordered'" :start="block.start || 1">
              <li v-for="item in block.items" :key="item">{{ item }}</li>
            </ol>

            <ul v-else-if="block.type === 'unordered'">
              <li v-for="item in block.items" :key="item">{{ item }}</li>
            </ul>

            <p v-else>{{ block.text }}</p>
          </template>
        </article>
      </section>
    </main>

    <Footer />
  </div>
</template>

<script setup>
import Footer from "../components/Footer.vue"
import Navbar from "../components/Navbar.vue"

const terms = [
  {
    title: '第1条 用語の定義',
    blocks: [
      {
        subtitle: '1. 本サービス',
        type: 'text',
        text: '当社が提供するカメラ管理およびタイムラプス撮影システム「TimeLapse Pro」を指します。本サービスは、ネットワークカメラから静止画を定期取得し、タイムラプス映像の生成、管理、ダウンロード等を行うためのシステムです。'
      },
      {
        subtitle: '2. 利用者',
        type: 'text',
        text: '本規約に同意し、本サービスを利用する法人、団体、または個人を指します。'
      },
      {
        subtitle: '3. 管理者',
        type: 'text',
        text: '本サービスにおいて、利用者アカウント、カメラ設定、アクセス権限、保存データ等を管理する権限を有する者を指します。'
      },
      {
        subtitle: '4. カメラ情報',
        type: 'text',
        text: 'カメラ名称、IPアドレス、RTSP URL、Snapshot URL、ポート番号、ユーザー名、パスワード、ストリームパス、設置場所情報等、本サービスで管理される接続情報を指します。'
      },
      {
        subtitle: '5. メディアデータ',
        type: 'text',
        text: '本サービスを通じて取得、生成、保存、出力される静止画、タイムラプス動画、ZIPファイル、ログデータ等を指します。'
      }
    ]
  },
  {
    title: '第2条 サービス内容',
    blocks: [
      {
        type: 'ordered',
        items: [
          '本サービスは、登録済みネットワークカメラから静止画を取得し、タイムラプス画像および動画を生成・管理する機能を提供します。',
          '本サービスには以下の機能が含まれます。'
        ]
      },
      {
        type: 'unordered',
        items: [
          'カメラ登録・管理',
          'タイムラプススケジュール設定',
          '静止画取得',
          'タイムラプス動画生成',
          'MP4動画出力',
          'ZIPダウンロード',
          'メディアプレビュー',
          'メディア削除',
          'ユーザー認証およびアクセス管理'
        ]
      },
      {
        type: 'ordered',
        start: 3,
        items: [
          '本サービスは業務用途向けシステムであり、一般消費者向けサービスではありません。'
        ]
      }
    ]
  },
  {
    title: '第3条 利用条件',
    blocks: [
      {
        type: 'ordered',
        items: [
          '利用者は、正当な権限を有するカメラおよびネットワーク機器のみを本サービスへ登録するものとします。',
          '利用者は、適用される法令、プライバシー保護規定、施設管理規則、社内規程等を遵守して本サービスを利用しなければなりません。',
          '利用者は、本サービスを認可された業務目的以外に利用してはならないものとします。'
        ]
      }
    ]
  },
  {
    title: '第4条 アカウント管理',
    blocks: [
      {
        type: 'ordered',
        items: [
          '本サービスの利用には有効なユーザーアカウントが必要です。',
          '利用者は、ID・パスワード・認証情報等を自己の責任において適切に管理するものとします。',
          '利用者は、アカウントを第三者へ譲渡、貸与、共有してはならないものとします。',
          '利用者アカウントを通じて行われた行為は、当該利用者自身による行為とみなします。',
          '管理者は、必要に応じてアカウントの作成、停止、削除、アクセス制限を行うことができます。'
        ]
      }
    ]
  },
  {
    title: '第5条 カメラおよびネットワーク利用',
    blocks: [
      {
        type: 'ordered',
        items: [
          '利用者は、第三者のカメラ、公開カメラ、外部ネットワーク、または許可されていない機器へ接続してはならないものとします。',
          'カメラ認証情報は機密情報として適切に管理しなければなりません。',
          '利用者は、本サービスを利用して不正アクセス、監視妨害、ネットワーク妨害等を行ってはならないものとします。'
        ]
      }
    ]
  },
  {
    title: '第6条 タイムラプス撮影およびメディアデータ',
    blocks: [
      {
        type: 'ordered',
        items: [
          '本サービスは、設定されたスケジュールに基づき静止画を自動取得する場合があります。',
          '利用者は、撮影間隔、保存期間、生成対象範囲、出力設定等について自己の責任で管理するものとします。',
          '生成されたメディアデータには機密情報または個人情報が含まれる場合があり、利用者は適切に管理しなければなりません。',
          '利用者は、ダウンロードしたメディアデータを社外へ無断で公開または共有してはならないものとします。'
        ]
      }
    ]
  },
  {
    title: '第7条 プライバシーおよび個人情報',
    blocks: [
      {
        type: 'ordered',
        items: [
          '本サービスを通じて取得される映像には、人物、車両、施設、公共空間その他識別可能な情報が含まれる場合があります。',
          '利用者は、個人情報保護法その他関連法令を遵守して本サービスを利用するものとします。',
          '利用者は、本サービスを以下の目的に利用してはなりません。'
        ]
      },
      {
        type: 'unordered',
        items: [
          '不法監視',
          'ストーカー行為',
          '嫌がらせ',
          '差別行為',
          '個人追跡',
          'その他不適切な監視行為'
        ]
      }
    ]
  },
  {
    title: '第8条 データ保存およびバックアップ',
    blocks: [
      {
        type: 'ordered',
        items: [
          '本サービスのデータは、ローカルストレージ、サーバー、データベース、または外部記録媒体へ保存される場合があります。',
          '当社は、データの完全性、永続性、消失防止等を保証するものではありません。',
          '利用者は、必要に応じて自己の責任でバックアップを取得するものとします。',
          '本サービス上でデータを削除した場合でも、バックアップ、キャッシュ、外部保存媒体等から完全に削除されることを保証するものではありません。'
        ]
      }
    ]
  },
  {
    title: '第9条 セキュリティ',
    blocks: [
      {
        type: 'ordered',
        items: [
          '利用者は、信頼できるネットワークおよび承認済み端末から本サービスへアクセスするものとします。',
          '管理者は、サーバー、認証情報、保存データ、メディアファイル等を適切に保護する責任を負います。',
          '利用者は、不正アクセス、情報漏洩、異常動作等を発見した場合、速やかに管理者へ報告しなければなりません。'
        ]
      }
    ]
  },
  {
    title: '第10条 禁止事項',
    blocks: [
      {
        type: 'text',
        text: '利用者は、以下の行為を行ってはならないものとします。'
      },
      {
        type: 'unordered',
        items: [
          '認可なくカメラまたはアカウントへアクセスする行為',
          '認証回避または権限制御回避',
          '不正なメディア削除または改ざん',
          'システムデータの無断持ち出し',
          '悪意あるプログラム等の実行',
          'サーバー、ネットワーク、ストレージへの妨害行為',
          '法令または公序良俗に反する行為',
          '当社または第三者へ損害を与える行為',
          'その他当社が不適切と判断する行為'
        ]
      }
    ]
  },
  {
    title: '第11条 サービス変更・停止',
    blocks: [
      {
        type: 'ordered',
        items: [
          '当社は、保守、障害対応、セキュリティ対策、運営上の理由等により、本サービスの全部または一部を変更、停止、終了する場合があります。',
          '当社は、本サービス内容を予告なく変更できるものとします。',
          '当社は、本サービスの変更、停止、終了により生じた損害について責任を負わないものとします。'
        ]
      }
    ]
  },
  {
    title: '第12条 非保証',
    blocks: [
      {
        type: 'ordered',
        items: [
          '当社は、本サービスについて以下を保証するものではありません。'
        ]
      },
      {
        type: 'unordered',
        items: [
          '常時正常に動作すること',
          'エラーや障害が発生しないこと',
          'すべての映像が正常に取得・保存されること',
          '特定目的への適合性',
          '保存データの完全性'
        ]
      },
      {
        type: 'ordered',
        start: 2,
        items: [
          'カメラ、ネットワーク、FFmpeg、外部ソフトウェア、OS、ハードウェア等の影響により、本サービスの機能が正常に動作しない場合があります。'
        ]
      }
    ]
  },
  {
    title: '第13条 免責事項',
    blocks: [
      {
        type: 'ordered',
        items: [
          '当社は、本サービスの利用または利用不能により発生した損害について、一切責任を負わないものとします。',
          '当社は、以下に起因する損害について責任を負いません。'
        ]
      },
      {
        type: 'unordered',
        items: [
          'カメラ故障',
          'ネットワーク障害',
          'サーバー障害',
          'ストレージ障害',
          '外部ソフトウェア障害',
          'データ消失',
          '不正アクセス',
          'ウイルス感染',
          '天災地変',
          'その他不可抗力'
        ]
      }
    ]
  },
  {
    title: '第14条 損害賠償',
    blocks: [
      {
        type: 'text',
        text: '利用者が本規約に違反し、当社または第三者へ損害を与えた場合、利用者はその損害を賠償するものとします。'
      }
    ]
  },
  {
    title: '第15条 規約変更',
    blocks: [
      {
        type: 'text',
        text: '当社は、必要に応じて本規約を変更できるものとします。変更後の規約は、本サービスまたは関連ウェブサイトへ掲載した時点より効力を有するものとします。'
      }
    ]
  },
  {
    title: '第16条 準拠法および管轄裁判所',
    blocks: [
      {
        type: 'text',
        text: '本規約の準拠法は日本法とします。'
      },
      {
        type: 'text',
        text: '本サービスに関して紛争が生じた場合、さいたま地方裁判所を第一審の専属的合意管轄裁判所とします。'
      }
    ]
  },
  {
    title: '第17条 お問い合わせ',
    blocks: [
      {
        type: 'text',
        text: '本サービスに関するお問い合わせは、システム管理者または株式会社コムワークスまでご連絡ください。'
      }
    ]
  }
]
</script>

<style scoped>
.terms-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg);
}

.terms-page {
  flex: 1;
  background: var(--bg);
  color: var(--text-body);
  padding: 56px 20px 72px;
}

.terms-hero,
.terms-document {
  width: min(100%, 960px);
  margin: 0 auto;
}

.terms-hero {
  margin-bottom: 28px;
}

.terms-eyebrow {
  color: var(--primary);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
  margin: 0 0 10px;
  text-transform: uppercase;
}

.terms-hero h1 {
  margin-bottom: 18px;
}

.terms-hero p,
.terms-section p,
.terms-section li {
  color: var(--text-body);
  line-height: 1.9;
}

.terms-hero p {
  max-width: 880px;
  margin: 0;
}

.terms-document {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  padding: 36px 40px;
}

.terms-section {
  border-bottom: 1px solid var(--border);
  margin-bottom: 30px;
  padding-bottom: 30px;
}

.terms-section:last-child {
  border-bottom: 0;
  margin-bottom: 0;
  padding-bottom: 0;
}

.terms-section h2 {
  font-size: 22px;
  margin-bottom: 18px;
}

.terms-section h3 {
  color: var(--text-heading);
  font-size: 16px;
  font-weight: 600;
  margin: 18px 0 8px;
}

.terms-section p {
  margin: 0 0 12px;
}

.terms-section ol,
.terms-section ul {
  margin: 0 0 16px;
  padding-left: 1.5em;
}

.terms-section li {
  margin-bottom: 8px;
  padding-left: 2px;
}

.terms-section li:last-child {
  margin-bottom: 0;
}

@media (max-width: 640px) {
  .terms-page {
    padding: 36px 14px 52px;
  }

  .terms-document {
    padding: 24px 18px;
  }

  .terms-section h2 {
    font-size: 20px;
  }
}
</style>
