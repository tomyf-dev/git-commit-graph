# git-commit-graph

Git の親子関係を SVG で表示する TypeScript パッケージです。提供する描画 API は、**バニラの DOM API と React アダプターの2つ**です。

| 利用方法 | インポート先 | 実行時依存 |
| --- | --- | --- |
| バニラ JavaScript / TypeScript | `git-commit-graph` | なし |
| React アダプター | `git-commit-graph/react` | 利用側の React |

公開入口は上記の2つです。配置計算の関数や既定パレットの定数は公開しません。ほかのフレームワーク向けの専用アダプターは提供しません。

Git データの取得、ブランチ・タグのラベル、コミットメッセージ列は組み込み側が担当します。グラフはコミットを円、未コミット変更のあるワークツリーを木アイコンの専用行として描画します。クリーンなワークツリーには専用行を追加しません。

## インストール

npm にはまだ公開していません。公開後は次のコマンドで導入できます。

```sh
npm i git-commit-graph
```

React アダプターを使う場合は、利用するアプリに React も必要です。バニラ利用では React は不要です。

## バニラ JavaScript / TypeScript

専用の空のコンテナを用意し、DOM が利用可能になってから生成します。以下の JavaScript は、パッケージの import を解決できるバンドラー環境を想定しています。

```html
<div id="graph"></div>
```

```js
import { createGitCommitGraph } from 'git-commit-graph';

const container = document.querySelector('#graph');
if (!container) throw new Error('描画先が見つかりません');

const props = {
  commits: [
    { id: 'b', parentIds: ['a'] },
    { id: 'a', parentIds: [] },
  ],
  onCommitClick(commit) {
    graph.update({ ...props, selectedCommitId: commit.id });
  },
};
const graph = createGitCommitGraph(container, props);

// データ更新時は props 全体を渡す
// graph.update({ ...props, commits: nextCommits });

// 画面から取り除くときに呼ぶ
// graph.destroy();
```

`update` は部分更新ではなく props 全体の置き換えです。選択は `selectedCommitId` による制御方式です。クリック時は `onCommitClick`、`onWorktreeClick`、`onStashClick` で通知します。`onLayoutChange` と `graph.layout` からメッセージ列に揃えるための行情報を取得できます。

モジュールの import 自体はサーバーでも可能ですが、DOM API による描画はブラウザーで行います。

## React アダプター

```tsx
import { useState } from 'react';
import { GitCommitGraph } from 'git-commit-graph/react';

const commits = [
  { id: 'b', parentIds: ['a'] },
  { id: 'a', parentIds: [] },
];

export function HistoryGraph() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <GitCommitGraph
      commits={commits}
      selectedCommitId={selected}
      onCommitClick={commit => setSelected(commit.id)}
    />
  );
}
```

React では props の変更に応じて更新されます。DOM API の生成・更新・破棄を手動で呼ぶ必要はありません。React アダプターは SVG の SSR にも対応します。

従来の React 利用コードは import 元を `git-commit-graph` から `git-commit-graph/react` に変更してください。

## 入力データと表示ルール

| 入力 | 必須フィールド | 主な任意フィールド |
| --- | --- | --- |
| `commits` | `id`, `parentIds` | メッセージなどは組み込み側で管理 |
| `worktrees` | `id`, `headCommitId` | `label`, `isDirty`, `isDetached`, `changedFileCount` |
| `stashes` | `id`, `baseCommitId` | `label`, `subject`, `body`, `commitId`, `sourceBranch` |

`commits` の配列順が表示順です。子を親より前に置き、`parentIds` は Git の親順序（先頭が first parent）を保持してください。空の履歴や複数のルートも扱えます。ID の重複・空文字、循環、親子の順序違反などはエラーになります。React の更新では入力配列やオブジェクトを直接書き換えず、新しい値を渡してください。

入力にない親は履歴の読み込み境界として点線で表します。入力にない HEAD のワークツリー、保存元が入力にないスタッシュは表示せず、配置結果の `hiddenWorktreeIds`・`hiddenStashIds` に返します。

`worktrees[].isDirty: false` は Changes 行を非表示にします。`true` または省略時は表示します。`layout.primaryWorktreeId` の Changes は最上段、それ以外は HEAD の直前に配置します。`layout.primaryHeadId` は、そのコミットからの first-parent 履歴を左側へ優先配置します。

`layout.primaryWorktreeId` を省略すると、`worktrees` の配列順で `headCommitId` が `layout.primaryHeadId` と一致する最初のワークツリーを自動選択します。そのワークツリーに Changes 行があり、HEAD が入力コミットに含まれていれば最上段に配置します。最初の一致がクリーンでも、後続の変更ありワークツリーを選び直すことはありません。`primaryHeadId` も省略した場合や一致するワークツリーがない場合は、最上段への優先配置は行いません。

スタッシュは通常コミットとは別の `stashes` に渡します。内部の index・未追跡ファイル保存用コミットを、スタッシュ取得のために通常履歴へ追加しないでください。スカッシュや cherry-pick の疑似接続は生成せず、渡された親子関係を描画します。

## 共通オプション

DOM API の `GraphProps` と React の `GitCommitGraphProps` は、次の設定を共有します。

| 設定 | 既定値 | 内容 |
| --- | --- | --- |
| `layout.rowHeight` | `28` | 行高（px） |
| `layout.laneWidth` | `16` | レーン中心の間隔（px） |
| `layout.paddingX` | `12` | 横余白（px） |
| `layout.primaryHeadId` | 指定なし | 左側へ優先配置する履歴の起点 |
| `layout.primaryWorktreeId` | `primaryHeadId` に一致する最初のワークツリー | 最上段へ優先する Changes のワークツリー。一致がなければ優先配置なし |
| `appearance.nodeRadius` | `4` | コミット円の半径（px） |
| `appearance.lineWidth` | `2` | 実線の太さ（px） |
| `appearance.dotDiameter` | `lineWidth` | 点線の点の直径（px） |
| `appearance.cornerRadius` | `2` | 丸角半径の上限（px） |
| `appearance.palette` | 組み込みの6色 | レーンの色配列 |
| `appearance.background` | 指定なし | SVG 背景色 |
| `ariaLabel` | `Git commit graph` | グラフのアクセシブルな名前 |

`className` と `style` も指定できます。DOM API の `style` は CSS プロパティのオブジェクト、React では `React.CSSProperties` です。寸法には有限値を指定してください。ノードや強調リングが収まらない設定はエラーになります。外側の行と揃える場合、CSS で SVG を縮小せず上記の寸法を使ってください。

サンプルは行高32px・レーン幅22px・横余白16px・実線2px・点3px・丸角8pxを明示しています。これらはライブラリの既定値とは異なります。

`selectedCommitId` は外部制御です。`onCommitClick`・`onWorktreeClick`・`onStashClick` を指定したノードはクリックと Enter／Space に対応します。ホバーとキーボードフォーカスは内部で管理します。

## メッセージ列との整列

`onLayoutChange` または DOM API の `graph.layout` から `GraphLayout` を取得できます。

入力・コールバック用の `GitCommit`・`GitWorktree`・`GitStash` と、配置結果の `GraphLayout`・`GraphRow`・`GraphEdge` は、どちらの公開入口からも型としてimportできます。Props型はバニラの `GraphProps`、Reactの `GitCommitGraphProps` を使います。

`layout.rows` はコミット・Changes・スタッシュを含む表示行です。各行の `kind` は `commit`・`worktree`・`stash` で、対応するデータと `rowIndex`・`lane`・`x`・`y`・`color` を持ちます。メッセージ列はコミット配列ではなく、この行配列に合わせてください。全体の `width`・`height`、接続線の `edges`、非表示になったワークツリーとスタッシュの ID も取得できます。

`onLayoutChange` から親の状態を更新する場合、入力配列を不要に作り直すと再計算のループにつながるため、参照を安定させてください。

全行を SVG で描画します。仮想スクロールや増分配置は提供しておらず、履歴を追加・変更した際の既存座標の維持や、接続線の交差ゼロは保証しません。

## 実装と利用例

- 共通描画: `src/render/scene.ts`（React 非依存）
- バニラ DOM API: `src/adapters/vanilla/index.ts`
- React アダプター: `src/adapters/react/GitCommitGraph.tsx`
- 配置・経路・遮蔽計算: `src/core/`
- 共通SVG部品・描画用VNode: `src/render/`
- SVG取り込み: Vite標準の `?raw` import
- アイコンの参照: `src/render/scene.ts` からSVGを直接import
- アイコンの原本: `src/assets/icons/`
- 公開入口・共通Props: `src/index.ts`・`src/adapters/react/index.ts`・`src/types.ts`
- バニラの固定データサンプル: `examples/vanilla/`
- React の固定データサンプル: `examples/react/`
- 両サンプル共通の固定データ: `examples/data/sample.json`

共通描画は `.ts` 内の関数呼び出しで SVG を組み立て、JSX・React には依存しません。`src` 内の `.tsx` は React アダプターだけに置いています。描画に使う木・アーカイブは、生成画像をトレースしたSVGから取り込み、外部通信やアイコンライブラリには依存しません。未使用のブランチ・タグはSVG原本のみ残し、実装には取り込みません。木は通常表示に統一しています。コミットの丸と選択リングも `src/assets/icons/commit.svg`・`selection-ring.svg` で形を管理し、座標・半径・色・線幅は描画時に適用します。円はSVGの `vector-effect="non-scaling-stroke"` により、表示サイズを変えても線幅を維持します。既存どおり、コミットの半径と線幅は `appearance.nodeRadius`・`lineWidth`、色は `appearance.palette` で調整できます。選択リングの線幅は従来の1pxを維持します。

アイコンの制作元画像はローカル専用の `tmp/icons/initial-four.png` に退避し、Git管理には含めません。編集用 SVG は `src/assets/icons/*.svg` に保存しています。SVG は `import svg from "./icon.svg?raw"` で文字列として取り込み、内容を変換せずインラインSVGとして表示します。独自プラグインやSVG変換処理は使いません。生成コマンドや生成済みTSファイルの管理は不要です。`npm run build` でSVGの内容をJavaScriptへ埋め込むため、利用者側のSVGローダーや実行時のファイル取得は不要です。色・サイズ・線幅の適用は描画時に行い、既存のPropsを維持します。元画像・編集用 SVG は開発用で、npm 配布物には含めません。

## 開発

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

`npm run dev` で起動後、表示されたサーバーURLの `/examples/` を開いてください（通常は `http://127.0.0.1:5173/examples/`）。案内ページからバニラ版と React 版へ移動できます。

- `/examples/`: サンプル案内（`examples/index.html`）
- `/examples/vanilla/`: DOM API による生成・更新・選択
- `/examples/react/`: React の props と state による更新・選択

どちらも `examples/data/sample.json` の同じ固定データを使います。Git のインストール、`test-graph`、API 通信は不要です。現在のワークツリー、変更状態、ノード選択を操作できます。`examples/` は npm 配布対象に含めません。

## ローカルの実データによる確認

ローカル Git の状態を JSON に保存すると、両サンプルの「データソース」から選べます。

```sh
npm run capture -- /path/to/test-graph
# → tmp/data/test-graph.json
```

両サンプルから選択するには、保存先をリポジトリ直下の `tmp/data/` 内にし、拡張子を `.json` にします。同名リポジトリを区別したい場合などに使用できます。

```sh
npm run capture -- /path/to/repository tmp/data/my-repo.json
```

固定データの `examples/data/*.json` とローカルデータの `tmp/data/*.json` が選択肢になります。固定の `sample.json` と取得結果は、`commits`・`worktrees`・`stashes`・`primaryWorktreeId`・`primaryHeadId` を持つ同じ形式です。描画寸法は JSON ではなくサンプル側で共通設定しています。

取得処理は Git を読み取るだけです。最新状態が必要なら再実行してください。プレビューは保存したスナップショットを読み込み、Git 取得 API は使用しません。ファイル追加後に選択肢が更新されない場合はページを再読み込みしてください。

`tmp/` は `.gitignore` で除外し、`tmp/`・`examples/` は npm 配布対象外です。ローカルJSONはGit管理外になるよう `tmp/data/` に保存してください。データソースを切り替えると選択・変更状態の上書きをリセットし、選んだ JSON の状態を表示します。

`npm test` と `npm run typecheck` は、公開入口のコード・型を解決できるよう最初に標準ビルドを実行します。描画・操作のテストは公開入口からビルド済みコードを読み込みます。テスト専用のSVGローダーは不要です。通常の検査では回帰テストと、バニラ・React両方の現在ワークツリー／変更状態の全組み合わせ（代表寸法）を検査します。全1,302寸法の大規模検査は `npm run test:matrix` で明示的に実行します。実行時間が長いため、通常検査と分けています。固定JSONによる再現テストは、最新のローカルGitの状態検査とは区別してください。

内部の経路計算は数値データを交差判定へ渡し、公開する `GraphEdge.path` には従来どおりSVG文字列を返します。マーカーの寸法・遮蔽・交差保護範囲は一か所で管理しています。npmには `dist` とREADME・ライセンスを配布し、開発用ソースとSVG原本はリポジトリで管理します。

配布用ビルドではソースマップ（`.js.map`・`.d.ts.map`）を生成・同梱しません。実行用JavaScriptと型定義（`.d.ts`）は配布するため、描画・操作とTypeScriptの型補完は利用できます。

このリポジトリで `npm pack` を実行すると、`.npmrc` の `pack-destination=tmp/packages` により、圧縮パッケージは `tmp/packages/` に保存されます。出力先オプションの指定は不要です。`npm pack --dry-run` は配布内容の確認だけを行い、圧縮パッケージを作りません。
