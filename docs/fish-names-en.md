# 駿河湾深海生物24種 英語名裏取り結果（fish-names-en）

- 対象: `app/data/fish.json` の24種（name_ja / scientific_name）
- 目的: 「深海ガチャ × お店めぐり」英語版の `name_en` 投入用
- 方針: FishBase / WoRMS / ITIS / FAO / GBIF / IUCN / 水族館・博物館等の公開ソースで実在が確認できた英語名のみ採用。定訳が確認できない種は **no established common name** とし、学名をフォールバックとする（造語・直訳はしない）。
- 結果サマリ: **英語名が裏取りできた種 = 22種** / **定訳なし（未解決）= 2種**（f14 ミノエビ、f16 オオコシオリエビ）。fish.jsonで学名が null だった8種は全て同定を試み、8種とも学名候補を特定（うち f14 は旧文献との相違につき要確認フラグ付き）。

| id | 和名 | 学名（確定分のみ） | English common name | 出典URL | 備考 |
|---|---|---|---|---|---|
| f01 | タカアシガニ | Macrocheira kaempferi | Japanese spider crab | https://en.wikipedia.org/wiki/Japanese_spider_crab | "Japanese giant spider crab" 表記もあり |
| f02 | メンダコ | Opisthoteuthis depressa | Japanese pancake devilfish | https://www.sealifebase.ca/summary/Opisthoteuthis-depressa | SeaLifeBase名。Wikipediaは新属名 Exsuperoteuthis depressa で "Japanese flapjack octopus" を使用（WoRMS 2024年に属分割）。fish.jsonの学名は旧属名のまま |
| f03 | サクラエビ | Lucensosergia lucens | Sakura shrimp | https://www.gbif.org/species/165405988 | GBIFに英語名 "Sakura shrimp" 登録あり。旧学名 Sergia lucens |
| f04 | キンメダイ | Beryx splendens | Splendid alfonsino | https://www.fishbase.se/country/CountryCheckList.php?c_code=152 | FishBase各国チェックリスト共通名 |
| f05 | アカムツ | Doederleinia berycoides | Blackthroat seaperch | https://www.fishbase.se/comnames/4599 | FishBase共通名リスト。豪州では "Rosy seabass" も使われる |
| f06 | アカザエビ | Metanephrops japonicus | Japanese lobster | https://hfpappexternal.fda.gov/scripts/fdcc/index.cfm?set=SeafoodList&id=Metanephrops_japonicus&sort=MARKET_NAME&order=asc&startrow=1&type=basic&search=lobster | 米FDA Seafood List の Common Name。ITISも "Japanese lobster" |
| f07 | ラブカ | Chlamydoselachus anguineus | Frilled shark | https://www.fishbase.se/country/CountryCheckList.php?c_code=152 | FishBaseチェックリスト |
| f08 | ヌタウナギ | Eptatretus burgeri | Inshore hagfish | http://setouchijapan.com/seto-sea-fish.htm | FishBase連携の瀬戸内魚類リスト。EOL/Wikipediaとも一致 |
| f09 | オオグソクムシ | Bathynomus doederleini | Giant isopod | https://en.wikipedia.org/wiki/Giant_marine_isopod | ※種固有の定訳はなく、属（Bathynomus属）全体の通称が本種にもそのまま使われている。JAZA英語ストックリストでも本種＝"Giant Isopod"。沖縄美ら海水族館英語ガイドでは "Doederlein's giant isopod" 表記（https://www.inaturalist.org/guides/22885）。種を区別したい場合は後者が望ましい |
| f10 | アオメエソ | Chlorophthalmus albatrossis | Albatross greeneye | http://publication.plazi.org/GgServer/html/1577035E8045FFE6EDFCCC6F1D4B0DDF | Zootaxa系チェックリストの名称。異称: "Big-eyed greeneye"（FDA/EOL）、"bigeyed greeneye"（NOAA紀要 https://spo.nmfs.noaa.gov/content/descriptions-post-settlement-juveniles-3-greeneye-species-chlorophthalmus-nigromarginatus-c ）。採用名は要統一 |
| f11 | ニギス | Glossanodon semifasciatus | Deep-sea smelt | https://www.fishbase.se/country/CountryChecklist.php?c_code=392&vhabitat=saltwater&csub_code=&cpresence=reported | FishBase日本チェックリスト。"Deepsea smelt" 表記もあり |
| f12 | ユメカサゴ | Helicolenus hilgendorfii | Hilgendorf's saucord | https://en.wikipedia.org/wiki/Helicolenus_hilgendorfii | FishBase名を引くWikipedia記事。Nausicaa水族館の種ページでも使用 |
| f13 | アブラボウズ | Erilepis zonifer | Skilfish | https://www.frontiersin.org/articles/10.3389/fmars.2018.00098 | FishBase準拠の深海漁業レビュー表。FishBase日本チェックリストでも "Skilfish" |
| f14 | ミノエビ | Heterocarpus hayashii（要確認） | no established common name | https://collections.museumsvictoria.com.au/specimens/1778978 | 学名は市場魚貝類図鑑・foodslink（BISMaL準拠）等の現行日本語資料では H. hayashii Crosnier, 1988。ただしコトバンク/ブリタニカは旧来の H. sibogae を充てており（現行では H. sibogae はアカモンミノエビ）、**同定は現行コンセンサス採用だが公開前にBISMaLで最終確認推奨**。英語名は Museums Victoria 標本記録でも汎称 "shrimp" のみで、種固有の定訳なし（属の通称は nylon shrimps） |
| f15 | ボタンエビ | Pandalus nipponensis | Botan shrimp | https://www.itis.gov/servlet/SingleRpt/RefRpt?search_topic=Scientific_Author&search_value=%28Yokoya%2C+1933%29 | ITIS: "Pandalus nipponensis Yokoya, 1933 – valid – botan shrimp"。FAO種カタログも "Botan shrimp"（https://www.fao.org/docrep/pdf/009/ac477e/ac477e22.pdf ）。学名同定: アクアマリンふくしま種ページ（https://www.aquamarine.or.jp/animals/botanebi/ ）・消費者庁魚介類名称ガイドライン。注意: 市場名「ボタンエビ」にはトヤマエビ等の近縁種が混在するが、標準和名ボタンエビ＝本種 |
| f16 | オオコシオリエビ | Cervimunida princeps | no established common name | https://www.aquamarine.or.jp/animals/ookoshioriebi/ | 学名同定: アクアマリンふくしま（fish.json出典と同館）・市場魚貝類図鑑。WoRMSでは現在 Grimothea princeps として再分類（https://en.wikipedia.org/wiki/Grimothea_princeps ）。英語名は汎称 "squat lobster" のみで種固有の定訳なし |
| f17 | ミドリフサアンコウ | Chaunax abei | Sea toad | https://www.tokyo-zoo.net/kasai/encyclopedia/sea-toad/index.html | 学名同定: 鳥羽水族館（https://aquarium.co.jp/picturebook/chaunax-abei.html ）・アクアマリンふくしま・市場魚貝類図鑑で Chaunax abei Le Danois, 1978 と一致。英名 "Sea Toad" は葛西臨海水族園の英名欄およびNCBI Taxonomyの本種 common name。ただしフサアンコウ科全体の通称でもあり、種固有の英名は他に確認できず |
| f18 | アカグツ | Halieutaea stellata | Starry handfish | https://www.marinepia.or.jp/picturebook/fish/entry-12108.html | マリンピア日本海の英名欄。アクアマリンふくしまは "Red batfish"（https://www.aquamarine.or.jp/animals/redbatfish/ ）。学名同定: 両館・市場魚貝類図鑑で Halieutaea stellata (Vahl, 1797) と一致。採用名は要統一 |
| f19 | トウジン | Caelorinchus japonicus | Japanese grenadier | https://diving.tank.jp/sports/fish/4actinopterygii/2neopterygii/17tara/4sokodara/menu.htm | 学名同定: Wikipedia日本語版・コトバンク・講談社ゲンダイ記事（戸田特集）。FishBaseでは属名綴りが Coelorinchus japonicus。地方名ゲホウ |
| f20 | エゾイバラガニ | Paralomis multispina | Oregon hair crab | https://en.wikipedia.org/wiki/Paralomis_multispina | 学名同定: BISMaL（海洋研究開発機構）経由のタラバガニ科一覧で Paralomis multispina (Benedict, 1895)＝エゾイバラガニ。英語名は英語版Wikipedia（出典付き） |
| f21 | ハダカイワシ | Diaphus watasei | Watase's lanternfish | https://www.iucnredlist.org/species/130286787/130414240 | IUCNレッドリスト名。Museums Victoria標本記録でも "Preferred Common name: Watase's Lanternfish" |
| f22 | ホウライエソ | Chauliodus sloani | Sloane's viperfish | https://species.biodiversitydata.se/species/5203203 | GBIF連携のスウェーデン生物多様性基盤。FishBase/Fishes of Australiaとも一致 |
| f23 | アカギンザメ | Hydrolagus mitsukurii | Mitsukuri's chimaera | https://species.biodiversitydata.se/species/5215460 | 学名同定: 市場魚貝類図鑑（https://www.zukan-bouz.com/syu/%E3%82%A2%E3%82%AB%E3%82%AE%E3%83%B3%E3%82%B6%E3%83%A1 ）・水産研究・教育機構リストで Hydrolagus mitsukurii (Jordan & Snyder, 1904)。英名はIUCN名 "Mitsukuri's Chimaera" を採用。FishBaseは汎称寄りの "Spookfish" を使用（https://fishbase.se/country/CountryChecklist.php?c_code=410&resultPage=5 ） |
| f24 | キアンコウ | Lophius litulon | Yellow goosefish | https://www.fishbase.se/Country/CountryChecklist.php?showAll=yes&c_code=156A&vhabitat=deepwater | FishBase台湾深海魚チェックリスト |

## 未解決・注意点まとめ

- **英語名が未解決（定訳なし）: 2種** — f14 ミノエビ、f16 オオコシオリエビ。英語版では学名表示がフォールバック。
- **汎称をそのまま使う種: 2種** — f09 オオグソクムシ（"Giant isopod" は属全体の通称）、f17 ミドリフサアンコウ（"Sea toad" は科全体の通称）。表示上の誤認リスクは低いが、図鑑の精度表記としては備考参照。
- **異称があり統一が必要な種: 3種** — f10（Albatross / Big-eyed）、f18（Starry handfish / Red batfish）、f23（Mitsukuri's chimaera / Spookfish）。表では第一候補を採用名とした。
- **学名の要確認: 1種** — f14 ミノエビ（旧文献 H. sibogae との相違。BISMaLでの最終確認推奨）。
- **分類変更の注記: 2種** — f02 メンダコ（Exsuperoteuthis への属分割）、f16 オオコシオリエビ（Grimothea への再分類）。fish.json の学名更新は別途判断。
