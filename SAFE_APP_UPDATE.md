# 安全なアプリ更新

配信済みの `app-version.json` を起動・復帰時と表示中5分ごとに確認します。連続する復帰イベントは1分以内に重複確認しません。実際の配信版IDが現在と異なる場合だけ「新しいバージョンがあります」と「更新する」を表示します。版IDはアプリの実ファイルから決定的に生成します。設定／バックアップ画面にはIDの先頭12桁を表示します。

更新ボタンを押すと、編集・保存・同期の状態を確認します。配信情報とファイルのSHA-256を確認し、切替直前にも保存状態を確認します。通信失敗、途中の配信、不正な情報、更新準備中の編集では画面を保ちます。キーボード・VoiceOverで操作できます。OAuthの戻りURLを変更しません。

CANVASとPRACTICEは既存のService Workerの登録先を維持し、新規インストールではキャッシュ準備完了後に有効化します。既存のタブがある更新では待機し、更新操作で有効化します。別タブは自動再読み込みせず、使用中の版の静的ファイルを引き続き参照できます。画像・動画の利用者ファイル、API応答、OAuth応答やトークンはキャッシュ対象にしません。ROSTERとTERMINOLOGYは現在の構成を維持し、Service Workerを追加せず、ファイル照合と版ID付きURLで更新します。通信断では現在開いている画面を保持します。

更新はlocalStorage、sessionStorage、IndexedDB、OPFS、MSAL設定、保存スキーマに書き込みません。記録や認証情報の消去、Service Workerの一括解除は行いません。マニフェストのstart_url／scope、ホーム画面アイコン、既存の `webapp://` 起動方法も維持します。

## 実装ファイル

- `zero-one-update.js` / `zero-one-update.css`: 共通の通知・照合・手動切替。
- `scripts/build-update-release.mjs` / `update-release.config.json`: 既存のHTMLと静的アプリファイルから配信版を生成。HTML内のJavaScriptは変更しません。
- 各アプリの更新ガード: PRACTICEの練習・振り返り・タイマー・添付処理、CANVASの自動保存・操作・保存処理、ROSTERの編集フォーム・移行・同期、TERMINOLOGYの未完了クイズ・復元・同期を保護。
- PRACTICEでは同じファイルを `production/safe-update/` と `production/safe-app-update.mjs` から生成します。生成したworkerはコミット済みテンプレートと照合し、配信情報は全実ファイルのSHAと照合します。既存コアの固定SHA検査は維持します。

## 更新・公開手順

ROSTER／TERMINOLOGY／CANVASは、変更後に `node scripts/build-update-release.mjs` を実行し、生成されたHTML・app-version.json・Service Worker（ある場合）を変更と一緒にコミットしてください。`node scripts/build-update-release.mjs --check` が古い版情報や未生成の変更を拒否します。既存のPages公開先は維持します。

PRACTICEは従来の `node tools/build-release.mjs` → `node production/prepare.mjs` で版情報を生成します。許可したアプリコードの差分に対する `production/release.json` の更新と、既存の全公開前検査を通して通常のPagesワークフローから配信します。

PRの検査を確認してから公開してください。初回導入前の古いアプリには更新通知コードがないため、通常の再起動／保存後の再読込で導入し、その後の配信からアプリ内の更新通知が利用できます。ホーム画面アイコンの追加し直しは不要です。

## 検証

`node --test tests/safe-update.test.cjs` と `node tests/safe-update.browser.cjs` で、配信版の正当性、初回起動、更新待機、明示適用、重複通知防止、編集／保存中の拒否、準備中の編集、通信断、部分配信、別タブの保持、認証用の合成値・localStorage・sessionStorage・IndexedDB・他アプリのキャッシュの保持、ベースパス、OAuth URL、ネイティブの各アプリの更新ガードを確認します。ChromiumとWebKitを独立した一時プロファイルで実行します。WebKitではstandaloneフラグも付けて確認します。実Microsoftアカウントの資格情報はテストに使いません。

PRACTICEでは `UPDATE_ROOT=upstream/practice-ui-lab/app/web UPDATE_BUILDER=production/safe-update/build-update-release.mjs node --test production/safe-update/safe-update.test.cjs`、`node production/verify-entry.cjs` が対応する検査です。既存の保存・コピー・更新・OneDrive・写真動画・CANVAS再生の検査も維持します。

実機iPhone／iPadのホーム画面アプリで、公開版A→B、バックグラウンド復帰、実アカウントの認証保持、保存済み記録の一致、機内モードからの復帰、既存アイコンからの起動を確認する作業は残ります。ブラウザWebKitは実機iOSそのものではありません。

## ロールバック

問題のあるアプリ変更を前の検証済みコードへ戻し、上記の版生成・全検査・通常のPages公開を再実行してください。更新機構を残してアプリ変更だけ戻せば、配信されたコードに対応するIDで手動更新できます。この機能全体を戻す場合は、利用者に編集内容を保存してから通常の再読込／再起動で戻した版を開くよう案内してください。保存データ・認証情報の消去やService Workerの一括解除は不要です。
