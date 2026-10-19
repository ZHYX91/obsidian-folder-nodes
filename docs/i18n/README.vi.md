# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## Ảnh minh họa

Ảnh minh họa cho thấy nội dung nút, trình duyệt tệp, Node Graph, phần chỉnh biểu tượng và cách tạo nút từ văn bản đã chọn.

![Node contents](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

![File Explorer](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

![Node Graph](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-graph-en.png)

![Icons](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-settings-icons-en.png)

![Node creation](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-creation-en.png)

## Tính năng

Folder Nodes kết hợp thư mục Obsidian với ghi chú Markdown cùng tên. Ví dụ, thư mục A và ghi chú A/A.md tạo thành một nút hoàn chỉnh. Nếu thiếu một phần, plugin sẽ báo “Chưa hoàn chỉnh”, chứ không tự ý tạo hoặc di chuyển tệp.

Trình duyệt tệp gốc của Obsidian vẫn được giữ nguyên. Plugin bổ sung thanh bên nội dung nút, Node Graph, biểu tượng và chức năng sắp xếp thủ công các nút cùng cấp.

Bạn có thể tạo, đổi tên, di chuyển, hợp nhất, sắp xếp và xóa nút hoàn chỉnh. Trình duyệt tệp gốc của Obsidian không bị thay thế. Nội dung nút chia thành nút con, album ảnh tĩnh và tệp khác. GIF chỉ dùng hình thu nhỏ tĩnh; không có phát video hoặc âm thanh trực tiếp. Node Graph giữ nguyên cây thư mục và có thể hiện thêm liên kết giữa các ghi chú.

## Yêu cầu và tương thích

Cần Obsidian 1.12.7 trở lên.

Plugin hỗ trợ máy tính và Android. Trên Android, việc di chuyển thư mục dùng menu thay cho thao tác kéo thả trên máy tính. Thiết bị Android thực và iOS chưa nằm trong phạm vi nghiệm thu chính thức.

## Cài đặt

Mở “Cài đặt → Plugin cộng đồng → Duyệt”, tìm Folder Nodes rồi cài đặt và bật plugin. Nếu chưa có trong danh mục, tải `folder-nodes-<version>.zip` từ [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases), rồi giải nén thư mục `folder-nodes` vào `Vault/.obsidian/plugins/`. ZIP đã chứa thư mục của plugin; đừng giải nén vào bên trong `plugins/folder-nodes/`.

Bạn cũng có thể đặt `main.js`, `manifest.json` và `styles.css` cùng một phiên bản trực tiếp vào `Vault/.obsidian/plugins/folder-nodes/`. Tải lại Obsidian và bật plugin. Không trộn tệp từ các phiên bản khác nhau. Khi cập nhật, giữ `data.json` để bảo toàn tùy chọn và quy tắc không quản lý.

## Sử dụng

1. Sao lưu kho ghi chú trước, rồi xem mục “Chung” và “Quản lý” trong cài đặt Folder Nodes.
2. Kiểm tra thư mục A có ghi chú A/A.md hay chưa. Nếu thiếu, bạn có thể chủ động tạo phần còn thiếu hoặc đặt thành “Không được quản lý”.
3. Chọn “Nút mới” để tạo thư mục cùng ghi chú. Nhấp tên thư mục để mở ghi chú nút. Trong “Nội dung nút”, bạn có thể xem nút con, ảnh, video và các tệp khác.
4. Mở Node Graph. “Toàn cục” hiển thị tất cả nút được quản lý, “Cây con” hiển thị nút đã chọn và các nút con, còn “Cục bộ” cho thấy khu vực lân cận. Có thể chuyển 2D/3D và bật liên kết giữa các ghi chú.

Khi tạo nút từ văn bản đã chọn, hãy kiểm tra tên, nơi tạo và bí danh. Trong phạm vi quản lý, bạn cũng có thể tạo nút từ liên kết nội bộ chưa tồn tại. Vùng chọn đi qua nhiều ô trong bảng Markdown sẽ bị từ chối để tránh làm hỏng bảng.

## Thiết lập

**Chung**: ngôn ngữ, nút ẩn và trang chủ. **Quản lý**: quy tắc loại trừ, sắp xếp hàng loạt, chuyển đổi thuộc tính và kiểm tra chỉ đọc. **Biểu tượng và giao diện**: kế thừa, vị trí và phông emoji. **Chọn và đặt tên**: xác nhận, bí danh và quy tắc tên. **Node Graph**: số chiều, hướng và hiệu suất. Đổi ngôn ngữ không sửa ghi chú.

## Thuộc tính folder-nodes

```yaml
folder-nodes:
  - order=manual
  - rank=1024
  - hidden=true
```

Danh sách văn bản `folder-nodes` trong ghi chú nút lưu các thiết lập khác mặc định: `order=manual` bật sắp xếp nút con thủ công, `rank=N` lưu vị trí, còn `hidden=true` ẩn nút và các nút con được quản lý. Không ghi giá trị mặc định; danh sách trống thì xóa thuộc tính. Các trường cũ `folderNodeChildrenSort`, `folderNodeSiblingRank` và `folderNodeHidden` vẫn được đọc. Không tự chuyển đổi khi khởi động. Hãy cập nhật mọi thiết bị, xem trước trong mục “Quản lý” rồi mới xác nhận.

## Thuộc tính icon

Thuộc tính icon của ghi chú nút chấp nhận hình ảnh trong kho, biểu tượng Lucide, một ký tự hoặc emoji theo thứ tự ưu tiên. color: dùng để tô màu chữ/Lucide hoặc làm màu dự phòng. Hãy xem trước trong cài đặt trước khi lưu.

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

## Giới hạn

Nút được nhận dạng bằng đường dẫn hiện tại trong kho, không có ID vĩnh viễn. Không thể dùng README.md, index.md hoặc _A.md thay A/A.md. Hợp nhất sẽ dừng nếu đường dẫn hoặc frontmatter xung đột. Không tải ảnh từ mạng, không tạo ảnh thu nhỏ PDF/video, không xem trước HEIC/HEIF hoặc phát đa phương tiện trực tiếp. Android không có kéo thả kiểu máy tính. Sơ đồ lớn dùng Canvas nhưng vẫn giữ đủ cây phân cấp.

## Quyền riêng tư và an toàn

**Ẩn**: hidden=true trong thuộc tính folder-nodes chỉ ẩn nút và các nút con trong các giao diện của Folder Nodes: trình duyệt tệp, nội dung nút và Node Graph. Tìm kiếm hay mở trực tiếp bằng Obsidian vẫn hoạt động. **Không quản lý**: Folder Nodes không thực hiện thao tác thay đổi cấu trúc trên các tệp hoặc thư mục này, nhưng không ẩn hay xóa chúng.

“Đổi tên tệp” chỉ tác động một tệp hoặc thư mục; thao tác với “nút chứa ghi chú” ảnh hưởng toàn bộ nút. Sắp xếp hàng loạt và chuyển đổi thuộc tính đều cho xem trước trước khi ghi, còn kiểm tra trạng thái chỉ đọc. Nếu gặp xung đột, plugin dừng thay vì tự đoán cách giải quyết. Xóa nút hoàn chỉnh sẽ dùng thùng rác hệ thống của Obsidian.

Mọi xử lý đều tại máy: plugin không tải ghi chú lên mạng hay gửi yêu cầu mạng. Sắp xếp hàng loạt và chuyển đổi thuộc tính sẽ cho xem trước, dừng khi có xung đột. Xóa nút hoàn chỉnh dùng thùng rác hệ thống của Obsidian. Chỉ khi bạn chủ động sao chép, liên kết mới được ghi vào bộ nhớ tạm; plugin không bao giờ đọc bộ nhớ tạm. Thiết lập và quy tắc loại trừ được lưu trong data.json.

## Phát triển

Để phát triển, dùng Node.js 24.19.0 và npm 11.17.0. Chạy the commands below. Tài liệu kỹ thuật đầy đủ có bản tiếng Anh và tiếng Trung giản thể.

```bash
npm ci
npm run check
npm run release:check
```

## Hỗ trợ

Câu hỏi: [Q&A](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/q-a). Đề xuất: [Ideas](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/ideas). Báo lỗi: [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose). Hãy ghi phiên bản, hệ điều hành và cách tái hiện, nhưng không đăng đường dẫn hoặc nội dung riêng tư.

## Giấy phép

[MIT](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/LICENSE) © ZhengYX
