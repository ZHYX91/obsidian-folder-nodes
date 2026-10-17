# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## Folder Nodes とは
Folder Nodes は、Obsidian のフォルダーと同名の Markdown ノートを組み合わせて扱うプラグインです。たとえばフォルダー A とノート A/A.md で 1 つの完全なノードになります。どちらかが欠けている場合は「未完成」と表示され、自動でファイルを作成したり移動したりしません。

Obsidian のファイルエクスプローラーはそのまま使えます。ノードの内容を一覧表示するサイドバー、Node Graph、アイコン、並び替えなどが追加されます。

## インストール
Obsidian 1.12.7 以降が必要です。「設定 → コミュニティプラグイン → 閲覧」で Folder Nodes を検索し、インストールして有効にしてください。または [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases) の同じバージョンに含まれる main.js、manifest.json、styles.css を Vault/.obsidian/plugins/folder-nodes/ に配置します。更新時は設定を保存した data.json を残してください。

デスクトップと Android に対応しています。Android の移動操作にはメニューを使います。Android 実機および iOS は正式な実機検証の対象外です。

## はじめに
1. 先に Vault をバックアップし、Folder Nodes の「一般」と「管理」を確認します。
2. フォルダー A に A/A.md があるか確認します。欠けている部分は必要に応じて作成するか、「管理対象外」に設定します。
3. 「新しいノード」でフォルダーとノートの組を作成します。フォルダー名をクリックするとノードノートを開き、「ノードの内容」で下位ノード、画像、動画、その他のファイルを確認できます。
4. Node Graph を開きます。「全体」はすべての管理対象ノード、「下位ツリー」は選択ノードとその子孫、「周辺」は親や近くのリンクを表示します。2D／3D とリンクの表示を切り替えられます。

## アイコンとノード作成
ノードノートの icon プロパティには、Vault 内の画像、Lucide アイコン、1 文字、絵文字を優先順で指定できます。color: で文字や Lucide アイコンを着色し、他の候補が使えない場合の代替色にもできます。設定画面では結果をプレビューできます。

選択テキストから新しいノードを作るときは、名前、作成先、別名を確認できます。管理対象内では未作成の内部リンクからもノードを作成できます。Markdown テーブルの複数セルにまたがる選択は安全のため拒否されます。

## 非表示と管理対象外
**非表示**：folder-nodes プロパティの hidden=true は、Folder Nodes のファイルエクスプローラー表示、ノードの内容、Node Graph だけでノードと子孫を隠します。Obsidian の検索や直接アクセスは使えます。**管理対象外**：そのファイルやフォルダーにノード構造の操作をしない設定です。隠したり削除したりするものではありません。

「ファイル名を変更」は 1 件のファイルまたはフォルダーを変更します。「所属ノード」の操作はノード全体に適用されます。一括整理と古いプロパティの移行は変更前にプレビューを表示し、状態チェックは読み取り専用です。競合がある場合は自動的に統合しません。削除には Obsidian のシステムゴミ箱を使います。

## 制限とプライバシー
ノードの識別には現在の Vault パスを使用し、固定 ID は作成しません。Folder Nodes は Vault の内容をアップロードせず、ネットワーク要求も行いません。表示言語を変更してもノート、ファイル名、プロパティは変わりません。

さらに詳しい説明は [英語版の詳細ガイド](../../README.md) と [簡体字中国語版](README.zh-CN.md) を参照してください。問題は [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues) に報告できます。
