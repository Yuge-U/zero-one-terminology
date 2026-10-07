# ZERO ONE のアイコン検証

4アプリ共通の公開後チェックは `.github/workflows/icon-platforms.yml` と
`scripts/verify-icon-platforms.cjs` で実行する。

| 対象 | 自動検証 |
|---|---|
| Mac | macOS 15 上の WebKit と Chromium |
| Windows | Windows 2025 上の Chrome と Edge |
| iPhone / iPad | Linux 上の WebKit の端末エミュレーション |
| Android | Linux 上の Chromium の端末エミュレーション |

各プロファイルで全4アプリの通常URLを開き、タブ用画像、Apple用画像、
PWA 192/512px画像の参照先・公開バイト・実際の画像デコード・寸法を検証する。
公開画像は各リポジトリの承認済み生成物と SHA-256 で照合する。
PRACTICEのビルド時生成PNGは原版のSHA-256と公開済み生成物の固定SHA-256を検証する。
その原版を更新する場合は `scripts/icon-platforms.json` の生成物ハッシュも更新する。
PWA の `id` / `start_url` / `scope` は既存の値を保持する。
再読み込み時のApple用参照とスクリーンショットも記録する。

この検証はSafari製品の「お気に入り」データベースやOSのランチャー画像を操作しない。
Mac WebKit の成功は Safari 実機のブックマーク更新成功を意味しない。
スマートフォン・タブレットはエミュレーションであり、物理端末の検証ではない。
実機ではタブ、お気に入り/ブックマーク、ホーム画面、インストール済みアプリを確認する。
画像の更新のためにアプリをアンインストールしたり、サイトデータを削除したりしない。

## Mac Safari で旧お気に入り画像だけが残る場合

公開URLの `apple-touch-icon` と配信バイトが新画像でも、Safari側の保存画像は残る場合がある。
アイコン更新の問題は [WebKit #266426](https://bugs.webkit.org/show_bug.cgi?id=266426)
にも報告されている。ただし、この報告だけで個別端末の原因を断定しない。

`scripts/backup-safari-icon-cache.command` はMac上でユーザーが手動実行する補助ツール。
Safariが終了している場合だけ、既知の場所にある `Touch Icons Cache` と
`Favicon Cache` ディレクトリをデスクトップの日時付きフォルダへ移動する。
削除処理、sudo、強制終了、履歴・Cookie・ブックマーク・Webサイトデータへの操作はない。
全サイトのアイコンキャッシュが再取得対象になる。Safariプロファイルにより格納場所が異なる場合は、
未検出として止め、広い範囲のキャッシュ削除で代用しない。

実行前に編集内容を保存し、Safariを Command+Q で終了する。
実行後Safariを起動して4アプリの通常URLを開き、お気に入りの画像を確認する。
このツールは再取得の準備を行うもので、Safariの更新を保証するものではない。
復元する場合はSafariを終了し、退避フォルダ内の `restore.txt` の元の場所へ戻す。
