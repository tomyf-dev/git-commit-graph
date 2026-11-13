# 作業指針

## 構成と変更範囲

- 公開する描画 API は、依存ゼロのバニラ DOM API と任意の React アダプター。共通描画は `src/render/scene.ts`、配置計算は `src/core/` に置く。共通部分へ React・Git・ネットワーク依存を持ち込まない。
- 接続経路は `src/core/routing.ts`、実線・点線の表示設定は `src/core/edge-style.ts`、遮蔽計算は `src/core/occlusion.ts` と `crossings.ts`、SVG出力は `src/render/edges.ts` に分離する。経路計算へ UI 状態やフレームワーク依存を持ち込まない。
- 公開入口は `src/index.ts`（バニラ）と `src/adapters/react/index.ts`（React）の2つとする。coreの関数・定数・計算専用の `GraphOptions` は公開しない。内部のcore参照は各実装・型定義ファイルから直接importし、中継用indexを作らない。Propsと配置結果に必要な型だけを明示的に再exportする。実装は `src/adapters/`、共通SVG描画とVNodeは `src/render/` に置く。SVGは `src/render/scene.ts` から直接 `?raw` importし、中継用の再exportファイルを作らない。
- 共通描画は `.ts` の関数呼び出しで記述し、`src` 内の `.tsx` は `src/adapters/react/` だけに置く。
- バニラと React で配置・SVG・選択やキーボード操作の意味を揃える。修正時は片方だけで確認を終えない。
- 木・アーカイブ・ブランチ・タグ・コミットの丸・選択リングは src/assets/icons/ の SVG を正本とし、Vite標準の `?raw` importで文字列として取り込む。独自SVGプラグイン・変換データ・生成済みTS・テスト専用SVGローダーは追加しない。原本のSVGをそのままインライン表示し、円の線幅は `vector-effect="non-scaling-stroke"` で維持する。変更後はビルドとSVG取り込みテストを確認する。木は通常表示に統一し、外部アイコン素材を追加しない。依頼にないアイコン・色・線幅・寸法などの外観変更を加えない。
- Git管理しない制作資料や一時ファイルは `tmp/`（リポジトリ直下）に置く。アイコンの制作元画像は `tmp/icons/initial-four.png`。実装で使うSVG原本は `src/assets/icons/` に置く。圧縮パッケージは `tmp/packages/` に置く。依存関係の `node_modules/` とビルド出力の `dist/` は通常の配置を維持する。
- 利用者向け説明は README.md に集約する。docs ディレクトリや作業経過の文書を再作成しない。

## サンプルとローカルデータ

- `examples/vanilla/` と `examples/react/` は同じ JSON 形式を使用する。固定データは `examples/data/sample.json`。ローカル Git の取得結果は `tmp/data/*.json` に保存し、両サンプルから選択できるようにする。取得結果はGit と npm の配布対象に含めない。
- サンプルは固定データだけでも動作させる。個人のリポジトリパスやローカル検証ツールを公開サンプルの必須条件にしない。
- Git の取得は `scripts/capture-repository.ts` で読み取りのみ行う。ユーザーが明示的に依頼していない checkout・commit・stash 操作を取得処理に混ぜない。

## 検証と成果物

- 変更に応じて `npm run typecheck`、`npm run build` と関連テストを実行する。`npm test` は通常の回帰検査と両アダプターの状態遷移検査、`npm run test:matrix` は全寸法・全状態行列を実行する。実際に検査した範囲を正確に報告する。
- 描画・操作の変更では、両方の実プレビューも確認する。共通コミットへの複数ワークツリー、データ切り替え、フォーカス中の行の移動・削除に注意する。
- スクリーンショットは `tmp/screenshots/`、検査ログは `tmp/logs/` へ保存し、ソースや配布物へ溜めない。過去の検査結果を現在のコードに対する検証として扱わない。
- 配布設定を変えたら `npm pack --dry-run` で内容を確認する。利用者向け文書・ライセンスと、開発専用データを区別する。

- 経路は数値データで交差判定へ渡し、公開APIの `edge.path` にSVG文字列を返す。SVG文字列を本体で再解析しない。マーカー寸法・遮蔽・交差保護範囲は `src/core/markers.ts` で管理する。

- 描画・操作テストは `npm test` で先にビルドし、公開入口 `git-commit-graph` / `git-commit-graph/react` から配布コードを検査する。配置・経路の単体テストはソースを直接検査できる。
