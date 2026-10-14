# frapx 映像書き出し対応 実装仕様（Claude向け）

Oct 10, 2026 · @mark

## 2026-10-10 決定事項（本文より優先）

この仕様書を既存のロードマップと突き合わせた grill で、次のとおり確定した。本文はこの節に合わせて書き換え済みだが、食い違いが残っていればこの節を正とする。

1. **映像書き出しを最優先にする。** FBO プリミティブ（float 形式を含む）は独立したマイルストーンにせず、A4 / B1 / B2 の土台として組み込む。`@frapx/fx-particles` は M2 完了まで凍結する。
2. **マルチパス（B2）は新パッケージ `@frapx/fx-passes` に置く。** 2026-07-12 の判断「`@frapx/fx-canvas` はシングルパスを維持し、宣言的な passes API を持たない」は**維持する**。A1〜A3 は `@frapx/core` のランタイムホストに実装し、fx-canvas と fx-passes の両方から使う。uniform・テクスチャ管理は fx-passes 着手時に core へ移す。
3. **サンプル蓄積（B1）も `@frapx/fx-passes` だけに置く。** fx-passes は1パスでも使える映像制作向けランタイムとする。fx-canvas は Web 背景向けのまま A1〜A4 だけを持つ。
4. **書き出しパッケージは新カテゴリ `tool-*` にする。** ブラウザ用の `@frapx/tool-capture` と Node CLI の `@frapx/tool-render`（コマンド `frapx-render`）に分ける。CLI は Puppeteer ではなく `playwright-core` を使う。mux ライブラリは tool-capture 着手時に選定し、承認を得てから追加する。それまでは依存のない PNG 連番を先に作る。
5. **`clock: "manual"` は完全に決定的にする。** rAF を起動しない。offscreen / hidden / reduced-motion の自動停止をすべて無効にし、`render()` は常に描く。`u_pointer*` と `u_reducedMotion` は 0 に固定する。生成後も `setClock()` で切り替えられる。
6. **固定解像度は `resolution` と `setResolution([w, h] | null)` にする。** `pixelRatio` オプションは作らない（既存の `dpr` と重なる）。固定時の `u_pixelRatio` は「内部幅 ÷ 表示幅」から導出する。
7. **float が使えないときは、既定では警告して rgba8 に落とす。厳密モード（`formatFallback: false`）では `UnsupportedError` にする。** 実際の形式は instance から読める。tool-capture と fx-passes の蓄積は常に厳密モードを使う。float は WebGL2 + `EXT_color_buffer_float` のみ対応する。
8. **SDF は2パッケージに分ける。** `@frapx/glsl-sdf` は 2D・3D の距離関数の部品、`@frapx/glsl-raymarch` はレイマーチのループ・法線・AO・ソフトシャドウ・カメラ（旧案の `glsl-camera` を吸収）。2026-07-12 の判断「`glsl-sdf` は 2D のみ、3D レイマーチは対象外」は**覆す**。

### 2026-10-14 追記（順序変更）

9. **`@frapx/tool-render` を tool-capture の動画対応より先に作る。** 実際の書き出しは PNG 連番 → ffmpeg（ProRes）であり、ブラウザ内の WebCodecs は品質で劣る。長時間レンダをタブ常駐なしで回し、中断から再開できることを優先する。ページ側は tool-capture の `registerRenderTarget(target, { fps, duration, prepare })` で `globalThis.__frapxRender` に登録し、CLI はページ内で `captureSequence` を回してフレームを Node 側へ受け取る。動画エンコードは CLI の `--encode`（PATH 上の ffmpeg）で行い、tool-capture の WebCodecs 対応は 0.3.0 以降に回す。

## 目的と背景

frapx に「オフライン書き出し」と「SDF映像制作」の機能を追加し、3D SDF のレイマーチング作品を高品質な連番・動画として書き出せるようにする。

現在の `@frapx/fx-canvas` は Web サイト背景向けのリアルタイム実行に最適化されている。全画面フラグメントシェーダー、`stop()` / `render()`、`setUniform()`、ピンポンのフィードバックバッファ（`u_previousFrame`）は既にあり、レイマーチングとの相性は良い。

一方で、映像作品に必要な次の4点が欠けている。

- 時刻を外から固定する手段（決定論的なレンダリング）
- DOM に依存しない固定解像度での描画
- 描画結果を確実に取り出すキャプチャ API
- 高精度（float）の蓄積バッファ

本ドキュメントは、これらを含む追加機能の仕様と実装順をまとめたもの。実装担当（Claude Code）はこの仕様に従って作業する。

## 前提と設計方針

既存の利用者（Web 背景用途）に影響を与えず、映像用の機能はすべてオプトインで追加する。

**守るべき方針**

- **fx-canvas の軽量さを維持する。** 書き出し・エンコード・SDF ヘルパーなど重い機能は別パッケージ（`fx-*` / `glsl-*`）に分ける。既存の命名規則（AGENTS.md）に従う。
- **後方互換を保つ。** 既存オプションのデフォルト動作は変えない。新機能は新しいオプションかメソッドとして追加する。
- **エンジン化しない。** シーン・メッシュ・カメラの抽象化は持ち込まない。カメラなどは「標準 uniform 名＋GLSL スニペット」の範囲に留める。
- **WebGL1 フォールバックを壊さない。** float 系の機能は WebGL2 と `EXT_color_buffer_float` の有無を検出する。使えない場合、既定では警告して 8bit に落とし、厳密モードではエラーにする（決定事項 7）。

**着手前に確認すること（2026-10-10 確認済み）**

| 項目 | 結果 |
| --- | --- |
| 描画ループと時計 | `packages/core/src/host.ts` の `RuntimeHost`。rAF の delta（上限 0.1 秒）を `elapsed` に積算する。`render()` は現在の `elapsed` で1回描くだけで、時刻を外から指定する手段はない。offscreen / hidden で停止中は `render()` も何もしない |
| フィードバックの形式 | RGBA / UNSIGNED_BYTE（8bit）固定。`packages/fx-canvas/src/internal/feedback.ts` |
| `preserveDrawingBuffer` | `false` 固定。オプションでは変えられない |
| テスト構成 | 各パッケージで vitest。GPU を使う検証は Playwright E2E（`packages/fx-canvas/e2e`、`workers: 1`、CI は headless Chromium） |

## 優先度A：オフライン書き出しの最低条件

この4機能が揃えば、fx-canvas 単体で決定論的な連番書き出しができる。時計・解像度・キャプチャの本体は `@frapx/core` のランタイムホストに実装し、`@frapx/fx-canvas`（と将来の `@frapx/fx-passes`）から公開する。

### A1. 時間の外部制御

組み込みの `u_time` / `u_delta` を外部から指定できるようにする。

```ts
const fx = createShaderBackground({ target, fragment, clock: "manual" }); // 既定は "realtime"
fx.setTime(seconds);   // u_time を設定。u_delta は前回値との差
fx.render();
fx.setClock("realtime"); // 生成後も切り替えられる
```

- `clock: "manual"` のときは requestAnimationFrame ループを起動しない。
- 同じ時刻・同じ uniform なら同じ画素が出ることを保証する。そのため manual では offscreen / hidden / reduced-motion による自動停止を無効にし、`u_pointer*` と `u_reducedMotion` を 0 に固定する。必要な値は `setUniform()` で明示的に渡す。
- `setTime()` 自体は描画しない。manual の `u_delta` はクランプしない（初回は 0）。
- realtime モード中に `setTime()` を呼んだ場合は、時計のオフセットを更新する（シーク用途）。

### A2. 固定解像度モード

描画解像度を DOM サイズから切り離す。

```ts
const fx = createShaderBackground({ target, fragment, resolution: [3840, 2160] });
fx.setResolution([1920, 1080]); // null で DOM サイズへの追従に戻る
```

- `resolution` 指定時は ResizeObserver による内部解像度の変更を止める。表示は CSS で縮小する（`object-fit: contain`）。
- `u_resolution` は内部解像度、`u_viewportSize` は表示サイズを返す。`u_pixelRatio` は「内部幅 ÷ 表示幅」から導出し、`dpr` / `maxDpr` は無視する。
- `target` なし（オフスクリーン）でも生成できるようにする。このとき `resolution` は必須で、`u_viewportSize` は内部解像度と同じ、`u_pixelRatio` は 1 になる。

### A3. フレームキャプチャ API

描画直後のピクセルを確実に取得する。

```ts
const frame = await fx.captureFrame({ format: "png" });      // Blob
const raw   = await fx.captureFrame({ format: "rgba8" });    // Uint8Array
const hdr   = await fx.captureFrame({ format: "rgba16f" });  // Uint16Array (half) or Float32Array
```

- 描画と読み出しを同一タスク内で行い、`preserveDrawingBuffer` に依存しない。
- `rgba16f` は float レンダーターゲット（A4）から読み出す。非対応環境ではエラーを返す。
- Y 軸の反転を吸収し、上が先頭行の配列を返す。

### A4. float 形式のフィードバックバッファ

```ts
createShaderBackground({ fragment, feedback: { format: "rgba16f" } }); // 既定は "rgba8"
```

- WebGL2 ＋ `EXT_color_buffer_float` で `RGBA16F` を使う。非対応なら、既定では警告を出して `rgba8` に落とす。`formatFallback: false` なら `UnsupportedError` にする。実際に確保された形式は instance から読める。
- float 指定時は、GLSL ES 1.00 のシェーダーでも `webgl2` コンテキストを先に試す（WebGL2 は ES 1.00 を受け付ける）。
- 既存の `feedback: true` は `{ format: "rgba8" }` と同じ意味のまま残す。
- バッファのクリアと、蓄積回数のリセット API（`fx.resetFeedback()`）を追加する。
- 実装の土台として `@frapx/core` に `createRenderTarget`（形式指定と機能検出つき）と ping-pong ヘルパーを追加し、feedback をその上に作り直す。コピー処理は既存の `createBlitter` に統一する。

## 優先度B：品質と制作効率

A の上に積む機能で、映像としての品質と日々の制作速度を決める。B1 と B2 は新パッケージ `@frapx/fx-passes` に実装する（決定事項 2・3）。B3 と B4 は M3 完了後に改めて設計を詰める。

### B1. サンプル蓄積（AA・モーションブラー）

`@frapx/fx-passes` の instance に実装する。fx-canvas には入れない。

```ts
await fx.renderAccumulated({ time: t, samples: 64, shutter: 0.5, fps: 60 });
```

- 1サンプルごとに `u_sampleIndex`、`u_jitter`（サブピクセルのオフセット、-0.5〜0.5）、`u_subframeTime`（シャッター区間内の時刻）を渡して描画し、float バッファ（A4）で平均する。
- ジッタ列は低食い違い列（R2 や Halton など）を使い、決定論的にする。
- 蓄積バッファは float の厳密モードで確保する（8bit に落とさない）。
- 完了後に `captureFrame()` で読み出せる状態にする。

### B2. マルチパス／複数バッファ

Shadertoy の Buffer A〜D 相当。名前付きパスを順に描画し、前段の出力を後段がテクスチャとして参照できる。`@frapx/fx-passes` として実装し、fx-canvas はシングルパスのまま残す。以下の生成関数名は仮で、着手時に決める。

```ts
createPasses({
  passes: [
    { name: "scene", fragment: sceneFrag, format: "rgba16f" },
    { name: "bloom", fragment: bloomFrag, inputs: ["scene"] },
    { name: "final", fragment: finalFrag, inputs: ["scene", "bloom"] },
  ],
});
```

- 1パスだけの構成でも使え、その出力は fx-canvas に同じシェーダーを渡した場合と一致する。
- パスごとに解像度の倍率（`scale: 0.5` など）を指定できる。
- uniform・テクスチャ管理は fx-canvas と共有するため、着手時に `@frapx/core` へ移す。

### B3. シェーダーのホットリロードとエラー表示

- `fx.setFragment(src)`（マルチパス時は `fx.setFragment(name, src)`）で差し替える。
- コンパイルに失敗したら直前の正常なプログラムを維持し、エラー行番号をオーバーレイで表示する（開発時のみ、オプトイン）。
- Vite の HMR と連携するサンプルを `examples/` に追加する。

### B4. 外部タイムラインとの接続

```ts
fx.bindUniforms(source); // source.get(time) が uniform のオブジェクトを返すインターフェース
```

- Theatre.js などのキーフレームツールと薄いアダプタで接続できるようにする。本体は特定ライブラリに依存しない。
- manual クロック時は `setTime()` と同期して値を評価する。

## 優先度C：追加パッケージ

fx-canvas 本体に触れずに並行して作れる。いずれも命名規則（`AGENTS.md`）に従う新パッケージとする。

| パッケージ | 種別 | 内容 | 依存 |
| --- | --- | --- | --- |
| `@frapx/glsl-sdf` | GLSL スニペット | 2D・3D のプリミティブ、smooth union 等のブーリアン、ドメイン操作（repeat / twist / bend） | なし（文字列連結） |
| `@frapx/glsl-raymarch` | GLSL スニペット | 利用者が定義する `frapx_map()` を前提にした描画骨格。レイマーチループ、法線、AO、ソフトシャドウ、`lookAt` からのレイ生成と `u_camPos` / `u_camTarget` / `u_fov` の標準 uniform 規約 | なし（`glsl-sdf` と併用可） |
| `@frapx/tool-capture` | 書き出し道具（ブラウザ） | 連番 PNG の書き出し、WebCodecs による MP4/WebM エンコード、進捗コールバック | fx-canvas の A1〜A3。mux ライブラリは着手時に選定・承認 |
| `@frapx/tool-render` | 書き出し道具（Node CLI） | `playwright-core` でヘッドレスに開き、指定フレーム範囲を書き出す `frapx-render` コマンド | tool-capture |
| 音声入力（置き場所は M4 で決める） | ランタイム機能 | 事前解析した FFT／エンベロープの JSON を受け取り、時刻に対応する値を `u_audio` テクスチャで供給 | A1 |

- `glsl-sdf` / `glsl-raymarch` の関数名は既存の `glsl-noise` と同じ `frapx_` 接頭辞を付ける（`frapx_sdBox` など）。`glsl-raymarch` は `float frapx_map(vec3 p);` を前方宣言し、利用者が定義する。
- `tool-*` は「エフェクトではない書き出し用の道具」を表す新カテゴリ。ブラウザ用と Node 用を分け、ブラウザ利用者に Node 用の依存を入れさせない。
- 音声入力はリアルタイム解析とは別経路にし、オフライン書き出しでも同じ結果になることを優先する。

## 実装順とマイルストーン

マイルストーンごとに PR を分け、各段階で既存の example が動き続けることを確認してから次へ進む。

1. **M1 決定論的レンダリング**：A1（manual クロック）と A2（固定解像度）を core / fx-canvas / react-canvas に入れる。完了条件は、同じ時刻で2回描画した結果が一致すること。
2. **M2 書き出し可能**：A3（captureFrame）と A4（float フィードバック）。core に `createRenderTarget` と ping-pong を追加し、feedback をその上に作り直す。完了条件は、`examples/` の新規サンプルから 4K の PNG 連番を書き出せること。
3. **並行作業（SDF）**：`glsl-sdf` は M1 と同時に着手してよい。続けて `glsl-raymarch`。
4. **書き出し道具**：M2 完了後に `tool-capture`（PNG 連番 → mux の承認後に動画）、続けて `tool-render`。
5. **M3 映像品質**：`@frapx/fx-passes` を新設し、B2（マルチパス）と B1（サンプル蓄積）を実装する。完了条件は、64サンプルのモーションブラー付きフレームをバンディングなしで書き出せること。
6. **M4 制作効率**：B3（ホットリロード）、B4（タイムライン接続）、音声入力。置き場所と API は M3 完了後に改めて決める。
7. **その後**：凍結していた `@frapx/fx-particles` を再開する。

各マイルストーンで CHANGELOG を更新し、RELEASING.md の手順に従ってバージョンを上げる。破壊的変更はないため、いずれもマイナーバージョンでの追加とする。

## 受け入れ基準とテスト方針

すべての変更で `pnpm build`、`pnpm test`、`pnpm typecheck` が通ることを前提とする。

| 対象 | 受け入れ基準 | テスト方法 |
| --- | --- | --- |
| 後方互換 | 既存 example（vite-basic / vite-feedback / vite-react）が変更なしで動く | 既存テスト＋目視 |
| A1 manual クロック | 同じ時刻・uniform で2回描画した画素が完全一致 | ヘッドレスブラウザで2回キャプチャしてハッシュ比較 |
| A2 固定解像度 | 表示サイズを変えても `u_resolution` と出力サイズが不変 | キャンバスのサイズ変更後に captureFrame のサイズを検証 |
| A3 キャプチャ | 上下反転なし、既知のグラデーションシェーダーで期待値と一致 | 四隅のピクセル値を検証 |
| A4 float | 1/1024 単位の加算を1024回蓄積して 1.0 に到達（8bit では到達しない） | WebGL2 環境で数値検証、非対応時は警告とフォールバックを確認 |
| B1 蓄積 | samples=1 の結果が通常の render と一致、ジッタ列が決定論的 | 2回実行してハッシュ比較 |
| B2 マルチパス | fx-passes の1パス構成の出力が、同じシェーダーを渡した fx-canvas と一致 | 画素比較 |

- GPU を使うテストは Playwright で実ブラウザ上で実行する。CI で GPU が使えない場合は SwiftShader 等のソフトウェアレンダラーで動かす。
- 画素の一致比較は、ドライバ差を考慮して許容誤差付きの比較も用意する。

## Claude への作業指示

このドキュメントを読んだら、まず「前提と設計方針」の要調査項目をコードで確認し、結果を報告してから M1 に着手すること。

**進め方**

- 作業前に `AGENTS.md` と `RELEASING.md` を読み、命名規則とリリース手順に従う。
- マイルストーン単位で作業し、1つ終わるごとに変更点・テスト結果・未解決事項を報告して確認を待つ。
- API の名前や引数の形は本ドキュメントを基準とするが、既存コードの流儀と合わない場合は実装前に代案を提示する。
- 公開 API には型定義と JSDoc を付け、`apps/docs` に対応するページを追加する。

**確認が必要なとき**

- 既存 API のデフォルト動作を変えざるを得ないとき
- `@frapx/core` の構造を大きく変える必要があるとき
- 新しい外部依存（npm パッケージ）を追加するとき

**やってはいけないこと**

- 既存オプションの意味や既定値を黙って変更すること
- fx-canvas 本体にエンコーダや SDF ライブラリなどの重い機能を入れること
- テストを通すためだけにテストを削除・緩和すること
- npm への publish やタグ付けなど、リリース操作を確認なしに行うこと
