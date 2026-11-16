# 外部AI実装の取り込みと公開前レビュー（2026-11-16）

## 受領したもの

共有Driveの「深海あつめ 段階1〜3＋全区画展開 差分ZIP.zip」を取得。
基準コミットa98085d。ZIPは107ファイル、展開時26,324,827バイト。
元ZIPと変更前一式は `/workspace/shared/downloads/shinkai-stage1-3.zip`、`/workspace/shared/stage1-3-import/` に保存。
`PUBLISH-HANDOVER.md` は提供元の記録。本書の取り込み後の結果と区別する。
段階1/2/全区画のAGY-REPORTファイルはZIPに含まれていない。

## 今回入った機能

- 管理用の建物選択。原本ID、緯度経度、年度を表示・コピー。
- 全56区画、20,522棟のsidecar。管理モードで必要な区画だけ取得。
- 公開修正台帳と配信版の管理、原本へのフォールバック。
- びゅうおの写真を使った軽量モデル、衝突、水路通過、近景切替・解放。
- びゅうおの写真は2ファイルから5種類のテクスチャを切り出す。写真5ファイルを配信しているわけではない。

## 公開前に修正した問題

1. **無根拠の解体表示を除外**。station-5-2の試作削除には「現地確認済み」と書かれていたが根拠は未確認。公開台帳・manifestから除外し、一般建物と元の区画GLBを保持。削除用GLBも配信しない。
2. **近隣建物を誤削除した港GLBを再生成**。提供物のAABB除去は、びゅうお以外の `bldg_a74878d3-e3ec-4e66-9ca6-d8f47ca75d88` も消していた。previewの `convert-bldg-tex.mjs` に `EXCLUDE_GML_IDS` を追加し、原本の_BATCHID→gml_idで対象1692三角形だけ除去。残る建物レコード527。UV・写真は原本から保持し2048px上限・Meshoptで再圧縮。
3. **二重の面除去を停止**。再生成済み区画を読み込んだ後、ランタイムで同じAABB除去を再実行しない。
4. **通常探索のsidecar依存を解消**。びゅうお置換は管理用JSONなしでも表示。事前保存対象からsidecarを除外してもモデルが欠けない。
5. **解放中の非同期読み込みを中止**。選択データはアンロード後に遅れて復活しない。重複取得も抑制。
6. **配信版不一致のフォールバック**。sourceVersionに加えreleaseId、個別overrideの原本版、schemaを確認。
7. **preview同期を修正**。prepare-app-mapが56sidecar、公開台帳、release-manifest、置換GLBを保持する。従来版はこれらを削除していた。
8. **内部情報をGit管理から除外**。内部台帳はgitignore、公開可能な雛形のみ管理。取り込み元の架空の連絡先・現地調査文・同意文を公開コピーに含めない。
9. **検証スクリプトを移植**。他VM固有のChromium・Playwrightパスを除去。建物カードが出ない場合も成功としていたUI確認を修正し、実タップ・コピーを必須にした。

## 検証

- npm test: 79/79成功。追加3件は版不一致／試作解体の非配信、sidecarなしの置換と近隣形状保持、解放後の遅延応答。
- npm run build成功。大きい3Dチャンク警告は遅延ロード対象。
- validate-building-overrides: schemaと漏洩の否定例を含め成功。
- check-building-selection: 10棟の屋根・壁、再読込、近隣判別、管理UI、ドラッグ、実タップでカード表示、クリップボード確認成功。
- check-sampling-rollout: 5区画・15棟の選択情報照合成功。全20,522棟の実タップを保証するものではない。
- check-building-override: 港の原本と置換GLBで、レイが当たる523棟の上面差分なし（許容0.15m）、原本への切替成功。全頂点・全材質の一致検証ではない。
- check-byuuo-stage3: 1564三角形、9材質、写真テクスチャ5種、塔・扉の衝突、水路通過、近景/遠景切替・区画解放。管理用sidecarのリクエストがゼロでも成功。
- check-city-hall: 写真・歩行・衝突・解放・スマホ幅確認成功、errorsなし。
- check-exploration: ガチャ→2D→発見→1200×630カード、保存互換、ガチャ/2Dに3D読込なし。
- check-map-download: 中断/再開、全件保存、オフラインで置換GLB・写真・release-manifest取得、削除を確認する。

最終保存対象74アセット、74,010,393バイト、キャッシュ版 `e4ae080145c18dd0`。
公開修正版releaseIdは `release-2026-11-v3-reviewed`。旧 `v2` / `v3` を明示指定した場合は不一致で元データに戻る。通常URLは修正版を使用。

## 残る制限と次作業

- Pixel 10 Proの実機FPS・発熱は未測定。本番mainにはマージしない。
- 近景は写真を参考にした軽量モデル。寸法や未撮影面の忠実な復元ではない。
- sidecarは原本形状の凸包と高さの推定による選択。密集・重なりで曖昧になる場合があり、全棟で厳密な面ID保持ではない。
- buildingKeyは現時点ではgml_idを利用しており、年度をまたぐ独立したID台帳は未実装。
- appearance/addは型に候補としてあるが、汎用の実装完了とは扱わない。今回の公開置換はびゅうお1件。
- 古いremoveBuildingGeometryはテスト用に残るが、任意建物の公開更新には使わない。`regenerate-chunk-override.mjs` は原本ID除外方式に変更済み。新たな対象も近隣差分を確認してから公開する。
- 地域紹介・写真受付フォーム・外部への連絡は未実装／未実施。
- 次のAIは本書を先に読み、旧引継書の「未実装」記述をそのまま現在状態として使わない。

## テスト公開完了

- 正本アプリコード: `98d283ec1f58be8674c9e61761cabedb2cda5962`（codex/daily-explorationへpush済み）。
- preview PR #24: https://github.com/saboten-apps/shinkai-atsume-preview/pull/24 （マージ済み）。
- preview main: `5de93b9fff985ffdddfdc826f0c3b47c95b2ebd4`。
- Actions: https://github.com/saboten-apps/shinkai-atsume-preview/actions/runs/43800680673 （build/deploy成功）。
- 公開URL: https://saboten-apps.github.io/shinkai-atsume-preview/
- 公開ファイルのモデル・写真SHA-256、代表3区画のsidecar、index/Map3DView JS、releaseId、保存版をローカル検証済み成果物と照合してPASS。
- 最終データの事前保存も、新しい置換GLB・写真・manifestのオフライン取得と保存削除まで成功。
- この公開完了追記は文書のみ。previewのUPSTREAMはアプリコード98d283eを参照したままでよい。
