#!/bin/bash
# Move only icon caches to a reversible backup; never delete browser or app data.
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  echo "このツールはMac専用です。変更はしていません。"
  exit 1
fi
if pgrep -x Safari >/dev/null; then
  echo "編集内容を保存し、SafariをCommand+Qで終了してから実行してください。変更はしていません。"
  exit 1
fi
backup="$HOME/Desktop/ZERO-ONE-Safari-Icons-$(date +%Y%m%d-%H%M%S)"
roots=("$HOME/Library/Safari" "$HOME/Library/Containers/com.apple.Safari/Data/Library/Safari")
count=0
for root in "${roots[@]}"; do
  for name in "Touch Icons Cache" "Favicon Cache"; do
    source_path="$root/$name"
    if [[ -d "$source_path" && ! -L "$source_path" ]]; then
      if [[ ! -r "$source_path" || ! -w "$root" ]]; then
        echo "アイコンキャッシュにアクセスできません: $source_path"
        echo "アクセス権は変更しません。ここまでの退避先: $backup"
        exit 1
      fi
      mkdir -p "$backup"
      count=$((count+1))
      target="$backup/$count-$name"
      printf '%s\n%s\n\n' "退避先: $target" "元の場所: $source_path" >> "$backup/restore.txt"
      mv "$source_path" "$target"
      echo "退避しました: $source_path"
    fi
  done
done
if [[ "$count" -eq 0 ]]; then
  echo "対象のアイコンキャッシュが見つかりませんでした。変更はしていません。"
  echo "Safariのバージョンとプロファイルの有無を確認してください。"
  exit 1
fi
echo "退避先: $backup"
echo "履歴・Cookie・ブックマーク・アプリデータには触れていません。"
echo "Safariを起動し、ZERO ONEの4アプリを開いてください。全サイトのアイコンは再取得されます。"
