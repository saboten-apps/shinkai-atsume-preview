# 山並みと水面（2026-11-14）

## 山並み

`public/environment/numazu-region.glb` は国土地理院の標高タイル（DEM10B、z10）から生成した実地形。愛鷹山・沼津アルプス・富士山を含む北緯34.97〜35.43度、東経138.60〜139.13度を収録。高さの倍率は1。従来の富士山を模した回転体は削除した。

- 変換・圧縮：`scripts/generate-regional-terrain.py`。Pillowとgltfpackが必要。
- データURLと原点、生成サイズ、ハッシュ、地形チェック地点は`public/environment/numazu-region.json`。
- 同じPLATEAU ENU原点（北緯35.0815度、東経138.8576度、楕円体高0）を使用。標高から楕円体高への補正は既存地形と同じ39.7065m。
- 約746KB。約125m間隔の遠景用地形なので、小さな尾根や山頂の厳密な標高を再現する測量用途には使えない。
- 樹林・岩・雪・霞の色は演出。雪線は固定で、その日の実際の積雪・天候の表示ではない。
- 新しい山は遠景であり、飛行できる範囲や衝突形状は従来どおり。潜水時は山並みを非表示にする。
- 地形ファイルが読めない場合は警告を記録して探索を続ける。

出典：地理院タイル（標高タイル）を加工。
https://maps.gsi.go.jp/development/ichiran.html
https://maps.gsi.go.jp/development/demtile.html

```sh
python scripts/generate-regional-terrain.py --gltfpack /path/to/gltfpack
```

## 水面

`waterSurface.ts`で海・港・川の水面に、空や建物を映す平面反射、風の波紋、日のきらめき、岸際の淡い波を追加した。

- 海と川で色・波の大きさ・流れの表情を緩やかに変える。流れや波は景観用の演出であり、実測流速・潮汐・波高を表すものではない。
- 一つの256×256px反射ターゲットを共有し、反射更新は最大15回/秒。全面高解像度の反射や波の物理シミュレーションは行わない。
- 遠い細かな波は画素の大きさに応じて抑え、規則的な縞・ちらつきを軽減。波の位相にも揺らぎを加えている。
- 水面と写真の境界は既存の海・川ポリゴンと地面用マスクを使う。反射を描く間は他の水面を隠し、自己参照ループを防ぐ。
- 描画終了時に反射ターゲットを明示的に破棄する。カードを撮るときは反射も更新し、目印を隠した状態に合わせる。
- 波の見た目は変わるが、海面の基準高と潜水操作は維持する。

## 確認

`npm test` は既存28＋地形資産2の30件。
`scripts/check-landscape-water.mjs`で愛鷹山側・沼津アルプス側・水面のPNGを描画し、山の読み込み、256px反射、潜水時の非表示、反射ターゲット破棄を確認。シェーダーエラー・フィードバックループなし。

```sh
npm run dev -- --port 5180
node scripts/check-landscape-water.mjs
node scripts/check-exploration-3d.mjs
node scripts/generate-discovery-scenes.mjs
```

実機Pixel 10 ProでFPSと発熱、岸際・川沿い・潜水からの復帰を確認する。重い場合は反射更新を10回/秒へ、反射解像度を128pxへ調整できる。ガチャでの3D先読みは増えていない。
