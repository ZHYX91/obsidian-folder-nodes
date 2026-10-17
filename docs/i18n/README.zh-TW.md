# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## 畫面預覽

這些畫面分別展示節點內容、Obsidian 檔案列表、節點圖譜、圖示設定，以及從選取文字建立節點。

![Node contents](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

![File Explorer](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

![Node Graph](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-graph-en.png)

![Icons](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-settings-icons-en.png)

![Node creation](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-creation-en.png)

## 功能

Folder Nodes 讓 Obsidian 資料夾擁有自己的筆記。資料夾 A 和同名筆記 A/A.md 組成一個完整節點；如果少了其中一項，介面會標示為「不完整」，不會擅自建立或移動檔案。

你仍使用 Obsidian 原生檔案列表。Folder Nodes 額外提供節點內容側欄、Node Graph 節點圖譜、圖示、同層排序，以及明確的節點管理操作。

完整節點可建立、重新命名、移動、合併、手動排序或刪除。檔案列表仍由 Obsidian 管理；節點內容分區顯示子節點、相簿與一般檔案。GIF 只顯示靜態縮圖，影片和音訊沒有內嵌播放按鈕。圖譜以資料夾層級為基礎，可另外顯示節點筆記之間的連結。

## 系統需求與相容性

Obsidian **1.12.7**+

桌面版和 Android 版可使用；Android 上的移動操作採用原生選單，不依賴桌面拖放。Android 實體裝置及 iOS 尚未列入專案的正式宿主驗收範圍。

## 安裝

需要 Obsidian 1.12.7 或更新版本。可在「設定 → 第三方外掛 → 瀏覽」搜尋 Folder Nodes 安裝；也能從 [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases) 下載同一版本的安裝檔，解壓到 Vault/.obsidian/plugins/folder-nodes/。不要混用不同版本的 main.js、manifest.json、styles.css。升級時保留 data.json。

## 使用方式

1. 先備份 Vault，再開啟 Folder Nodes 的「一般」和「管理」設定。
2. 找一個資料夾，例如 A，確認裡面有同名筆記 A/A.md。沒有就會顯示「不完整」，可自行建立缺少的部分，或設為「不管理」。
3. 使用「新增節點」建立完整節點；點選資料夾可開啟節點筆記，在「節點內容」查看子節點、圖片、影片和其他檔案。
4. 開啟 Node Graph：「全域」看整個結構、「子樹」看所選節點以下的內容、「局部」看所選節點周圍。可切換 2D／3D，或顯示筆記之間的連結。

從選取文字建立節點時，可先檢查名稱、位置和別名。點選尚不存在的內部連結，也能在受管理範圍內建立節點。跨越 Markdown 表格多個儲存格的選取範圍會被拒絕，避免破壞表格。

## 設定

**一般**：介面語言、隱藏節點和首頁。**管理**：不管理規則、批次整理、屬性遷移及唯讀健康檢查。**圖示與外觀**：圖示繼承、顯示位置與 Emoji 字型。**選取範圍與命名**：建立前確認、別名與檔名規則。**節點圖譜**：顯示方向、維度及大型圖譜效能。語言切換不會修改筆記。

## Folder Nodes 屬性

```yaml
folder-nodes:
  - order=manual
  - rank=1024
  - hidden=true
```

在節點筆記的 `folder-nodes` 文字清單中，`order=manual` 表示該節點的下級採手動排序，`rank=N` 是儲存的排序位置，`hidden=true` 則隱藏這個節點及受管理下級。預設值不需要寫入；清單沒有內容時會刪除此屬性。舊的 `folderNodeChildrenSort`、`folderNodeSiblingRank`、`folderNodeHidden` 仍可讀取，但不會在啟動時自動遷移。請先更新所有裝置，再到「管理」預覽遷移結果，確認後才會寫入。

## icon 屬性

在節點筆記的 icon 屬性中可依序放入 Vault 內圖片、Lucide 圖示、單一字元或 Emoji。color: 可替文字圖示上色，其他候選都無法顯示時可作為備用色標。你也可以在設定中預覽，不必直接修改原始屬性。

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

## 限制

節點以目前的 Vault 路徑識別，不會替每個節點建立永久 ID。Folder Nodes 不會上傳 Vault 內容，也不會發出網路請求。切換界面語言不會改變筆記內容、檔名或節點屬性。

節點身分取決於目前的 Vault 路徑，不是永久 ID。不支援用 README.md、index.md 或 _A.md 代替 A/A.md。合併遇到路徑或 frontmatter 衝突會停止；不提供遠端圖片、PDF／影片縮圖、HEIC/HEIF 預覽或內嵌影音播放。Android 沒有桌面 HTML5 拖放；節點內容不是第二個完整檔案總管。大型圖譜會改用 Canvas，完整層級不會被截斷。

## 隱私與安全

**隱藏**：節點的 folder-nodes 屬性含 hidden=true 時，Folder Nodes 會在檔案列表、節點內容和 Node Graph 隱藏該節點及其下級；Obsidian 搜尋、連結和直接開啟仍正常。**不管理**：Folder Nodes 不對這些檔案或資料夾執行節點結構操作，但內容仍可存取；這不等於刪除或隱藏。

一般「重新命名檔案」只操作單一檔案；明確標示「所在節點」的操作會影響整個節點。大量整理和舊屬性遷移會先顯示預覽；「健康檢查」只讀，不會修改筆記。有衝突時停止，不會猜測如何合併。刪除完整節點時使用 Obsidian 的系統回收站。

所有處理都在本機，不會上傳 Vault 內容或主動發送網路請求。批次整理與屬性遷移會先預覽再寫入；衝突時停止。完整節點刪除會使用 Obsidian 系統垃圾桶。只有使用者明確按下複製，才會寫入剪貼簿；插件不會讀取剪貼簿。偏好與不管理規則保存在 data.json；結構屬性仍寫在節點筆記。

## 開發

開發環境需要 Node.js 24.19.0 與 npm 11.17.0。執行 `npm ci`、`npm run check`、`npm run release:check`。完整架構與測試規範請參閱英文或簡體中文專案文件。

```bash
npm ci
npm run check
npm run release:check
```

## 支援

使用與設定問題可到 [Q&A](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/q-a)，建議可到 [Ideas](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/ideas)，錯誤請到 [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose)。回報時請附上版本、作業系統和可重現的範例，移除私人 Vault 路徑與筆記內容。

## 授權

[MIT](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/LICENSE) © ZhengYX
