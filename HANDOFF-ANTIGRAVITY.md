# アンチグラビティへの引き継ぎ

2026-11-14。ユーザーの決定：本番は `shinkai-atsume`、テスト公開先は `shinkai-atsume-preview`。発見カードはB案（街並み背景）。実機はPixel 10 Pro。

## 編集する場所

- 本体ドラフトPR：https://github.com/saboten-apps/shinkai-atsume/pull/1
- 本体ブランチ：`codex/daily-exploration`
- 本体実装の引き継ぎ：`app/docs/IMPLEMENTATION-HANDOFF.md`（原本は本体の同名ファイル）。
- `app/UPSTREAM.json` が同期した本体コミットと魚JSONのハッシュ。
- **本体リポジトリを編集してコミットし、このリポジトリへ同期する。`app/src`を別々に編集しない。**
- fish.jsonは本体の`data/fish.json`が正。旧spike側のコピーとハードコードのフォールバックを削除した。spikeも`app/data/fish.json`を参照する。

```sh
# 本体で編集してコミットした後、previewルートで実行
python scripts/sync-app-from-main.py /path/to/shinkai-atsume
node scripts/prepare-app-map.mjs
cd app
npm ci
npm test
npm run build
npm run dev -- --host 127.0.0.1 --port 5180
```

GitHub Pagesはmainをpushすると`app/`をビルドして公開する。3Dの生成元モデルは引き続き`spike-3d/public/data/`に保持し、prepareスクリプトが必要な34ファイルだけ統合版へコピーする。生成後の`app/public/map/data/`はgit管理しない。

## できていること

- ガチャ→今日の魚さがし（10地点・日替わり共通）。
- 方角・距離・光・任意の探知音、3Dと2Dの切替、発見記録の保存。
- 3Dのライブ画面、または2D用の事前レンダリング画像を使ったPNGカード。
- ブランド・PLATEAU出典入り、画像保存、Web Share／共有文コピー。
- 遅延ロード、WebGL失敗時の2D代替、低FPS時の案内、動作情報JSONの保存。
- 図鑑データとの互換を維持。実際の来店記録入力を非表示。
- ユニット25件、2Dと3DのChromium操作テスト。

## 次にすること

1. Pixel 10 Proでテスト公開版を触る。初回読み込み、連続飛行、発熱、FPS、Androidの画像共有・保存を確認する。
2. 10地点の位置・ヒント・飛行到達性とカードの構図を人が確認する。自動レイキャストは到達体験の保証ではない。
3. 2Dは模式図なので、地図の見た目と操作感を調整する。
4. 魚の目印は今は光る立体。魚を直接タップする演出は未調整。
5. 実機で問題が解消してから本体PRをレビューし、本番へ反映する。

写真モード・朝夕夜・生息水深・場所図鑑は設計メモのみ。営業、協力店、QR、サーバー、ランキング等は実装しない。

## 重要な限界

- Linuxのソフトウェア描画での確認をPixelのFPSと混同しない。
- 2Dカードは10地点の静止画で、2D端末にThree.jsは不要。
- 再読み込み後のカード背景は同じ場所の固定構図になる。ライブ写真そのものの永続保存はない。
- previewと本番が同じoriginなら既存ガチャの保存キーを共有する（パスごとには分離されない）。別originなら図鑑の共有はない。
- hide-v1の地点配列・座標・種は公開後に勝手に変えない。変更は次版として設計する。
