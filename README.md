# shinkai-atsume-preview

「深海あつめ」（沼津港エリアの地域アプリ）の **3Dマップ技術検証・作業用リポジトリ**。アプリ本体は別リポジトリ `shinkai-atsume`（app/）で管理する。

## 中身

- `spike-3d/` — Three.js による沼津港周辺の軽量3Dマップ・スパイク。PLATEAU実データ（建物LOD2・地形DEM・植生・道路・水面）を通し、全525棟のモデルから元の実写真テクスチャを保持して表示（写真あり434棟、元データに写真なし91棟）。距離・高度による写真の取り外しは行わない。使い方は `spike-3d/README.md`。
- `realdata-test/` — PLATEAU（国土交通省 3D都市モデル 沼津市 2021年度）からGLBを生成する変換パイプライン。手順・実測値・判断記録は `realdata-test/RESULT.md` が正。
- `docs/` — 仕様と設計：SPEC、デザイン設計（GPT Astra）、PLATEAU調査、魚種リサーチ等。

## データの扱い

- 実データのGLB実物（realdata-test 配下）は容量と配布前提の都合で **git管理外**（.gitignore）。スクリプトと RESULT.md の手順で再生成できる。
- 例外：`spike-3d/public/data/` の packed GLB（表示用・合計 約4.3MB）は、リポジトリ単体でプレビューを再現できるよう管理対象に含める。
- 出典：国土交通省 PLATEAU ウェブサイト（3D都市モデル 沼津市 2021年度）の地理空間データをもとに独自にジオメトリ加工・モデル化。
