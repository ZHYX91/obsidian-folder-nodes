# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## 画面例

ノードの内容、標準ファイルエクスプローラー、Node Graph、アイコン設定、選択テキストからの作成画面を紹介します。

![Node contents](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

![File Explorer](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

![Node Graph](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-graph-en.png)

![Icons](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-settings-icons-en.png)

![Node creation](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-creation-en.png)

## 機能

Folder Nodes は、Obsidian のフォルダーと同名の Markdown ノートを組み合わせて扱うプラグインです。たとえばフォルダー A とノート A/A.md で 1 つの完全なノードになります。どちらかが欠けている場合は「未完成」と表示され、自動でファイルを作成したり移動したりしません。

Obsidian のファイルエクスプローラーはそのまま使えます。ノードの内容を一覧表示するサイドバー、Node Graph、アイコン、並び替えなどが追加されます。

完全なノードは作成、名前変更、移動、統合、並べ替え、削除ができます。ファイルエクスプローラーは Obsidian 標準のままです。「ノードの内容」には子ノード、静止画像のアルバム、その他のファイルが別々に表示されます。GIF は静止サムネイルで、動画や音声の埋め込み再生はありません。Node Graph はフォルダー階層を維持し、必要に応じてノート間のリンクを重ねて表示します。

## 動作環境と互換性

Obsidian 1.12.7 以降が必要です。「設定 → コミュニティプラグイン → 閲覧」で Folder Nodes を検索し、インストールして有効にしてください。または [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases) の同じバージョンに含まれる main.js、manifest.json、styles.css を Vault/.obsidian/plugins/folder-nodes/ に配置します。更新時は設定を保存した data.json を残してください。
デスクトップと Android に対応しています。Android の移動操作にはメニューを使います。Android 実機および iOS は正式な実機検証の対象外です。

## インストール

Obsidian 1.12.7 以降が必要です。「設定 → コミュニティプラグイン → 閲覧」で Folder Nodes を検索し、インストールして有効にしてください。または [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases) の同じバージョンに含まれる main.js、manifest.json、styles.css を Vault/.obsidian/plugins/folder-nodes/ に配置します。更新時は設定を保存した data.json を残してください。

## 使い方

1. 先に Vault をバックアップし、Folder Nodes の「一般」と「管理」を確認します。
2. フォルダー A に A/A.md があるか確認します。欠けている部分は必要に応じて作成するか、「管理対象外」に設定します。
3. 「新しいノード」でフォルダーとノートの組を作成します。フォルダー名をクリックするとノードノートを開き、「ノードの内容」で下位ノード、画像、動画、その他のファイルを確認できます。
4. Node Graph を開きます。「全体」はすべての管理対象ノード、「下位ツリー」は選択ノードとその子孫、「周辺」は親や近くのリンクを表示します。2D／3D とリンクの表示を切り替えられます。

## 設定

**一般**：表示言語、非表示ノード、ホームページ。**管理**：管理対象外ルール、一括整理、プロパティ移行、読み取り専用の状態チェック。**アイコンと外観**：継承、表示位置、絵文字フォント。**選択と命名**：作成確認、別名、接頭辞と接尾辞。**Node Graph**：次元、方向、大きなグラフの表示性能。表示言語の変更でノートは書き換えられません。

## Folder Nodes プロパティ

```yaml
folder-nodes:
  - order=manual
  - rank=1024
  - hidden=true
```

ノードノートの `folder-nodes` というテキストリストで、`order=manual` は子ノードの手動順、`rank=N` は保存された順番、`hidden=true` は当該ノードと管理対象の子孫を非表示にします。初期値は記録不要で、値がなくなるとプロパティも削除されます。旧フィールド `folderNodeChildrenSort`、`folderNodeSiblingRank`、`folderNodeHidden` は引き続き読み取れます。起動時に自動移行されません。すべての端末を更新し、「管理」で変更をプレビューしてから確認してください。

## icon プロパティ

ノードノートの icon プロパティには、Vault 内の画像、Lucide アイコン、1 文字、絵文字を優先順で指定できます。color: で文字や Lucide アイコンを着色し、他の候補が使えない場合の代替色にもできます。設定画面では結果をプレビューできます。

選択テキストから新しいノードを作るときは、名前、作成先、別名を確認できます。管理対象内では未作成の内部リンクからもノードを作成できます。Markdown テーブルの複数セルにまたがる選択は安全のため拒否されます。

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

## 制限事項

ノードは現在の Vault パスで識別され、固定 ID はありません。A/A.md の代わりに README.md、index.md、_A.md を使うことはできません。名前や frontmatter の競合があれば統合を停止します。リモート画像、PDF や動画のサムネイル、HEIC/HEIF プレビュー、動画・音声の埋め込み再生には対応しません。Android にはデスクトップ式のドラッグ操作がありません。大きなグラフは Canvas 表示になっても階層は省略しません。

## プライバシーと安全性

**非表示**：folder-nodes プロパティの hidden=true は、Folder Nodes のファイルエクスプローラー表示、ノードの内容、Node Graph だけでノードと子孫を隠します。Obsidian の検索や直接アクセスは使えます。**管理対象外**：そのファイルやフォルダーにノード構造の操作をしない設定です。隠したり削除したりするものではありません。

「ファイル名を変更」は 1 件のファイルまたはフォルダーを変更します。「所属ノード」の操作はノード全体に適用されます。一括整理と古いプロパティの移行は変更前にプレビューを表示し、状態チェックは読み取り専用です。競合がある場合は自動的に統合しません。削除には Obsidian のシステムゴミ箱を使います。

Vault の内容はローカルで処理し、アップロードやネットワーク要求は行いません。一括整理とプロパティ移行は変更内容を先に表示し、競合時には停止します。完全なノードの削除には Obsidian のシステムゴミ箱を使います。明示的にコピーしたときだけクリップボードにリンクを書き込み、クリップボードを読み取ることはありません。設定と管理対象外ルールは data.json に保存されます。

## 開発

開発には Node.js 24.19.0 と npm 11.17.0 を使用します。実行するコマンドは次のとおりです。詳細な設計資料は英語版と簡体字中国語版を参照してください。

```bash
npm ci
npm run check
npm run release:check
```

## サポート

質問は [Q&A](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/q-a)、提案は [Ideas](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/ideas)、不具合は [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose) へ。報告にはバージョン、OS、再現手順を含め、個人の Vault パスやノート本文を除いてください。

## ライセンス

[MIT](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/LICENSE) © ZhengYX
