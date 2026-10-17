# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## À quoi sert Folder Nodes ?
Folder Nodes associe un dossier Obsidian à une note Markdown portant le même nom. Par exemple, le dossier A et la note A/A.md forment un nœud complet. Si l’un des éléments manque, le plugin indique « Incomplet » ; il ne crée ni ne déplace de fichiers sans votre action.

L’explorateur de fichiers d’Obsidian reste en place. Le plugin ajoute une barre latérale pour consulter le contenu des nœuds, un Node Graph, des icônes et le tri manuel des nœuds frères.

## Installation
Obsidian 1.12.7 ou version ultérieure est nécessaire. Dans « Paramètres → Modules communautaires → Parcourir », recherchez Folder Nodes, installez-le et activez-le. Vous pouvez aussi récupérer les fichiers main.js, manifest.json et styles.css d’une même version dans les [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases), puis les placer dans Vault/.obsidian/plugins/folder-nodes/. Conservez data.json lors des mises à jour.

Le plugin fonctionne sur ordinateur et Android. Sur Android, les déplacements passent par des menus plutôt que par le glisser-déposer de bureau. Les appareils Android physiques et iOS ne font pas partie des essais d’acceptation officiels.

## Premiers pas
1. Sauvegardez votre coffre, puis ouvrez les réglages « Général » et « Gestion » de Folder Nodes.
2. Vérifiez que le dossier A contient A/A.md. Si un élément manque, créez-le volontairement ou marquez-le « Non géré ».
3. Utilisez « Nouveau nœud » pour créer le dossier et sa note ensemble. Cliquez sur le nom du dossier pour ouvrir la note de nœud. « Contenu du nœud » permet de parcourir les enfants, les images, les vidéos et les autres fichiers.
4. Ouvrez Node Graph. Le mode « Global » montre tous les nœuds gérés ; « Sous-arbre » montre le nœud choisi et ses descendants ; « Local » montre son entourage. Vous pouvez passer de 2D à 3D et afficher les liens entre notes.

## Icônes et création
La propriété icon de la note de nœud accepte, par ordre de priorité, des images du coffre, des icônes Lucide, des caractères et des émojis. color: colore les caractères ou les icônes Lucide, ou définit une couleur de secours. Prévisualisez l’effet dans les paramètres.

Lorsqu’un nœud est créé depuis du texte sélectionné, vous pouvez vérifier son nom, son emplacement et ses alias. Les liens internes encore inexistants peuvent aussi créer des nœuds dans la partie gérée. Une sélection qui traverse plusieurs cellules d’un tableau Markdown est refusée pour préserver ce tableau.

## Masquer ou ne pas gérer
**Masquer** : hidden=true dans la propriété folder-nodes cache le nœud et ses descendants uniquement dans les vues Folder Nodes de l’explorateur, du contenu et de Node Graph. La recherche Obsidian et l’ouverture directe continuent de fonctionner. **Non géré** : Folder Nodes n’effectue plus d’opérations de structure sur ces éléments, mais ne les masque ni ne les supprime.

« Renommer le fichier » agit sur un seul fichier ou dossier ; les commandes visant le « nœud contenant » agissent sur le nœud entier. L’organisation par lots et la migration de propriétés montrent une prévisualisation avant écriture ; le bilan de santé reste en lecture seule. Les conflits arrêtent l’opération. La suppression d’un nœud complet utilise la corbeille système d’Obsidian.

## Limites et confidentialité
L’identité d’un nœud repose sur son chemin actuel dans le coffre, et non sur un identifiant permanent. Folder Nodes ne téléverse pas le contenu des notes et n’effectue pas de requêtes réseau. Le changement de langue ne modifie ni les notes ni leurs propriétés.

Consultez le [guide anglais complet](../../README.md) ou le [guide chinois](README.zh-CN.md) pour plus de détails. Signalez les problèmes sur [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues).
