# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## Folder Nodes 能做什麼？
Folder Nodes 讓 Obsidian 資料夾擁有自己的筆記。資料夾 A 和同名筆記 A/A.md 組成一個完整節點；如果少了其中一項，介面會標示為「不完整」，不會擅自建立或移動檔案。

你仍使用 Obsidian 原生檔案列表。Folder Nodes 額外提供節點內容側欄、Node Graph 節點圖譜、圖示、同層排序，以及明確的節點管理操作。

## 安裝與相容性
需要 Obsidian 1.12.7 或更新版本。可在「設定 → 第三方外掛 → 瀏覽」搜尋 Folder Nodes 安裝；也能從 [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases) 下載同一版本的安裝檔，解壓到 Vault/.obsidian/plugins/folder-nodes/。不要混用不同版本的 main.js、manifest.json、styles.css。升級時保留 data.json。

桌面版和 Android 版可使用；Android 上的移動操作採用原生選單，不依賴桌面拖放。Android 實體裝置及 iOS 尚未列入專案的正式宿主驗收範圍。

## 第一次使用
1. 先備份 Vault，再開啟 Folder Nodes 的「一般」和「管理」設定。
2. 找一個資料夾，例如 A，確認裡面有同名筆記 A/A.md。沒有就會顯示「不完整」，可自行建立缺少的部分，或設為「不管理」。
3. 使用「新增節點」建立完整節點；點選資料夾可開啟節點筆記，在「節點內容」查看子節點、圖片、影片和其他檔案。
4. 開啟 Node Graph：「全域」看整個結構、「子樹」看所選節點以下的內容、「局部」看所選節點周圍。可切換 2D／3D，或顯示筆記之間的連結。

## 圖示與命名
在節點筆記的 icon 屬性中可依序放入 Vault 內圖片、Lucide 圖示、單一字元或 Emoji。color: 可替文字圖示上色，其他候選都無法顯示時可作為備用色標。你也可以在設定中預覽，不必直接修改原始屬性。

從選取文字建立節點時，可先檢查名稱、位置和別名。點選尚不存在的內部連結，也能在受管理範圍內建立節點。跨越 Markdown 表格多個儲存格的選取範圍會被拒絕，避免破壞表格。

## 隱藏、不管理與安全操作
**隱藏**：節點的 folder-nodes 屬性含 hidden=true 時，Folder Nodes 會在檔案列表、節點內容和 Node Graph 隱藏該節點及其下級；Obsidian 搜尋、連結和直接開啟仍正常。**不管理**：Folder Nodes 不對這些檔案或資料夾執行節點結構操作，但內容仍可存取；這不等於刪除或隱藏。

一般「重新命名檔案」只操作單一檔案；明確標示「所在節點」的操作會影響整個節點。大量整理和舊屬性遷移會先顯示預覽；「健康檢查」只讀，不會修改筆記。有衝突時停止，不會猜測如何合併。刪除完整節點時使用 Obsidian 的系統回收站。

## 限制、隱私與說明
節點以目前的 Vault 路徑識別，不會替每個節點建立永久 ID。Folder Nodes 不會上傳 Vault 內容，也不會發出網路請求。切換界面語言不會改變筆記內容、檔名或節點屬性。

詳細功能、屬性範例和疑難排解請參閱 [英文完整指南](../../README.md) 或 [簡體中文完整指南](README.zh-CN.md)。問題與建議請使用 [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues)。
