# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

이 문서는 자주 쓰는 기능과 안전상 주의할 점을 간략히 설명합니다. 자세한 내용은 [영문 안내](../../README.md) 또는 [중국어 간체 안내](README.zh-CN.md)를 참고하세요.

## 화면 예시

노드 콘텐츠, 기본 파일 탐색기, Node Graph, 아이콘 설정, 선택한 문구로 노드를 만드는 화면을 보여 줍니다.

![하위 노드와 미디어가 보이는 노드 콘텐츠 사이드바](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

![Obsidian 파일 탐색기와 노드 상태 표시](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

![폴더 계층을 나타내는 Node Graph](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-graph-en.png)

![노드 아이콘 및 모양 설정](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-settings-icons-en.png)

![선택한 텍스트에서 노드 만들기](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-creation-en.png)

## 주요 기능

Folder Nodes는 Obsidian 폴더와 같은 이름의 Markdown 노트를 하나의 노드로 다룹니다. 예를 들어 A 폴더와 A/A.md 노트가 있으면 완전한 노드입니다. 어느 한쪽이 없으면 '미완성'으로 표시하고, 플러그인이 임의로 파일을 만들거나 옮기지 않습니다.

Obsidian의 기본 파일 탐색기는 그대로 사용합니다. 여기에 노드 콘텐츠 사이드바, Node Graph, 아이콘과 같은 수준 노드 정렬 기능이 추가됩니다.

완전한 노드는 만들기, 이름 바꾸기, 이동, 병합, 정렬 및 삭제가 가능합니다. Obsidian의 기존 파일 탐색기는 그대로 사용합니다. 노드 콘텐츠는 하위 노드, 사진 앨범, 일반 파일을 구분해 보여 줍니다. GIF는 정지 미리 보기로 표시하고 동영상·오디오를 내부에서 재생하지 않습니다. Node Graph는 폴더 계층을 보존하며 노트 간 링크를 따로 표시할 수 있습니다.

## 요구 사항과 호환성

Obsidian 1.12.7 이상이 필요합니다.

데스크톱과 Android에서 사용할 수 있습니다. Android에서는 데스크톱 드래그 앤 드롭 대신 메뉴로 폴더를 이동합니다. Android 실기기와 iOS는 정식 호스트 검증 범위에 포함되지 않습니다.

## 설치

'설정 → 커뮤니티 플러그인 → 찾아보기'에서 Folder Nodes를 검색해 설치하고 활성화하세요. 목록에 없다면 [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases)에서 `folder-nodes-<version>.zip`을 받아 안에 있는 `folder-nodes` 폴더를 `Vault/.obsidian/plugins/`에 압축 해제하세요. ZIP에 플러그인 폴더가 이미 들어 있으므로 `plugins/folder-nodes/` 안에 다시 압축 해제하지 마세요.

같은 버전의 `main.js`, `manifest.json`, `styles.css`를 `Vault/.obsidian/plugins/folder-nodes/`에 직접 넣어도 됩니다. Obsidian을 다시 불러와 활성화하고 서로 다른 버전의 파일을 섞지 마세요. 업데이트할 때는 환경설정과 관리 제외 규칙이 들어 있는 `data.json`을 유지하세요.

## 사용법

1. Vault를 백업한 뒤 Folder Nodes의 '일반' 및 '관리' 설정을 확인하세요.
2. A 폴더 안에 A/A.md 노트가 있는지 확인하세요. 없으면 필요한 파일을 직접 만들거나 '관리 제외'로 지정하세요.
3. '새 노드'로 폴더와 노트를 함께 만드세요. 폴더 이름을 누르면 노드 노트를 열 수 있고, '노드 콘텐츠'에서 하위 노드, 사진, 동영상, 일반 파일을 볼 수 있습니다.
4. Node Graph를 여세요. '전체'는 모든 관리 대상 노드, '하위 트리'는 선택한 노드와 자손, '주변'은 부모와 가까운 연결을 보여 줍니다. 2D/3D를 전환하거나 노트 간 링크를 표시할 수 있습니다.

## 설정

**일반**: 화면 언어, 숨김 표시, 홈페이지. **관리**: 관리 제외 규칙, 일괄 정리, 속성 이전, 읽기 전용 상태 검사. **아이콘과 모양**: 아이콘 상속, 표시 위치, 이모지 글꼴. **선택과 이름**: 만들기 전 확인, 별칭, 이름 규칙. **Node Graph**: 차원, 배치 방향, 큰 그래프 성능. 언어를 바꿔도 노트는 변경되지 않습니다.

## Folder Nodes 속성

```yaml
folder-nodes:
  - order=manual
  - rank=1024
  - hidden=true
```

노드 노트의 `folder-nodes` 텍스트 목록에서 `order=manual`은 자식 노드를 수동으로 정렬하도록 하고, `rank=N`은 정렬 위치를 저장하며, `hidden=true`는 노드와 관리 대상 하위 노드를 숨깁니다. 기본값은 기록하지 않고 값이 없으면 속성을 제거합니다. 예전 `folderNodeChildrenSort`, `folderNodeSiblingRank`, `folderNodeHidden` 필드는 계속 읽지만 시작할 때 자동으로 이전하지 않습니다. 모든 기기를 업데이트하고 '관리'에서 미리 보기를 확인한 뒤 적용하세요.

## icon 속성

노드 노트의 icon 속성에는 Vault 이미지, Lucide 아이콘, 문자, 이모지를 우선순위대로 적을 수 있습니다. color:는 문자/Lucide에 색을 적용하고, 다른 아이콘을 표시할 수 없을 때 예비 색상으로 사용됩니다. 설정에서 먼저 미리 볼 수 있습니다.

선택한 문구로 노드를 만들 때는 이름, 위치, 별칭을 확인할 수 있습니다. 관리 대상 안의 아직 없는 내부 링크를 눌러 만들 수도 있습니다. Markdown 표에서 여러 셀에 걸친 선택은 표를 보호하기 위해 거부됩니다.

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

## 제한 사항

**노드를 병합하기 전에:** 원본·대상 노드 노트와 이동할 모든 Markdown 노트를 저장하고 편집 탭을 닫으세요. 사전 검사는 `../Reference.md` 같은 지원되는 상대 링크의 대상이 달라지거나 구문을 안전하게 확인할 수 없으면 병합을 거부합니다. 대상이 다음 줄에 있는 상대 참조 정의도 포함됩니다. 링크를 자동으로 고쳐 쓰지는 않습니다. 표시된 링크를 수정한 뒤 다시 시도하고, 중요한 노트는 복구 가능한 사본을 보관하며, 성공 후 링크와 첨부파일을 확인하세요.

Folder Nodes는 Vault 데이터를 업로드하거나 네트워크 요청을 보내지 않습니다. 인터페이스 언어를 바꿔도 노트, 파일 이름, 속성은 바뀌지 않습니다.

노드는 현재 Vault 경로로 구별하며 영구 ID는 없습니다. A/A.md 대신 README.md, index.md, _A.md를 쓸 수 없습니다. 경로나 frontmatter 충돌이 있으면 병합을 중단합니다. 원격 이미지, PDF·동영상 썸네일, HEIC/HEIF 미리 보기와 내부 미디어 재생 기능은 없습니다. Android에서는 데스크톱 방식의 드래그 앤 드롭이 지원되지 않습니다. 큰 그래프는 Canvas 렌더링을 사용해도 폴더 계층은 유지합니다.

## 개인정보와 안전

**숨김**: folder-nodes 속성에 hidden=true가 있으면 Folder Nodes의 파일 탐색기, 노드 콘텐츠, Node Graph에서 노드와 하위 항목만 숨깁니다. Obsidian 검색이나 직접 열기는 그대로 가능합니다. **관리 제외**: 해당 파일/폴더에는 노드 구조 작업을 하지 않습니다. 파일을 숨기거나 삭제하지 않습니다.

일반 이동·삭제는 선택한 파일이나 폴더에 적용됩니다. 다만 완전한 노드의 폴더 또는 같은 이름의 노트를 이름 변경하면 충돌이 없는 경우 다른 쪽 이름도 동기화됩니다. '현재 노트가 속한 노드' 작업은 노드 전체에 적용됩니다. 일괄 정리와 기존 속성 이전은 변경 전 미리 보기를 제공하며, 상태 검사는 읽기 전용입니다. 충돌이 발생하면 임의로 처리하지 않습니다. 완전한 노드 삭제는 Obsidian에 설정된 파일 삭제 방식을 따릅니다.

Vault 정보는 로컬에서만 처리하며 외부로 업로드하거나 네트워크 요청을 보내지 않습니다. 일괄 정리와 속성 이전은 변경 내용을 먼저 보여 주고 충돌 시 중단합니다. 완전한 노드 삭제는 Obsidian에 설정된 파일 삭제 방식을 따릅니다. 직접 복사를 누를 때만 링크를 클립보드에 쓰고, 클립보드를 읽지 않습니다. 플러그인 설정과 관리 제외 규칙은 data.json에 저장됩니다.

## 개발

개발에는 Node.js 24.19.0과 npm 11.17.0이 필요합니다. the commands below를 실행하세요. 자세한 설계 문서는 영어나 중국어 간체판에 있습니다.

```bash
npm ci
npm run check
npm run release:check
```

## 지원

질문은 [Q&A](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/q-a), 아이디어는 [Ideas](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/ideas), 버그는 [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose)에 남겨 주세요. 버전, 운영체제, 재현 절차를 적고 개인 Vault 경로나 내용은 제외하세요.

## 라이선스

[MIT](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/LICENSE) © ZhengYX
