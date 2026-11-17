> 2026-11-17追記：建物紹介の編集・端末下書き保存・JSON書き出し／復元・検査付き公開取り込みを追加。現行仕様と操作は `app/docs/PLACE-DRAFTS.md` を参照。下記の「未実装」は前段階の記録です。同期元アプリコード：`8e76af4`。

> このファイルは正本の引継書（2026-11-16）のコピーです。
> 正本の最新版：https://github.com/saboten-apps/shinkai-atsume/blob/codex/daily-exploration/docs/AI-HANDOFF.md
> このコピーの元コミット：`2027d8a`。preview内でコード・文書を読む場合、本文の正本ルート基準のパスに `app/` を付けてください。
> `app/` は公開アプリの同期コピーのため、この文書更新では変更していません。現在の引継ぎには本書を優先してください。

# 深海あつめ：次のAIへの引継書

更新日：2026-11-16。**最初に本書を読む。** 現行コードとGitHubの公開結果を確認して整理した。
旧版は `docs/archive/AI-HANDOFF-2026-11-15.md` に保存。旧版やASTRA-HANDOFF、NEXT-DEVELOPMENT-DESIGNには実装前の記述があるため、現在の未実装事項と取り違えない。
今回の依頼は引継書の作成・GitHubへのpush。新機能の実装依頼ではない。

## 目的と最新の方針

- 沼津在住の制作者「うみまちラボ」のアプリ。地域の人に喜ばれるものを作り、将来の静岡県東部でのAI導入支援の仕事につなげたい。
- ガチャ・図鑑・カードと沼津3D探索を一つのアプリで提供。主な対象はスマホ、検証端末は **Pixel 10 Pro**。
- ガチャが入口。3Dコード・データは探索を開いて初めて読み込む。写真付きの場所一覧・紹介も、3Dを開くまでは軽い案内として利用できる。
- **ほかの人から写真を受け取り、制作者本人が確認・更新・公開する運用**を希望。SNS機能は当面後回し。現時点でDB・アカウント・投稿サーバーは不要という方針。
- 建物情報の編集・端末内の下書き保存・書き出しは提案段階で、まだ実装していない。ユーザーの次の依頼に合わせて範囲を決める。
- 店への営業、協力店制度、来店記録、店頭QRスタンプ、ランキング、同時プレイは現在の範囲に含めない。

## リポジトリ・公開の基準

| 項目 | 確認した内容 |
|---|---|
| 正本 | `saboten-apps/shinkai-atsume`（private）、ローカル `/workspace/shinkai-atsume` |
| 正本の開発ブランチ | `codex/daily-exploration` |
| 最新アプリコードの正本コミット | `7929900e759fc8c88519e50985b1aa1d09803512` |
| テスト公開先 | `saboten-apps/shinkai-atsume-preview`（public）、ローカル `/workspace/shinkai-atsume-preview` |
| テストURL | https://saboten-apps.github.io/shinkai-atsume-preview/ |
| 最新アプリ変更のpreview PR | https://github.com/saboten-apps/shinkai-atsume-preview/pull/31 （MERGED） |
| 同PRのmainマージ | `f44fbd58723cbec39837cfb3c2194a9aca12d0ec` |
| 同コードの公開Actions | `43965733399`、success |
| preview同期元 | `app/UPSTREAM.json` のcommitが上記正本コード、魚データSHA-256は `18419a05e7a68b8936bce5a997ff5871d9d06da36d13279dfc2e5b4ffe927455` |

これは**文書更新前のアプリコードの基準**。後続の引継書コミットとは分けて扱う。再開時は必ずgit status・リモート・UPSTREAMを確認する。
**正本mainは本番。新たな指示なくマージしない。** テスト公開先への反映はこれまで許可されている。
previewの `app/` は正本からの生成コピーであり、直接編集して実装の正本にしない。

## 実装済み

1. 日本時間の日付で全員共通のガチャ、24種の魚、図鑑のlocalStorage保存、日英対応、カード。
2. 日替わりの魚探し、探知機、発見カード、発見後の散策、2D代替。海・川を含む魚の配置と今日の魚の発光。
3. 港から駅南口、千本浜公園周辺、我入道周辺の3D。飛行・歩行・潜水、衝突、区画読み込みと解放、事前保存。
4. 建物は2023年度PLATEAU LOD3配布セット由来。**全棟に高精細形状・写真テクスチャがあるわけではない**。市役所・びゅうおは写真を使った近景用の置換モデル。
5. **建物選択は長押し約500ms**。短いタップは移動、8pxを超えるドラッグは選択しない。飛行中も選択可能。選択用JSONは必要時に読み込む。
6. 長押しで市役所・びゅうおの写真付き紹介と共有を表示。未登録建物は「紹介はまだありません」。ID・座標・台帳は折りたたみ。紹介先は明示した原本IDで判定し、近隣建物を一括で紹介しない。
7. `#/places` の「まちを見る」で写真付き一覧。`#/view/port`、`#/view/city-hall`、`#/view/byuuo` から案内・紹介→3Dへ進む。ガチャ不要。
8. 景色の撮影、PNG保存、Web Share、共有視点URL。画像そのものをURLに保存する機能ではなく、景色ごとのOGP生成もない。
9. **最新の軽量化**：移動・飛行は最大60 FPS、静止した地図は30 FPS。持続する負荷でDPRを段階調整。非表示時・写真プレビュー中は描画を休止。目印のレイアウトは景色モードで最大10回/秒、統計通知は1回/秒。
10. 景色ページと探索の設定で **30秒測定・JSON保存**。FPS、フレーム時間、DPR、描画数、カメラ位置、飛行状態を記録する。ページ非表示で測定を中止。保存のみで外部送信しない。

## データと素材

- 魚の正本は正本リポジトリの `data/fish.json`。preview側のコピーを別管理しない。
- 地理座標の原点はlat 35.0815 / lon 138.8576 / h 0、x東・y上・z南。建物は基部から1.3倍の高さ表現。
- 選択用sidecarは56区画・20,522レコード。凸包・高さによる推定であり、すべての面に原本IDを厳密に保持する方式ではない。密集・重複した建物の誤選択には注意。
- `gml_id` は店舗IDではなく、年度更新で不変とも限らない。将来の店舗・場所の管理には独立したIDと原本IDの対応を持たせる。
- 現行モデル版は `release-2026-11-v3-reviewed` / `plateau-2023-lod3`。
- 事前保存は **75アセット / 74,055,085 bytes / version `6dbb2b6b3c65dd72`**。正本・previewの現行生成manifestが一致。古い74アセットの記録を現行値と誤解しない。選択用sidecarは事前保存対象外。
- 軽量化の最終変更は描画側。写真テクスチャ・建物形状・保持範囲・ダウンロード量を削減した変更ではない。
- 提供済み写真は `public/environment/city-hall/` と `public/environment/byuuo/`。由来・ハッシュは各 `sources.json`。市役所の一覧用 `preview.webp` は44,428 bytes、元の `entrance.jpg` を縮小したもの。
- 外部AI由来の試作解体データは公開しない。びゅうお以外の近隣建物を巻き込む置換・削除を再発させない。詳細は `docs/IMPORT-REVIEW-2026-11-16.md`。

## 検証済み・未確認

最新コードで正本とpreviewの **86テスト・ビルド成功**。これらはコード `7929900` の実施結果であり、今回の文書更新だけではアプリテストを再実行していない。

- 60/90/120/144 Hz相当の描画上限、DPRの低下・回復・上下限・読み込み除外を単体テストで確認。
- ビルド版のChromiumで市役所・びゅうおの長押し、紹介写真、共有URL、飛行中の選択を確認。
- スマホ幅の日英一覧・紹介、写真、共有代替、横はみ出し、3Dを先読みしないことを確認。
- 港の変更前後、変更後の駅前・飛行の描画状況を取得。30秒記録のJSON保存、非表示時の描画停止と復帰を確認。
- 公開HTMLが最新のentryを参照し、公開のMap3DView・SceneryPage・ExplorationPageのJSがローカル成果物とバイト一致することを確認。

**Pixel 10 ProのFPS、発熱、電池消費、共有シートは未確認。** Chromium + SwiftShaderはソフトウェア描画で極端に遅くなり、比較時は診断UIでcanvas高も異なる。そこから実機の改善率や同条件の速度向上を断定しない。

## 次の候補と完了条件

### A. まずPixelの実測を受け取る

`docs/3D-PERFORMANCE.md` の手順で港・駅前の静止と飛行を各30秒測定。数分飛行後も測り、発熱・操作感と合わせて見る。
静止中30 FPSは意図した上限。飛行中は30 FPS以上の持続を目標とするが、未達かはまだ不明。DPR下限でも重い場合、描画数・衝突・区画保持量などを原因別に調べる。解像度を落とすだけで性能問題を解決したとしない。

### B. 制作者用の建物情報編集（未実装の提案）

建物を長押し→建物名・紹介文・URLを入力→端末に下書き保存→JSON書き出し→確認してアプリに取り込み公開、という流れを想定。
写真は他の人からドライブ等で受け取り、撮影者・公開加工の利用許可・希望クレジットを記録する。端末保存と全員への公開は別操作として説明する。

実装する場合の完了条件案：
- 原本IDと独立した場所IDを紐づけ、再選択で下書きを復元できる。
- ガチャ・図鑑・発見記録の既存保存キーを変更・削除しない。
- JSONの書き出し・取り込みで形式、版、文字数、URLの許可スキームを検証。文字列をHTMLとして挿入しない。
- 写真バイナリをlocalStorageに詰め込まない。画像ファイル・公開パス・権利記録の扱いを設計する。
- 公開アプリに「管理用ボタン」を隠すだけで認証できたとは扱わない。将来の更新権限と、DB不要のファイル公開運用は区別する。

SNSタイムライン、一般投稿、DB、ログイン、オンライン鬼ごっこを今回の次工程として勝手に追加しない。

## コード・文書の入口（正本のルート基準）

| 対象 | パス |
|---|---|
| 選択・描画・キャプチャ | `src/features/exploration/map/components/Map3DView.tsx` |
| 描画制御 / 測定UI | `src/features/exploration/map/renderBudget.ts` / `map/components/PerformancePanel.tsx` |
| 区画・選択 / 台帳 | `map/three/stationChunks.ts` / `buildingSelection.ts` / `buildingOverride.ts`（いずれも探索ディレクトリ配下） |
| 紹介データ・カード | `src/features/scenery/places.ts` / `PlaceIntroduction.tsx` |
| 一覧・景色ルート | `src/features/scenery/PlacesPage.tsx` / `SceneryPage.tsx` / `viewpoint.ts` |
| 軽量化・実機手順 | `docs/3D-PERFORMANCE.md` |
| 紹介と写真一覧 | `docs/PLACE-INTRODUCTIONS.md` |
| 撮影と共有URL | `docs/SCENERY-PHOTOS.md` |
| 取り込みの検証・残課題 | `docs/IMPORT-REVIEW-2026-11-16.md` |

## 再現と公開の手順

1. 正本の `codex/daily-exploration` を取得しstatusを確認。`npm ci`（依存が未導入なら）→`npm test`→`npm run build`。
2. 必要なブラウザ検証は `scripts/check-place-introductions.mjs`、`check-places-gallery.mjs`、`check-render-performance.mjs`。PlaywrightとChromiumが必要。`APP_URL` を検証サーバーへ向ける。描画検証はSwiftShaderを使用する。
3. 性能スクリプトは任意の `BASELINE_URL`、`TEST_DPR`（既定0.5）、`REPORT_PATH` を受け取る。比較前後で同じDPR・画面・読み込み状態にそろえる。既定の小さな解像度はソフトウェア環境の機能検証用。
4. 正本をコミット・devブランチにpush。previewのorigin/mainから作業ブランチを作成。
5. previewルートで `python scripts/sync-app-from-main.py /workspace/shinkai-atsume` → `node scripts/prepare-app-map.mjs`。同期は正本がクリーンかつコミット済みであることが前提。
6. `npm --prefix app test` → `npm --prefix app run build`。今回変更する `app/` だけを選んでコミットし、preview PRでmainへ反映。
7. Actions成功と、公開HTML・JS・必要なmanifest/素材の一致を確認。正本mainへの本番反映とは別の操作。

開発用worktreeでnode_modulesを共有するとViteの依存最適化キャッシュが干渉し、ReactのuseStateエラーになった。比較検証にはビルド済みファイルを別ポートで配信する方法を使う。

## ワークスペースの注意

previewには以前から以下の診断生成物がある。今回の文書に便乗してコミット・一括破棄しない。
- 変更：`realdata-test/corridor-dem-stats.json`、`realdata-test/corridor-water-stats.json`
- 未追跡：`realdata-test/2023-reviewed-port-stats.json`、`realdata-test/port-lod3-comparison.json`、`spike-3d/public/data/station-manifest-2023.json`

`/tmp/shinkai-perf-baseline` は `be85eee` の比較用detached worktree。`/tmp/shinkai-render-performance.json`、`/tmp/render-benchmark-small.log`、`/tmp/perf-introductions-built.log` 等は一時記録で、別環境では存在しない。再現を一時ファイルだけに依存させない。

Googleマップ画像を抜き出して素材にしない。公共建築だから無条件に自由と説明しない。写真利用の許可と施設との提携を混同しない。PLATEAU/GSIの出典・概略表現の説明を維持する。「親ガチャ」という表現を使わない。
