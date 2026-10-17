# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## Folder Nodes dùng để làm gì?
Folder Nodes kết hợp thư mục Obsidian với ghi chú Markdown cùng tên. Ví dụ, thư mục A và ghi chú A/A.md tạo thành một nút hoàn chỉnh. Nếu thiếu một phần, plugin sẽ báo “Chưa hoàn chỉnh”, chứ không tự ý tạo hoặc di chuyển tệp.

Trình duyệt tệp gốc của Obsidian vẫn được giữ nguyên. Plugin bổ sung thanh bên nội dung nút, Node Graph, biểu tượng và chức năng sắp xếp thủ công các nút cùng cấp.

## Cài đặt
Bạn cần Obsidian 1.12.7 trở lên. Mở “Cài đặt → Plugin cộng đồng → Duyệt”, tìm Folder Nodes, cài đặt và bật plugin. Bạn cũng có thể lấy main.js, manifest.json và styles.css từ cùng một phiên bản tại [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases), rồi đặt vào Vault/.obsidian/plugins/folder-nodes/. Khi cập nhật, hãy giữ data.json để bảo toàn cài đặt.

Plugin hỗ trợ máy tính và Android. Trên Android, việc di chuyển thư mục dùng menu thay cho thao tác kéo thả trên máy tính. Thiết bị Android thực và iOS chưa nằm trong phạm vi nghiệm thu chính thức.

## Bắt đầu
1. Sao lưu kho ghi chú trước, rồi xem mục “Chung” và “Quản lý” trong cài đặt Folder Nodes.
2. Kiểm tra thư mục A có ghi chú A/A.md hay chưa. Nếu thiếu, bạn có thể chủ động tạo phần còn thiếu hoặc đặt thành “Không được quản lý”.
3. Chọn “Nút mới” để tạo thư mục cùng ghi chú. Nhấp tên thư mục để mở ghi chú nút. Trong “Nội dung nút”, bạn có thể xem nút con, ảnh, video và các tệp khác.
4. Mở Node Graph. “Toàn cục” hiển thị tất cả nút được quản lý, “Cây con” hiển thị nút đã chọn và các nút con, còn “Cục bộ” cho thấy khu vực lân cận. Có thể chuyển 2D/3D và bật liên kết giữa các ghi chú.

## Biểu tượng và tạo nút
Thuộc tính icon của ghi chú nút chấp nhận hình ảnh trong kho, biểu tượng Lucide, một ký tự hoặc emoji theo thứ tự ưu tiên. color: dùng để tô màu chữ/Lucide hoặc làm màu dự phòng. Hãy xem trước trong cài đặt trước khi lưu.

Khi tạo nút từ văn bản đã chọn, hãy kiểm tra tên, nơi tạo và bí danh. Trong phạm vi quản lý, bạn cũng có thể tạo nút từ liên kết nội bộ chưa tồn tại. Vùng chọn đi qua nhiều ô trong bảng Markdown sẽ bị từ chối để tránh làm hỏng bảng.

## Ẩn và không quản lý
**Ẩn**: hidden=true trong thuộc tính folder-nodes chỉ ẩn nút và các nút con trong các giao diện của Folder Nodes: trình duyệt tệp, nội dung nút và Node Graph. Tìm kiếm hay mở trực tiếp bằng Obsidian vẫn hoạt động. **Không quản lý**: Folder Nodes không thực hiện thao tác thay đổi cấu trúc trên các tệp hoặc thư mục này, nhưng không ẩn hay xóa chúng.

“Đổi tên tệp” chỉ tác động một tệp hoặc thư mục; thao tác với “nút chứa ghi chú” ảnh hưởng toàn bộ nút. Sắp xếp hàng loạt và chuyển đổi thuộc tính đều cho xem trước trước khi ghi, còn kiểm tra trạng thái chỉ đọc. Nếu gặp xung đột, plugin dừng thay vì tự đoán cách giải quyết. Xóa nút hoàn chỉnh sẽ dùng thùng rác hệ thống của Obsidian.

## Giới hạn và quyền riêng tư
Nút được xác định bằng đường dẫn hiện tại trong kho ghi chú, không có mã ID vĩnh viễn. Folder Nodes không tải nội dung kho lên mạng hoặc thực hiện yêu cầu mạng. Đổi ngôn ngữ giao diện không làm thay đổi ghi chú, tên tệp hay thuộc tính.

Hướng dẫn đầy đủ hơn có trong [tài liệu tiếng Anh](../../README.md) và [tài liệu tiếng Trung](README.zh-CN.md). Hãy báo lỗi qua [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues).
