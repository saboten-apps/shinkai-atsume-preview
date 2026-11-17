> 履歴保存用。本文の作業指示・未実装・版番号は古い情報を含みます。再開時は ../AI-HANDOFF.md を参照してください。旧本文の相対リンクは移動前の docs/ が基準です。

> 2026-11-16追加: 3Dの描画上限・解像度調整・30秒測定。[3D-PERFORMANCE.md](./3D-PERFORMANCE.md) を参照。Pixel実機性能は未確認。

> 2026-11-16追加: 長押し選択に場所の紹介カードを追加。[PLACE-INTRODUCTIONS.md](./PLACE-INTRODUCTIONS.md) を参照。

> 次段階の更新: 自由な景色撮影とガチャ不要の共有リンクを追加。仕様・検証・制限は [SCENERY-PHOTOS.md](./SCENERY-PHOTOS.md) を参照。

> 2026-11-16更新: 外部AIの建物選択・修正台帳・びゅうお実装を取り込み、公開前レビューで修正しました。最新状態と制限は [IMPORT-REVIEW-2026-11-16.md](./IMPORT-REVIEW-2026-11-16.md) を先に参照。以下の未実装記述には当時の状態を含みます。

# 実装担当AIへの引継書

作成日: 2026-11-15。特定のモデル・開発サービスに依存しない再開用文書。

## 最初に読むもの

1. 本書。
2. [NEXT-DEVELOPMENT-DESIGN.md](./NEXT-DEVELOPMENT-DESIGN.md): 今後の設計・段階ごとの完了条件。
3. [ASTRA-HANDOFF.md](./ASTRA-HANDOFF.md): 既存実装の詳細・素材・公開手順。

今回ユーザーが依頼したのは今後の設計と引継書。**今回の文書作成では新機能を実装・デプロイしていない。** 次の実装依頼を受けたら、まず一区画の建物選択を完成させる。
設計の提案値を、ユーザーが合意した仕様と取り違えない。古い履歴と食い違ったら現行コード・manifest・公開版を確認する。

## ユーザーと目的

- 沼津在住。写真を自身で撮影できる。市役所・びゅうお等の素材を既に提供済み。
- 最終目的は静岡県東部でのAI導入支援の仕事。当面はうみまちラボの認知と、地元で喜ばれるアプリ。
- ガチャを入口にした軽いスマホブラウザゲーム。実機はPixel 10 Pro。
- 画質を上げたいが、動作と通信は軽くしたい。事前保存も必要で、既に実装済み。
- 地元の希望者から写真や紹介リンクを受け取り、古くなった建物を個別更新する方向を相談中。
- 重複した確認や写真の再送依頼を避ける。できたことと未確認を区別して簡潔に報告する。

## 作業場所と版の基準

| 用途 | 場所・状態 |
|---|---|
| 正本 | `/workspace/shinkai-atsume`、private `saboten-apps/shinkai-atsume` |
| 正本の作業ブランチ | `codex/daily-exploration` |
| 本書作成前の正本HEAD | `3f243e875451c51b2e8c4414cc0ebd15abb1642b`（前回引継書） |
| 現行アプリコード | `8b91cdc5362472ebc68d0c628aa8ad33475c87e7` |
| テスト用リポジトリ | `/workspace/shinkai-atsume-preview`、public `saboten-apps/shinkai-atsume-preview` |
| テスト公開URL | https://saboten-apps.github.io/shinkai-atsume-preview/ |
| 既存記録の公開版 | main `315744f17db99d71bc29b651c5e0185423a8abf3`、PR #23、Actions 43706527991成功 |
| ローカルpreview | `codex/coast-expansion`、`16e2733` |

今回ローカルのbranch/statusと `app/UPSTREAM.json` の正本コード参照を再確認した。公開サイトとリモート最新状態の再照合は今回していない。作業再開時はgit statusとリモート差分を確認する。
正本mainは本番。ユーザーの新たな指示なく本番マージしない。テスト先への反映はこれまで許可されている。
previewの `app/` は生成コピー。そこを正本として手編集しない。

previewに残っている生成診断:
- 変更: `realdata-test/corridor-dem-stats.json`、`corridor-water-stats.json`
- 未追跡: `realdata-test/port-lod3-comparison.json`、`spike-3d/public/data/station-manifest-2023.json`

これらを無関係な変更とまとめてコミットしたり、一括破棄したりしない。

## 次の実装依頼に使うプロンプト

```text
docs/AI-HANDOFF.md、docs/NEXT-DEVELOPMENT-DESIGN.md、docs/ASTRA-HANDOFF.mdを読み、
深海あつめの開発を引き継いでください。

今回の範囲は「一区画の建物選択」です。原本のgml_idと描画建物を対応させ、
管理用モードでタップした建物のIDと緯度経度を確認・コピーできるようにしてください。
圧縮後もIDが正しい方式を小さなデータで検証してから採用してください。
高さ倍率、市役所置換、区画の読み込みと解放、飛行ドラッグとの競合を考慮してください。

ガチャの遅延読み込み、2D代替、既存保存データ、軽さを維持してください。
全棟への展開、投稿フォーム、オンライン機能、本番mainへのマージは今回含めません。
意味のあるテストと変更前後の計測を行い、テスト公開先へ反映してください。
公開Actionsと実際の配信内容を確認したうえで、結果・未確認事項・次の作業を記録してください。
```

## 実装の入口

正本:
- `src/features/exploration/map/components/Map3DView.tsx`: 3D画面と操作。
- `src/features/exploration/map/three/stationChunks.ts`: 建物区画の読み込み・解放。
- `src/features/exploration/map/three/sceneBuilder.ts`: シーンと衝突形状の登録。
- `src/features/exploration/map/three/buildingHeight.ts`: 高さの表示調整。
- `src/features/exploration/map/three/cityHall.ts`、`cityHallPhotos.ts`: 個別モデルと写真。
- `src/features/exploration/MapDownload.tsx`、`scripts/build-map-download.mjs`: 保存と配信版生成。

preview側のデータ生成:
- `realdata-test/build-2023-corridor.mjs`: 2023年度の建物データ生成。
- `realdata-test/convert-bldg-tex.mjs`: b3dm変換。原本の `_BATCHID` を読み取るが最終描画データにID対応を残していない。
- `realdata-test/audit-coast-coverage.mjs`: 追加範囲の収録照合。
- `realdata-test/validate-station-corridor.mjs`: 配信区画・UV・収録範囲の検証。

原本キャッシュ `/tmp/plateau-scratch/source-bldg2023/` は一時ファイル。別環境では存在を確認し、なければ既存生成スクリプトで取得する。キャッシュがある前提の手順だけで引き継がない。
公式カタログ: https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets
原点lat35.0815/lon138.8576/h0、x東/y上/z南。高さは建物基部から1.3倍表示。

## やってはいけない誤解

- LOD3配布セットだから全建物の写真や詳細形状がある、と説明しない。
- 圧縮前faceIndexを圧縮後GLBにそのまま対応させない。
- 描画だけ隠して古い衝突形状を残さない。
- 建物IDを店舗IDと同一にしない。年度を変えてもgml_idが不変とは限らない。
- キャッシュ削除で図鑑を消さない。`shinkai_gacha_collection_v1` と既存発見記録を維持する。
- Googleマップ画像を抜き出して壁面素材にしない。
- 公共建築だから無条件で自由、民間建築だから一律不可、という説明をしない。
- 写真提供・店舗紹介・施設の公認を混同しない。未確認の協力店を作らない。
- ソフトウェアGPUのFPSをPixel実機の性能として報告しない。

## 検証と記録

従来記録では56テスト・ビルド成功。今回文書のみのためアプリテストは再実行していない。
実装時は `npm test` と `npm run build`、影響する既存ブラウザ検証を実施する。
既存の `check-exploration.mjs`、`check-city-hall.mjs`、`check-coast-expansion.mjs`、`check-map-download.mjs` を参照。

追加する検証:
1. 原本から期待IDを決めた最低10建物で屋根・壁の選択を照合する。
2. 隣接建物、区画境界、空振り、UIタップ、ドラッグを確認する。
3. 解放・再読込で同じIDになり、メモリが累積しないことを確認する。
4. 追加データの通信量と描画負荷を現行版と比較する。
5. 事前保存した版と選択情報の版が一致することを確認する。

検証結果にはコミット、対象区画、操作、期待値、実測、未確認を残す。
他AIへ渡す際は変更ファイルだけでなく、再現コマンド・生成元データ・公開状況・残課題を更新する。

## テスト公開

詳細はASTRA-HANDOFFの手順に従う。
正本で実装・検証・コミット → 正本devをpush → previewのorigin/mainから作業ブランチ →
`python scripts/sync-app-from-main.py /workspace/shinkai-atsume` → `node scripts/prepare-app-map.mjs` →
preview appで検証 → preview PR/マージ → Actions成功 → 公開manifest/hash/表示を確認。
同期はコミット済み正本が前提。GLBはpreviewの元データから用意し、二重管理しない。
公開後、同期元コミットと公開版を引継書へ追記する。APIキー・写真の個人情報・連絡先は公開リポジトリへ含めない。
