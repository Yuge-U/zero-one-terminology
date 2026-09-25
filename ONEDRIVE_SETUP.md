# TERMINOLOGY OneDrive同期

## 公開前の設定

CANVASと同じMicrosoft Entraアプリ登録を使います。

- 既定クライアントID: `b75b499d-2b47-42ed-9e10-41cd76dbc6c5`
- 個人用Microsoftアカウント (`consumers`)
- 委任権限: `Files.ReadWrite.AppFolder` のみ
- MSAL Browser 5.17.1、認可コード＋PKCE。クライアントシークレット不要

1. このアプリ登録を管理できるアカウントでMicrosoft Entra管理センターを開く。
2. 「アプリの登録」で上記クライアントIDを検索し、「認証」を開く。
3. 既存のCANVASのURIを残したまま、**シングルページ アプリケーション (SPA)** のリダイレクトURIに次を追加する。

   `https://yuge-u.github.io/zero-one-terminology/`

4. 同じMicrosoftアカウントでCANVASとTERMINOLOGYに接続する。
5. MY LEARNINGから「このブラウザのデータを取り込む」を選ぶと、接続前に保存したお気に入り・学習記録を明示的に統合できる。

端末にCANVASのクライアントID上書き設定がある場合は、その値が優先されます。別のアプリ登録に変えると保存領域も変わります。GraphのトークンやOneDriveフォルダ名を直接コピーする必要はありません。

## 保存仕様

```text
/me/drive/special/approot
├─ CANVASの既存フォルダ・設定（変更しない）
└─ TERMINOLOGY
   ├─ user-data.data
   └─ history
      └─ {クイズ実施UUID}.data
```

`.data` の内容はJSON。CANVASは `.json` を再帰収集するため、この拡張子で作戦一覧・バックアップへの混入を防ぎます。CANVASの一括バックアップには含まれないので、TERMINOLOGYのバックアップ機能を使ってください。

- `user-data.data`: 形式・構造バージョン・用語集バージョン・更新日時、お気に入りと閲覧済みを安定した用語IDで保存。
- 各項目は `value / clock / opId`。解除をfalseの記録として残し、古い端末からのお気に入り復活を防ぐ。
- 同じ項目の同時編集は論理時刻、同値の場合は操作IDで決定し、異なる項目を統合する。端末の時計が大きくずれている場合も必ず実時刻順になるという保証はない。
- クイズ履歴は終了または中断時に独立保存。同じUUID・同じ内容の再送は二重計上しない。異なる内容で同じIDの場合は同期を停止する。
- 回答ごとのUUID・用語ID・正誤・日時を保存。自由回答の入力文は保存しない。
- 間違えた用語・正答数は履歴から集計。閲覧済みと正答実績を区別し、「習得済み」と自動判定しない。
- 回答途中はタブ内の一時保存も行い、再読み込み時に中断履歴として回収する。OSによる強制終了・サイトデータ削除では直近の未完了クイズを失う場合がある。

## 同期・競合

- 操作を先にlocalStorageへ保存し、1.5秒後・接続後・オンライン復帰・手動操作で同期。
- 端末データはクライアントID＋MSAL homeAccountIdごとに分離。未接続データは自動アップロードしない。
- 同一ブラウザの複数タブは操作別キーを使い、別項目の更新を失わない。
- 状態ファイルはメタデータ→本文→メタデータで読み、本文とETagの対応を確認する。
- 更新はGraph upload sessionの `If-Match`、新規は `conflictBehavior: fail` を使う。`deferCommit: true` で転送と確定を分け、個人用OneDriveの明示コミットでも `If-Match` を送る。転送中の他端末更新も検知する。
- 409/412は最大4回、再読込・統合して再試行。その他のエラーや破損・未対応バージョンでは上書きを停止。
- アップロードURLにはBearerトークンを付けない。Graphリクエストのみ付与。
- クイズ履歴と状態ファイルは別々に保存するので原子的な一括更新ではない。途中失敗しても再試行可能。
- 通信失敗・容量不足は画面に表示。自動的に端末データを消さない。
- バックアップ復元も置換ではなく統合。進行中のクイズは終了してからバックアップする。

## 検証

```text
node --test tests/learning.test.cjs
npm install
npm run test:browser
```

ブラウザテストはMicrosoft Graphと認証を模擬し、実際のEdgeでゲスト移行・5問クイズ・再読込・アカウント分離・二端末同期・解除反映を確認します。実MSALの未接続起動も確認します。個人のOneDriveには接続しません。

**公開前に必要な実アカウント検証:** SPA URI登録後、同じアカウントの二端末で接続、登録・解除、クイズ履歴同期、同時更新、オフライン復帰を確認してください。特にAppFolder権限でのupload sessionと条件付き更新は、実アカウントでの確認が必要です。テストの成功を実OneDriveでの確認済みという意味では扱いません。

参考:
- https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder
- https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0
