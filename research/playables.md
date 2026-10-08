# RYOSEIWORLD を YouTube Playables / Google Playground に出す調査

調査日: 2026-10-08。公式ドキュメント（developers.google.com/youtube/gaming/playables 以下）とニュース記事を出典として確認した内容のみを書く。わからないことは「未確認」と書く。

## 1. YouTube Playables

### 出せるか
開発者向けの提供は「early access（先行アクセス）」の段階。個人か会社かを問う記載はなく、興味がある開発者・会社は「Playables interest form」というGoogleフォームから申し込む形になっている。
- 出典: https://developers.google.com/youtube/gaming/playables
- 出典: https://developers.google.com/youtube/gaming/playables/support/contact

個人開発者が実際に通るかどうか、日本から申し込めるか、審査にかかる期間、費用（開発者側の費用）は、公式ページに記載がなく**未確認**。フォーム送信後の個別審査で決まると見られる。

### 技術要件（SDK）
出典: https://developers.google.com/youtube/gaming/playables/reference/sdk
- SDKはゲームのコードより前に読み込む。
- `firstFrameReady()` → ローディング/スプラッシュ画面を表示した時点で呼ぶ。
- `gameReady()` → ユーザーが操作できる状態（メインメニュー等）になった時だけ呼ぶ。非操作の画面が出ている間に呼ぶと審査（certification）に落ちる。
- `saveData(data: string)`: Promise<void>。UTF-16として妥当な文字列、**3MiB以下**。
- `loadData()`: Promise<string>。失敗時は `ytgame.SdkError` でreject。
- クラウドセーブ運用上の規則: `loadData` の完了を待ってから `saveData` を呼ぶ（読み込み未完了での保存は拒否され、既存データの上書き事故を防ぐ仕組み）。重要な進行（レベル変更等）のタイミングで保存、節目での自動保存が推奨。
- `sendScore()` で送るスコアはセーブデータ内の最高スコアと一致させる必要がある。
- 一時停止: `onPause` が来たらゲームループ・音楽・入力・**ネットワーク通信**・描画を全部止める。再開は `onResume` のみ。Page Visibility APIなどの類似Web APIは使ってはいけない。
- 音声: システムの音量設定・YouTube側のミュートボタンを尊重（`isAudioEnabled`/`onAudioEnabledChange`）。YouTube側でミュートの時は一切音を出してはいけない。ゲーム内に全体ミュートボタンを置くのは非推奨（YouTube側の機能に任せる）。
- 出典: https://developers.google.com/youtube/gaming/playables/certification/requirements_integration

### サイズ上限
出典: https://developers.google.com/youtube/gaming/playables/certification/requirements_stability（検索結果の要約。原文未再読のため数値は参考程度）
- 初回ロードまでのバンドルは30MiB未満（理想は15MiB未満）。
- パッケージ総量は250MiB以下（2024年6月に100→250MiBへ緩和）。
- 個別ファイルは30MiB未満（理想512KiB未満、個別ファイルの上限には例外なし）。
- セーブデータは3MiB未満（理想500KiB未満）。
RYOSEIWORLD（単一HTML＋同フォルダPNG、外部通信なし）であれば、画像素材の総量次第だが、一般的なドット絵RPGなら上限に収まりやすい。

### 外部通信・個人情報
出典: https://developers.google.com/youtube/gaming/playables/certification/requirements_privacydata
- 他の技術要件を満たすために必須な場合を除き、外部URL・外部サービスへの通信は禁止（例外はGoogle/YouTube自身のAPIのみ）。
- クリップボードはユーザーの明示的な貼り付け操作がない限りアクセス禁止。
- 氏名・年齢・位置情報・ユーザー名・パスワード等の個人情報の入力要求・収集は禁止。ログイン画面に見えるグラフィックも禁止。
→ RYOSEIWORLDは元から外部通信なし・localStorage保存のみなので、この規定には抵触しない（ただしPlayables版は保存先を `saveData`/`loadData` に差し替える実装変更が必要）。

### 画面・デザイン
出典: https://developers.google.com/youtube/gaming/playables/certification/requirements_design
- デバイスの向き（縦持ち/横持ち）を固定してはいけない。9:16・16:9・1:1・21:9など様々な比率でレスポンシブに動作すること。画面を埋めきれない場合は余白を入れて中央配置。
- ウィンドウのリサイズでゲーム状態・進行度を失ってはいけない。
- 終了ボタンをゲーム内に置いてはいけない（YouTube側のUIが担う）。
- 対応ブラウザの明記は未確認（このページには記載なし）。

→ RYOSEIWORLDは「縦持ちスマホ専用」の前提になっているため、横持ち・正方形・ワイドでも崩れないレスポンシブ対応への改修が要件として必要になる。

### 提出物・年齢区分
タイトル・ジャンル・サムネイル画像・説明文が必須メタデータ（ブランド/ロゴを含めてはいけない）という記載はあったが、年齢区分（レーティング）についての具体的な入力項目は公式ページ内に見つからず**未確認**。別途「Trust & Safety」要件で「13歳以上の一般向けを想定し、kids向け(made for kids)にしてはいけない」という縛りがある（検索要約からの情報、原文未再読）。

### 審査で落ちやすい点（確認できたもの）
- `gameReady()` をローディング中に呼んでしまう（操作不能な状態で呼ぶ）。
- `onPause`/`onResume` を使わずPage Visibility APIなどで代用している。
- YouTube側がミュートの時にも音が出る。
- 画面の向きを固定していて他のアスペクト比で崩れる。
- 既存のPlayablesと「実質的に同一」のアップロード、第三者の知財・商標を侵害している。
- 出典: 各requirements_*ページ（上記リンク群）、https://developers.google.com/youtube/gaming/playables/certification/requirements

## 2. Google Playground（Google Labs の新ツール）

出典（ニュース記事、公式ドキュメントは未確認）: https://www.digitaltoday.co.kr/en/view/112044/google-unveils-playground-to-build-browser-games-with-text-no-coding
- Google Labsが出した実験的ゲーム制作ツール。文章で指示するだけでブラウザゲームが作れ、2D/3D・シングル/マルチプレイヤー対応、PC・モバイルのブラウザで動く。
- 公開範囲: 記事執筆時点で**米国のみ・18歳以上**。招待制かどうかは記事に記載なし＝**未確認**。
- 料金: 探索・プレイは無料。作成には週ごとのトークンが必要で、無料ユーザーは限定、Google One AI加入者は上限が高い。
- 既存HTMLの持ち込み: 記事に記載なし＝**未確認**。対応しているのは「参照用の画像アップロード」をAIが背景・キャラクター等に変換することのみ。
- YouTube Playablesとの連携: 記事では「Googleがゲーム事業をYouTube Playablesなど別の形でも続けている」とだけ触れられ、PlaygroundとPlayablesの直接連携は書かれていない＝**未確認**。
- Unity Spark（記事中は誤記で「Spinnaker」と書いたが正しくは Spark）との連携: 今後統合予定、高品質3D機能やUnityランタイムを使えるようにする計画があると記事にあるが、現状はテスト段階。

**別物として「YouTube Playables Builder」が存在する**（Playgroundとは異なるGoogleのツール）。
出典: https://9to5google.com/2025/12/23/youtube-playables-builder/ ほか複数ニュース記事
- Gemini 3を使い、文章・参考画像・参考動画からゲームを作れるYouTube発のクローズドベータ。
- 現在は招待制（Trusted Tester Opt-In formでの申込み、選ばれたクリエイターのみ）、公開地域は米・英・加・豪が先行。
- 作ったゲームはそのままYouTubeのPlayablesハブに載る。
- 一般公開はされていない＝**未確認（今後公開範囲が広がるかは不明）**。

## 3. 既存キャラ・MOTHER式HPドラムロールの権利リスク

出典: https://developers.google.com/youtube/gaming/playables/certification/requirements_trustsafety
- 規定上は「第三者の知的財産権（商標・著作権）を完全にクリアしていること」「既存のPlayablesと実質的に同一のアップロード禁止」「第三者の商標権・トレードドレス権の侵害禁止」とある。
- 「既存キャラクターに似ている」ことそのものを直接禁止する条文は見当たらないが、赤い帽子・縞シャツのドット絵少年がネス（MOTHER/EarthBound、任天堂のキャラクターデザイン）を強く想起させる場合、著作権（絵柄のコピー）やトレードドレスの侵害と判断されるリスクはある。HPがドラム式に減る「ゲームプレイの仕組み」自体は一般的にアイデア（ルール）であり著作権の対象になりにくいが、キャラクターの見た目の近さは別問題。
- 一言: 権利侵害と判定されると公開不可・削除の対象になりうるため、公開前に配色・帽子の形・縞の入れ方など見た目を変えて「オリジナルの少年」に寄せ直すのが安全。

## 出典一覧
- https://developers.google.com/youtube/gaming/playables
- https://developers.google.com/youtube/gaming/playables/support/contact
- https://developers.google.com/youtube/gaming/playables/reference/sdk
- https://developers.google.com/youtube/gaming/playables/certification/requirements
- https://developers.google.com/youtube/gaming/playables/certification/requirements_integration
- https://developers.google.com/youtube/gaming/playables/certification/requirements_design
- https://developers.google.com/youtube/gaming/playables/certification/requirements_privacydata
- https://developers.google.com/youtube/gaming/playables/certification/requirements_trustsafety
- https://www.pocketgamer.biz/youtube-playables-expands-to-more-than-50-markets-including-the-eu-and-nordics/
- https://www.digitaltoday.co.kr/en/view/112044/google-unveils-playground-to-build-browser-games-with-text-no-coding
- https://9to5google.com/2025/12/23/youtube-playables-builder/
