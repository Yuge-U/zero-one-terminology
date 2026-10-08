# zero-one-terminology
Global Basketball Terminology Dictionary

MY LEARNING records favorites, viewed terms, quiz history and incorrect terms locally.
Optional Microsoft sign-in syncs them to the same OneDrive app folder as CANVAS.

See [OneDrive setup and validation](ONEDRIVE_SETUP.md) before publishing this integration.

Run `node --test tests/learning.test.cjs` for data and synchronization tests.
Run `npm install` and `npm run test:browser` for browser tests (Microsoft Edge required).

## OneDriveの接続操作

上部の共通バーに「未接続」「確認中」「接続中」「接続済み」「再接続が必要」を表示します。「OneDriveに接続」から直接Microsoftへ接続でき、アカウント選択を毎回強制しません。「接続設定」からアカウント変更とサインアウトを選べます。通信・アクセス許可の問題は未接続と区別します。旧画面の接続・アカウント変更・サインアウトのボタンは削除し、共通の操作だけを表示します。

「接続済み」は認証・接続の状態です。保存・同期の完了は各アプリの保存表示で確認してください。Safariの「履歴とWebサイトデータを消去」後は再接続が必要です。既存の保存領域・OneDriveのファイル形式・AppFolder権限を維持しています。
