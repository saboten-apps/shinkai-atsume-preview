# 港周辺のLOD比較

`lod-comparison.html` は2021年度の建築物LOD2とLOD3の比較専用入口。
同じカメラ、照明、高さ補正なしで切り替える。LOD3ボタンを押すまでLOD3を取得しない。
ゲーム本編の街は変更していない。2つのLODは収録対象と分割が異なり、個別建物の同一IDによる比較ではない。

出典: https://www.geospatial.jp/ckan/dataset/plateau-22203-numazu-shi-2021
原本: realdata-test/zip-index.json に記録された公開ZIP（previewリポジトリ）。
港bbox: 西138.855、南35.080、東138.862、北35.085と交差するタイル。
LOD3復元: previewのextract-entry.mjsでlod3-tiles.jsonの52件を取得し、convert-bldg-tex.mjsでUVと画像を保持して変換、gltfpack -ccで形状圧縮。画像は再圧縮しない。

| | LOD2 | LOD3 |
|---|---:|---:|
|配信バイト数|3,669,944|6,383,384|
|三角形|59,112|68,172|
|画像|37|49|

LOD3は全面差し替え前の評価用。2023年度版は未取得・未評価。
Pixel 10 ProのFPS・温度は実機で確認が必要。画面表示の読込秒数はネットワークと画像デコードを含む経過時間で、性能保証値ではない。
