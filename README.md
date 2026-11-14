# shinkai-atsume-preview

「深海あつめ」（沼津港エリアの地域アプリ）の **3Dマップ技術検証・作業用リポジトリ**。アプリ本体は別リポジトリ `shinkai-atsume`（app/）で管理する。

## 中身

- `spike-3d/` — Three.js による沼津港から沼津駅南口までの3Dマップ・スパイク。PLATEAU実データ（建物LOD2・地形DEM・植生・道路・水面）を通し、全7,327棟のモデルを28区画に分割し、近い区画から読み込む（元写真あり6,463棟、写真なし864棟）。写真は元データのものを保持し、離れた区画は画像・形状・衝突判定をまとめて解放する。使い方は `spike-3d/README.md`。
- `realdata-test/` — PLATEAU（国土交通省 3D都市モデル 沼津市 2021年度）からGLBを生成する変換パイプライン。手順・実測値・判断記録は `realdata-test/RESULT.md` が正。
- `docs/` — 仕様と設計：SPEC、デザイン設計（GPT Astra）、PLATEAU調査、魚種リサーチ等。

## データの扱い

- 実データのGLB実物（realdata-test 配下）は容量と配布前提の都合で **git管理外**（.gitignore）。スクリプトと RESULT.md の手順で再生成できる。
- 例外：`spike-3d/public/data/` の packed GLB（表示用・合計 約44MB、区画単位で読み込み）は、リポジトリ単体でプレビューを再現できるよう管理対象に含める。
- 出典：国土交通省 PLATEAU ウェブサイト（3D都市モデル 沼津市 2021年度）の地理空間データをもとに独自にジオメトリ加工・モデル化。

## ガチャと探索の統合版（2026-11-14）

テスト公開のビルド対象は `app/` です。本体 `saboten-apps/shinkai-atsume` の指定コミットから同期しています。
開発・公開・Pixel検証・引き継ぎは [HANDOFF-ANTIGRAVITY.md](HANDOFF-ANTIGRAVITY.md) を参照してください。
