# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## Capturas de pantalla

Las imágenes muestran el contenido de un nodo, el explorador habitual, Node Graph, los iconos y la creación a partir de texto seleccionado.

![Node contents](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

![File Explorer](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

![Node Graph](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-graph-en.png)

![Icons](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-settings-icons-en.png)

![Node creation](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-creation-en.png)

## Funciones

Folder Nodes une una carpeta de Obsidian con una nota Markdown del mismo nombre. Por ejemplo, la carpeta A y la nota A/A.md forman un nodo completo. Si falta una parte, aparecerá «Incompleto»: el complemento no crea ni mueve archivos por su cuenta.

Seguirás usando el explorador de archivos normal de Obsidian. Se añaden una barra lateral para ver el contenido de los nodos, Node Graph, iconos y la ordenación manual de nodos del mismo nivel.

Puedes crear, renombrar, mover, fusionar, ordenar y eliminar nodos completos. Se mantiene el explorador original de Obsidian. El contenido del nodo separa los hijos, el álbum de imágenes estáticas y los demás archivos. Los GIF usan miniaturas fijas; los vídeos y audios no tienen reproductor integrado. Node Graph conserva la jerarquía de carpetas y permite superponer enlaces entre notas.

## Requisitos y compatibilidad

Se necesita Obsidian 1.12.7 o posterior.

Funciona en escritorio y Android. En Android, el movimiento de carpetas se realiza mediante menús en vez de arrastrar y soltar. Los dispositivos Android físicos y iOS están fuera del alcance de las pruebas de aceptación del proyecto.

## Instalación

En « Ajustes → Complementos de la comunidad → Explorar », busca Folder Nodes, instálalo y actívalo. Si no aparece, descarga `folder-nodes-<version>.zip` desde [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases) y extrae la carpeta `folder-nodes` en `Vault/.obsidian/plugins/`. El ZIP ya contiene la carpeta del complemento; no lo extraigas dentro de `plugins/folder-nodes/`.

También puedes colocar `main.js`, `manifest.json` y `styles.css` de la misma versión directamente en `Vault/.obsidian/plugins/folder-nodes/`. Recarga Obsidian y activa el complemento. No mezcles versiones. Al actualizar, conserva `data.json` para mantener las preferencias y reglas de exclusión.

## Uso

1. Haz una copia de seguridad del almacén y revisa los apartados «General» y «Administración» de Folder Nodes.
2. Comprueba que dentro de A exista A/A.md. Si falta algo, créalo cuando lo necesites o marca el elemento como «No administrado».
3. Usa «Nuevo nodo» para crear la carpeta y la nota juntas. Haz clic en el nombre de la carpeta para abrir su nota. En «Contenido del nodo» puedes ver los nodos hijos, las fotos, los vídeos y otros archivos.
4. Abre Node Graph. «Global» enseña todos los nodos administrados, «Subárbol» enseña un nodo y sus descendientes, y «Local» muestra su entorno. Puedes cambiar entre 2D y 3D y activar los enlaces entre notas.

Al crear un nodo desde texto seleccionado, revisa su nombre, ubicación y alias. También puedes crear nodos desde enlaces internos que aún no existen en la zona administrada. Las selecciones que cruzan varias celdas de una tabla Markdown se rechazan para proteger la tabla.

## Ajustes

**General**: idioma, nodos ocultos y página de inicio. **Administración**: exclusiones, organización por lotes, migración y comprobación de solo lectura. **Iconos y apariencia**: herencia, posición y fuente de emojis. **Selección y nombres**: confirmación, alias y reglas de nombres. **Node Graph**: dimensiones, orientación y rendimiento. Cambiar el idioma no modifica las notas.

## Propiedad folder-nodes

```yaml
folder-nodes:
  - order=manual
  - rank=1024
  - hidden=true
```

En la nota de cada nodo, la lista de texto `folder-nodes` guarda las opciones no predeterminadas: `order=manual` activa la ordenación manual de hijos, `rank=N` guarda su posición y `hidden=true` oculta el nodo y sus descendientes administrados. No se escriben valores predeterminados; si no quedan opciones se elimina la propiedad. Los campos antiguos `folderNodeChildrenSort`, `folderNodeSiblingRank` y `folderNodeHidden` siguen siendo legibles. No se migran al iniciar. Actualiza el plugin en todos los dispositivos y revisa la vista previa en «Administración» antes de confirmar.

## Propiedad icon

La propiedad icon de una nota de nodo admite imágenes del almacén, iconos Lucide, caracteres y emojis por orden de preferencia. color: da color a caracteres y Lucide, o actúa como color de reserva. Puedes ver el resultado en los ajustes antes de guardarlo.

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

## Limitaciones

Los nodos se identifican por la ruta actual del almacén, no por un ID permanente. README.md, index.md y _A.md no pueden sustituir A/A.md. La fusión se detiene ante conflictos de ruta o frontmatter. No se cargan imágenes remotas ni se crean miniaturas de PDF/vídeo, vistas HEIC/HEIF o reproductores integrados. Android no ofrece arrastrar y soltar como en escritorio. Los gráficos grandes usan Canvas sin perder la jerarquía.

## Privacidad y seguridad

**Ocultar**: hidden=true en la propiedad folder-nodes oculta el nodo y sus descendientes solo en las vistas de Folder Nodes del explorador, el contenido y Node Graph. La búsqueda y la apertura directa en Obsidian siguen funcionando. **No administrado**: Folder Nodes deja de realizar acciones estructurales sobre estos elementos, pero no los oculta ni los borra.

«Cambiar nombre de archivo» modifica un único archivo o carpeta; las acciones para el «nodo contenedor» afectan a todo el nodo. La organización por lotes y la migración de propiedades muestran una vista previa; la comprobación de estado es de solo lectura. Si hay conflictos, la operación se detiene. La eliminación de nodos completos sigue la opción de eliminación de archivos elegida en Obsidian.

Todo se procesa localmente: no se suben notas ni se hacen solicitudes de red. La organización y la migración muestran una vista previa y se detienen si hay conflictos. Los nodos completos se eliminan según la opción de eliminación de archivos elegida en Obsidian. Los enlaces solo se escriben en el portapapeles al pulsar Copiar; el plugin nunca lee el portapapeles. Los ajustes y las reglas de exclusión se guardan en data.json.

## Desarrollo

Para desarrollar se usan Node.js 24.19.0 y npm 11.17.0. Ejecuta `npm ci`, `npm run check` y `npm run release:check`. La documentación técnica completa está disponible en inglés y chino simplificado.

```bash
npm ci
npm run check
npm run release:check
```

## Ayuda

Para preguntas usa [Q&A](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/q-a); para propuestas, [Ideas](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/ideas); para fallos, [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose). Indica versiones, sistema y pasos de reproducción, sin divulgar notas o rutas privadas.

## Licencia

[MIT](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/LICENSE) © ZhengYX
