# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## Screenshots

Die Bilder zeigen Knoteninhalte, den gewohnten Dateiexplorer, den Node Graph, Symboleinstellungen und das Erstellen eines Knotens aus markiertem Text.

![Node contents](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

![File Explorer](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

![Node Graph](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-graph-en.png)

![Icons](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-settings-icons-en.png)

![Node creation](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-creation-en.png)

## Funktionen

Folder Nodes verbindet einen Obsidian-Ordner mit seiner gleichnamigen Markdown-Notiz. Der Ordner A und die Datei A/A.md ergeben einen vollständigen Knoten. Wenn ein Teil fehlt, zeigt das Plugin „Unvollständig“ an, statt Dateien eigenmächtig anzulegen oder zu verschieben.

Der gewohnte Dateiexplorer bleibt erhalten. Hinzu kommen die Seitenleiste mit Knoteninhalten, der Node Graph, Symbole und eine manuelle Sortierung von Knoten derselben Ebene.

Vollständige Knoten lassen sich anlegen, umbenennen, verschieben, zusammenführen, sortieren und löschen. Der normale Obsidian-Dateiexplorer bleibt erhalten. Knoteninhalte werden nach Unterknoten, statischem Medienalbum und anderen Dateien aufgeteilt. GIFs erscheinen als Standbild; Videos und Tonaufnahmen haben keine eingebettete Wiedergabe. Der Node Graph zeigt immer die Ordnerhierarchie und kann zusätzlich Links zwischen Knotennotizen einblenden.

## Voraussetzungen und Kompatibilität

Obsidian 1.12.7 oder neuer ist erforderlich.

Desktop und Android werden unterstützt. Auf Android erfolgt das Verschieben über Menüs statt Desktop-Drag-and-drop. Tests auf echten Android-Geräten und auf iOS gehören nicht zur verbindlichen Abnahme.

## Installation

Öffnen Sie „Einstellungen → Community-Plugins → Durchsuchen“, suchen Sie nach Folder Nodes und installieren und aktivieren Sie das Plugin. Falls es dort nicht verfügbar ist, laden Sie `folder-nodes-<version>.zip` unter [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases) herunter und entpacken den enthaltenen Ordner `folder-nodes` nach `Vault/.obsidian/plugins/`. Das ZIP enthält den Plugin-Ordner bereits; entpacken Sie es nicht in `plugins/folder-nodes/`.

Alternativ legen Sie `main.js`, `manifest.json` und `styles.css` aus derselben Version direkt in `Vault/.obsidian/plugins/folder-nodes/` ab. Laden Sie Obsidian neu und aktivieren Sie das Plugin. Mischen Sie keine Dateien verschiedener Versionen. Bewahren Sie bei Updates `data.json` auf, damit Einstellungen und Ausnahmeregeln erhalten bleiben.

## Verwendung

1. Sichern Sie Ihren Vault und öffnen Sie die Bereiche „Allgemein“ und „Verwaltung“ in den Folder-Nodes-Einstellungen.
2. Prüfen Sie, ob im Ordner A die gleichnamige Notiz A/A.md liegt. Fehlende Bestandteile erstellen Sie bei Bedarf selbst oder markieren den Eintrag als „Nicht verwaltet“.
3. Mit „Neuer Knoten“ erstellen Sie Ordner und Notiz zusammen. Ein Klick auf den Ordnernamen öffnet seine Knotennotiz. Unter „Knoteninhalte“ finden Sie Unterknoten, Bilder, Videos und weitere Dateien.
4. Öffnen Sie den Node Graph: „Global“ zeigt alle verwalteten Knoten, „Unterbaum“ den gewählten Knoten mit Nachkommen und „Lokal“ sein Umfeld. Sie können 2D/3D und die Link-Überlagerung ein- oder ausschalten.

Beim Erstellen eines Knotens aus markiertem Text können Sie Namen, Zielort und Aliase prüfen. Noch nicht angelegte interne Links können im verwalteten Bereich ebenfalls Knoten erzeugen. Eine Auswahl über mehrere Markdown-Tabellenzellen wird zum Schutz der Tabelle abgelehnt.

## Einstellungen

**Allgemein:** Sprache, ausgeblendete Knoten und Startseite. **Verwaltung:** Ausnahmen, Sammelorganisation, Eigenschaftsmigration und schreibgeschützte Zustandsprüfung. **Symbole und Aussehen:** vererbte Symbole, Position und Emoji-Schrift. **Auswahl und Namen:** Bestätigung, Aliase und Benennungsregeln. **Node Graph:** Dimension, Richtung und Darstellung großer Graphen. Ein Sprachwechsel verändert keine Notizen.

## Eigenschaft folder-nodes

```yaml
folder-nodes:
  - order=manual
  - rank=1024
  - hidden=true
```

Die Textliste `folder-nodes` in einer Knotennotiz enthält nur abweichende Einstellungen: `order=manual` schaltet die manuelle Sortierung der Kinder ein, `rank=N` speichert ihre Position und `hidden=true` blendet den Knoten samt verwalteten Nachkommen aus. Standardwerte werden nicht geschrieben; ohne Einträge wird die Eigenschaft entfernt. Die alten Felder `folderNodeChildrenSort`, `folderNodeSiblingRank` und `folderNodeHidden` bleiben lesbar. Es gibt keine automatische Migration beim Start. Aktualisieren Sie alle Geräte und prüfen Sie die Vorschau unter „Verwaltung“, bevor Sie bestätigen.

## Eigenschaft icon

Die Eigenschaft icon einer Knotennotiz akzeptiert Bilder aus dem Vault, Lucide-Symbole, einzelne Zeichen und Emojis in bevorzugter Reihenfolge. Mit color: färben Sie Zeichen oder Lucide-Symbole oder legen eine Ersatzfarbe fest. Im Einstellungsdialog können Sie die Darstellung vorher ansehen.

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

## Einschränkungen

Die Knotenidentität ist der aktuelle Vault-Pfad, keine dauerhafte Kennung. Folder Nodes lädt keine Vault-Inhalte hoch und stellt keine Netzwerkanfragen. Die Spracheinstellung verändert weder Notizen noch Dateinamen oder Knoteneigenschaften.

Die Knotenidentität ist der aktuelle Vault-Pfad, keine permanente ID. Andere Namen wie README.md, index.md oder _A.md können A/A.md nicht ersetzen. Bei Pfad- oder frontmatter-Konflikten wird das Zusammenführen abgebrochen. Keine entfernten Bilder, PDF-/Video-Vorschaubilder, HEIC/HEIF-Vorschau oder eingebaute Medienwiedergabe. Android bietet keine Desktop-Drag-and-drop-Ziele. Große Graphen wechseln zu Canvas; die Hierarchie bleibt vollständig.

## Datenschutz und Sicherheit

**Ausblenden**: hidden=true in der Eigenschaft folder-nodes verbirgt einen Knoten samt Nachkommen nur in den Folder-Nodes-Ansichten Dateiexplorer, Knoteninhalte und Node Graph. Die Obsidian-Suche und direkte Dateizugriffe bleiben möglich. **Nicht verwaltet**: Für diese Dateien und Ordner werden keine strukturellen Knotenaktionen ausgeführt. Das bedeutet weder Löschen noch Ausblenden.

„Datei umbenennen“ betrifft nur eine Datei oder einen Ordner; Aktionen für den „enthaltenden Knoten“ betreffen den ganzen Knoten. Sammelorganisation und Eigenschaftsmigration bieten vor Änderungen eine Vorschau; die Zustandsprüfung ist schreibgeschützt. Bei Konflikten wird die Aktion gestoppt statt geraten. Für vollständige Knoten gilt die in Obsidian gewählte Einstellung zum Löschen von Dateien.

Der Vault wird lokal verarbeitet; das Plugin lädt keine Inhalte hoch und führt keine Netzwerkanfragen aus. Sammelorganisation und Eigenschaftsmigration zeigen Änderungen zuerst an und stoppen bei Konflikten. Für vollständige Knoten gilt die in Obsidian gewählte Einstellung zum Löschen von Dateien. Nur nach ausdrücklichem Kopieren werden Links in die Zwischenablage geschrieben; das Plugin liest sie niemals aus. Einstellungen und Ausnahmeregeln liegen in data.json.

## Entwicklung

Zur Entwicklung werden Node.js 24.19.0 und npm 11.17.0 verwendet. Führen Sie `npm ci`, `npm run check` und `npm run release:check` aus. Ausführliche technische Dokumente stehen auf Englisch und vereinfachtem Chinesisch bereit.

```bash
npm ci
npm run check
npm run release:check
```

## Hilfe

Fragen gehören in [Q&A](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/q-a), Ideen in [Ideas](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/ideas) und Fehler in [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose). Nennen Sie Version, Betriebssystem und reproduzierbare Schritte, aber keine persönlichen Vault-Pfade oder Notizen.

## Lizenz

[MIT](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/LICENSE) © ZhengYX
