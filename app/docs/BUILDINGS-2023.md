# 沼津市2023年度の建物

千本浜・我入道への追加拡張は COAST-EXPANSION.md を参照。以下は駅～港への初回導入時の記録。

建物は公式PLATEAU配信APIの2023年度LOD3に更新。地形・道路・植生・水面は2021年度を継続。
公式カタログ: https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets
配布元: https://www.geospatial.jp/ckan/dataset/plateau-22203-numazu-shi-2023
実際の取得先・年度・仕様はstation-manifest.jsonのsourceMetadataに記録。

同じ対象bboxに交差する147リーフタイルを取得し、25区画・9,002棟・1,123,106三角形へ変換。
建物は48,124,852バイト。2021年度LOD3の28区画・7,061棟・48,371,184バイトとは収録単位・境界が異なるため、増加分が全て新築または新規高精細建物であることを意味しない。
LOD3データセットには高精細範囲以外の建物も入り、全棟の窓・階段が立体的に作り直される保証はない。
画像上限2048px、Meshopt圧縮、同じENU座標・高さ強調と衝突処理を使用。
市役所の自作写真モデルは原本との照合に成功した場合のみ差し替える。

再生成: previewのrealdata-test/build-2023-corridor.mjs。公式カタログから年度・LOD・テクスチャ条件を照合してURLを選ぶ。
生成後station-manifest-2023.jsonをstation-manifest.jsonとして採用し、prepare-app-map.mjsで未参照の旧区画を配信先から除去する。
ビルド時に保存用manifestとService Workerのバージョンが更新される。事前保存を再実行すれば新データを取得し、完了後に旧版キャッシュを削除する。
実機のFPSと発熱はPixel 10 Proで確認が必要。
