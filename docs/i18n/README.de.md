# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## Was macht Folder Nodes?
Folder Nodes verbindet einen Obsidian-Ordner mit seiner gleichnamigen Markdown-Notiz. Der Ordner A und die Datei A/A.md ergeben einen vollständigen Knoten. Wenn ein Teil fehlt, zeigt das Plugin „Unvollständig“ an, statt Dateien eigenmächtig anzulegen oder zu verschieben.

Der gewohnte Dateiexplorer bleibt erhalten. Hinzu kommen die Seitenleiste mit Knoteninhalten, der Node Graph, Symbole und eine manuelle Sortierung von Knoten derselben Ebene.

## Installation
Sie benötigen Obsidian 1.12.7 oder neuer. Öffnen Sie „Einstellungen → Community-Plugins → Durchsuchen“, suchen Sie nach Folder Nodes und aktivieren Sie das Plugin. Alternativ laden Sie eine passende Version unter [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases) herunter und legen main.js, manifest.json und styles.css gemeinsam unter Vault/.obsidian/plugins/folder-nodes/ ab. Bewahren Sie bei Updates die Datei data.json mit Ihren Einstellungen auf.

Desktop und Android werden unterstützt. Auf Android erfolgt das Verschieben über Menüs statt Desktop-Drag-and-drop. Tests auf echten Android-Geräten und auf iOS gehören nicht zur verbindlichen Abnahme.

## Erste Schritte
1. Sichern Sie Ihren Vault und öffnen Sie die Bereiche „Allgemein“ und „Verwaltung“ in den Folder-Nodes-Einstellungen.
2. Prüfen Sie, ob im Ordner A die gleichnamige Notiz A/A.md liegt. Fehlende Bestandteile erstellen Sie bei Bedarf selbst oder markieren den Eintrag als „Nicht verwaltet“.
3. Mit „Neuer Knoten“ erstellen Sie Ordner und Notiz zusammen. Ein Klick auf den Ordnernamen öffnet seine Knotennotiz. Unter „Knoteninhalte“ finden Sie Unterknoten, Bilder, Videos und weitere Dateien.
4. Öffnen Sie den Node Graph: „Global“ zeigt alle verwalteten Knoten, „Unterbaum“ den gewählten Knoten mit Nachkommen und „Lokal“ sein Umfeld. Sie können 2D/3D und die Link-Überlagerung ein- oder ausschalten.

## Symbole und Erstellung
Die Eigenschaft icon einer Knotennotiz akzeptiert Bilder aus dem Vault, Lucide-Symbole, einzelne Zeichen und Emojis in bevorzugter Reihenfolge. Mit color: färben Sie Zeichen oder Lucide-Symbole oder legen eine Ersatzfarbe fest. Im Einstellungsdialog können Sie die Darstellung vorher ansehen.

Beim Erstellen eines Knotens aus markiertem Text können Sie Namen, Zielort und Aliase prüfen. Noch nicht angelegte interne Links können im verwalteten Bereich ebenfalls Knoten erzeugen. Eine Auswahl über mehrere Markdown-Tabellenzellen wird zum Schutz der Tabelle abgelehnt.

## Ausblenden und nicht verwalten
**Ausblenden**: hidden=true in der Eigenschaft folder-nodes verbirgt einen Knoten samt Nachkommen nur in den Folder-Nodes-Ansichten Dateiexplorer, Knoteninhalte und Node Graph. Die Obsidian-Suche und direkte Dateizugriffe bleiben möglich. **Nicht verwaltet**: Für diese Dateien und Ordner werden keine strukturellen Knotenaktionen ausgeführt. Das bedeutet weder Löschen noch Ausblenden.

„Datei umbenennen“ betrifft nur eine Datei oder einen Ordner; Aktionen für den „enthaltenden Knoten“ betreffen den ganzen Knoten. Sammelorganisation und Eigenschaftsmigration bieten vor Änderungen eine Vorschau; die Zustandsprüfung ist schreibgeschützt. Bei Konflikten wird die Aktion gestoppt statt geraten. Vollständige Knoten werden über den Systempapierkorb von Obsidian gelöscht.

## Grenzen und Datenschutz
Die Knotenidentität ist der aktuelle Vault-Pfad, keine dauerhafte Kennung. Folder Nodes lädt keine Vault-Inhalte hoch und stellt keine Netzwerkanfragen. Die Spracheinstellung verändert weder Notizen noch Dateinamen oder Knoteneigenschaften.

Ausführliche Informationen stehen im [englischen Handbuch](../../README.md) und in der [chinesischen Anleitung](README.zh-CN.md). Fehler und Vorschläge können Sie über [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues) melden.
