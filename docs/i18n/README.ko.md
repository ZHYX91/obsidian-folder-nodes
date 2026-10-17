# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## Folder Nodes란?
Folder Nodes는 Obsidian 폴더와 같은 이름의 Markdown 노트를 하나의 노드로 다룹니다. 예를 들어 A 폴더와 A/A.md 노트가 있으면 완전한 노드입니다. 어느 한쪽이 없으면 '미완성'으로 표시하고, 플러그인이 임의로 파일을 만들거나 옮기지 않습니다.

Obsidian의 기본 파일 탐색기는 그대로 사용합니다. 여기에 노드 콘텐츠 사이드바, Node Graph, 아이콘과 같은 수준 노드 정렬 기능이 추가됩니다.

## 설치
Obsidian 1.12.7 이상이 필요합니다. '설정 → 커뮤니티 플러그인 → 찾아보기'에서 Folder Nodes를 검색해 설치하고 활성화하세요. 또는 [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases)에서 동일한 버전의 main.js, manifest.json, styles.css를 받아 Vault/.obsidian/plugins/folder-nodes/에 넣으세요. 업데이트할 때는 설정 파일 data.json을 유지해야 합니다.

데스크톱과 Android에서 사용할 수 있습니다. Android에서는 데스크톱 드래그 앤 드롭 대신 메뉴로 폴더를 이동합니다. Android 실기기와 iOS는 정식 호스트 검증 범위에 포함되지 않습니다.

## 빠른 시작
1. Vault를 백업한 뒤 Folder Nodes의 '일반' 및 '관리' 설정을 확인하세요.
2. A 폴더 안에 A/A.md 노트가 있는지 확인하세요. 없으면 필요한 파일을 직접 만들거나 '관리 제외'로 지정하세요.
3. '새 노드'로 폴더와 노트를 함께 만드세요. 폴더 이름을 누르면 노드 노트를 열 수 있고, '노드 콘텐츠'에서 하위 노드, 사진, 동영상, 일반 파일을 볼 수 있습니다.
4. Node Graph를 여세요. '전체'는 모든 관리 대상 노드, '하위 트리'는 선택한 노드와 자손, '주변'은 부모와 가까운 연결을 보여 줍니다. 2D/3D를 전환하거나 노트 간 링크를 표시할 수 있습니다.

## 아이콘과 새 노드
노드 노트의 icon 속성에는 Vault 이미지, Lucide 아이콘, 문자, 이모지를 우선순위대로 적을 수 있습니다. color:는 문자/Lucide에 색을 적용하고, 다른 아이콘을 표시할 수 없을 때 예비 색상으로 사용됩니다. 설정에서 먼저 미리 볼 수 있습니다.

선택한 문구로 노드를 만들 때는 이름, 위치, 별칭을 확인할 수 있습니다. 관리 대상 안의 아직 없는 내부 링크를 눌러 만들 수도 있습니다. Markdown 표에서 여러 셀에 걸친 선택은 표를 보호하기 위해 거부됩니다.

## 숨김과 관리 제외
**숨김**: folder-nodes 속성에 hidden=true가 있으면 Folder Nodes의 파일 탐색기, 노드 콘텐츠, Node Graph에서 노드와 하위 항목만 숨깁니다. Obsidian 검색이나 직접 열기는 그대로 가능합니다. **관리 제외**: 해당 파일/폴더에는 노드 구조 작업을 하지 않습니다. 파일을 숨기거나 삭제하지 않습니다.

'파일 이름 변경'은 파일이나 폴더 하나만 바꿉니다. '현재 노트가 속한 노드' 작업은 노드 전체에 적용됩니다. 일괄 정리와 기존 속성 이전은 변경 전 미리 보기를 제공하며, 상태 검사는 읽기 전용입니다. 충돌이 발생하면 임의로 처리하지 않습니다. 완전한 노드 삭제에는 Obsidian의 시스템 휴지통을 사용합니다.

## 제한과 개인정보
노드는 현재 Vault 경로로 구분하며 영구 ID를 만들지 않습니다. Folder Nodes는 Vault 데이터를 업로드하거나 네트워크 요청을 보내지 않습니다. 인터페이스 언어를 바꿔도 노트, 파일 이름, 속성은 바뀌지 않습니다.

더 자세한 사용법은 [영어 전체 설명서](../../README.md) 또는 [중국어 간체 설명서](README.zh-CN.md)를 참고하세요. 문제는 [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues)에 알려 주세요。
