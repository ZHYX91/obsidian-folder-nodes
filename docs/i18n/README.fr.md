# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## Captures d’écran

Les images présentent le contenu des nœuds, l’explorateur de fichiers, le Node Graph, les réglages des icônes et la création depuis une sélection.

![Node contents](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

![File Explorer](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

![Node Graph](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-graph-en.png)

![Icons](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-settings-icons-en.png)

![Node creation](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-creation-en.png)

## Fonctionnalités

Folder Nodes associe un dossier Obsidian à une note Markdown portant le même nom. Par exemple, le dossier A et la note A/A.md forment un nœud complet. Si l’un des éléments manque, le plugin indique « Incomplet » ; il ne crée ni ne déplace de fichiers sans votre action.

L’explorateur de fichiers d’Obsidian reste en place. Le plugin ajoute une barre latérale pour consulter le contenu des nœuds, un Node Graph, des icônes et le tri manuel des nœuds frères.

Vous pouvez créer, renommer, déplacer, fusionner, trier ou supprimer un nœud complet. L’explorateur habituel d’Obsidian reste en place. Le contenu d’un nœud présente séparément les enfants, un album d’images fixes et les autres fichiers. Les GIF ont une miniature fixe ; aucune lecture intégrée des vidéos ou de l’audio. Le Node Graph conserve la hiérarchie des dossiers et permet d’afficher les liens entre notes en complément.

## Configuration et compatibilité

Obsidian 1.12.7 ou version ultérieure est nécessaire. Dans « Paramètres → Modules communautaires → Parcourir », recherchez Folder Nodes, installez-le et activez-le. Vous pouvez aussi récupérer les fichiers main.js, manifest.json et styles.css d’une même version dans les [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases), puis les placer dans Vault/.obsidian/plugins/folder-nodes/. Conservez data.json lors des mises à jour.
Le plugin fonctionne sur ordinateur et Android. Sur Android, les déplacements passent par des menus plutôt que par le glisser-déposer de bureau. Les appareils Android physiques et iOS ne font pas partie des essais d’acceptation officiels.

## Installation

Obsidian 1.12.7 ou version ultérieure est nécessaire. Dans « Paramètres → Modules communautaires → Parcourir », recherchez Folder Nodes, installez-le et activez-le. Vous pouvez aussi récupérer les fichiers main.js, manifest.json et styles.css d’une même version dans les [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases), puis les placer dans Vault/.obsidian/plugins/folder-nodes/. Conservez data.json lors des mises à jour.

## Utilisation

1. Sauvegardez votre coffre, puis ouvrez les réglages « Général » et « Gestion » de Folder Nodes.
2. Vérifiez que le dossier A contient A/A.md. Si un élément manque, créez-le volontairement ou marquez-le « Non géré ».
3. Utilisez « Nouveau nœud » pour créer le dossier et sa note ensemble. Cliquez sur le nom du dossier pour ouvrir la note de nœud. « Contenu du nœud » permet de parcourir les enfants, les images, les vidéos et les autres fichiers.
4. Ouvrez Node Graph. Le mode « Global » montre tous les nœuds gérés ; « Sous-arbre » montre le nœud choisi et ses descendants ; « Local » montre son entourage. Vous pouvez passer de 2D à 3D et afficher les liens entre notes.

Lorsqu’un nœud est créé depuis du texte sélectionné, vous pouvez vérifier son nom, son emplacement et ses alias. Les liens internes encore inexistants peuvent aussi créer des nœuds dans la partie gérée. Une sélection qui traverse plusieurs cellules d’un tableau Markdown est refusée pour préserver ce tableau.

## Paramètres

**Général** : langue, masquage et page d’accueil. **Gestion** : règles d’exclusion, rangement groupé, migration des propriétés et contrôle en lecture seule. **Icônes et apparence** : héritage, position, police des émojis. **Sélection et noms** : confirmation, alias et règles de nommage. **Node Graph** : dimension, orientation et performance. Changer la langue ne modifie pas les notes.

## Propriété folder-nodes

```yaml
folder-nodes:
  - order=manual
  - rank=1024
  - hidden=true
```

La liste de textes `folder-nodes` dans la note d’un nœud contient les réglages particuliers : `order=manual` active le tri manuel des enfants, `rank=N` enregistre une position, et `hidden=true` masque le nœud et ses descendants gérés. Les valeurs par défaut ne sont pas écrites ; la propriété disparaît si la liste est vide. Les anciens champs `folderNodeChildrenSort`, `folderNodeSiblingRank` et `folderNodeHidden` restent lisibles. Aucune migration automatique au démarrage : mettez d’abord le plugin à jour sur tous les appareils, puis vérifiez l’aperçu dans « Gestion » avant de confirmer.

## Propriété icon

La propriété icon de la note de nœud accepte, par ordre de priorité, des images du coffre, des icônes Lucide, des caractères et des émojis. color: colore les caractères ou les icônes Lucide, ou définit une couleur de secours. Prévisualisez l’effet dans les paramètres.

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

## Limites

L’identité d’un nœud dépend de son chemin actuel dans le coffre, pas d’un identifiant permanent. README.md, index.md ou _A.md ne remplacent pas A/A.md. Une fusion s’arrête en cas de conflit de chemin ou de frontmatter. Pas d’images distantes, de miniatures PDF/vidéo, d’aperçu HEIC/HEIF ni de lecteur multimédia intégré. Le glisser-déposer de bureau n’est pas disponible sur Android. Un grand graphe utilise Canvas sans perdre la hiérarchie.

## Confidentialité et sécurité

**Masquer** : hidden=true dans la propriété folder-nodes cache le nœud et ses descendants uniquement dans les vues Folder Nodes de l’explorateur, du contenu et de Node Graph. La recherche Obsidian et l’ouverture directe continuent de fonctionner. **Non géré** : Folder Nodes n’effectue plus d’opérations de structure sur ces éléments, mais ne les masque ni ne les supprime.

« Renommer le fichier » agit sur un seul fichier ou dossier ; les commandes visant le « nœud contenant » agissent sur le nœud entier. L’organisation par lots et la migration de propriétés montrent une prévisualisation avant écriture ; le bilan de santé reste en lecture seule. Les conflits arrêtent l’opération. La suppression d’un nœud complet utilise la corbeille système d’Obsidian.

Le traitement reste local : le plugin ne téléverse pas vos notes et n’envoie aucune requête réseau. Les opérations groupées et les migrations montrent les modifications avant écriture et s’arrêtent en cas de conflit. La suppression d’un nœud complet utilise la corbeille système d’Obsidian. Le plugin écrit un lien dans le presse-papiers uniquement lorsque vous demandez une copie ; il ne lit jamais le presse-papiers. Les réglages et exclusions sont conservés dans data.json.

## Développement

Le développement nécessite Node.js 24.19.0 et npm 11.17.0. Exécutez `npm ci`, `npm run check` et `npm run release:check`. La documentation technique détaillée est disponible en anglais et en chinois simplifié.

```bash
npm ci
npm run check
npm run release:check
```

## Assistance

Pour les questions : [Q&A](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/q-a). Pour les idées : [Ideas](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/ideas). Pour les erreurs : [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose). Indiquez les versions, le système et la procédure de reproduction, sans publier vos chemins privés ni vos notes.

## Licence

[MIT](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/LICENSE) © ZhengYX
