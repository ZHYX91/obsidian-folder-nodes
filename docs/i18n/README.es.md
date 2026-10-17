# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## ¿Qué hace Folder Nodes?
Folder Nodes une una carpeta de Obsidian con una nota Markdown del mismo nombre. Por ejemplo, la carpeta A y la nota A/A.md forman un nodo completo. Si falta una parte, aparecerá «Incompleto»: el complemento no crea ni mueve archivos por su cuenta.

Seguirás usando el explorador de archivos normal de Obsidian. Se añaden una barra lateral para ver el contenido de los nodos, Node Graph, iconos y la ordenación manual de nodos del mismo nivel.

## Instalación
Necesitas Obsidian 1.12.7 o posterior. Ve a «Ajustes → Complementos de la comunidad → Examinar», busca Folder Nodes, instálalo y actívalo. También puedes descargar main.js, manifest.json y styles.css de una misma versión en [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases) y colocarlos en Vault/.obsidian/plugins/folder-nodes/. Conserva data.json al actualizar para no perder los ajustes.

Funciona en escritorio y Android. En Android, el movimiento de carpetas se realiza mediante menús en vez de arrastrar y soltar. Los dispositivos Android físicos y iOS están fuera del alcance de las pruebas de aceptación del proyecto.

## Primeros pasos
1. Haz una copia de seguridad del almacén y revisa los apartados «General» y «Administración» de Folder Nodes.
2. Comprueba que dentro de A exista A/A.md. Si falta algo, créalo cuando lo necesites o marca el elemento como «No administrado».
3. Usa «Nuevo nodo» para crear la carpeta y la nota juntas. Haz clic en el nombre de la carpeta para abrir su nota. En «Contenido del nodo» puedes ver los nodos hijos, las fotos, los vídeos y otros archivos.
4. Abre Node Graph. «Global» enseña todos los nodos administrados, «Subárbol» enseña un nodo y sus descendientes, y «Local» muestra su entorno. Puedes cambiar entre 2D y 3D y activar los enlaces entre notas.

## Iconos y creación
La propiedad icon de una nota de nodo admite imágenes del almacén, iconos Lucide, caracteres y emojis por orden de preferencia. color: da color a caracteres y Lucide, o actúa como color de reserva. Puedes ver el resultado en los ajustes antes de guardarlo.

Al crear un nodo desde texto seleccionado, revisa su nombre, ubicación y alias. También puedes crear nodos desde enlaces internos que aún no existen en la zona administrada. Las selecciones que cruzan varias celdas de una tabla Markdown se rechazan para proteger la tabla.

## Ocultar y no administrar
**Ocultar**: hidden=true en la propiedad folder-nodes oculta el nodo y sus descendientes solo en las vistas de Folder Nodes del explorador, el contenido y Node Graph. La búsqueda y la apertura directa en Obsidian siguen funcionando. **No administrado**: Folder Nodes deja de realizar acciones estructurales sobre estos elementos, pero no los oculta ni los borra.

«Cambiar nombre de archivo» modifica un único archivo o carpeta; las acciones para el «nodo contenedor» afectan a todo el nodo. La organización por lotes y la migración de propiedades muestran una vista previa; la comprobación de estado es de solo lectura. Si hay conflictos, la operación se detiene. La eliminación de nodos completos utiliza la papelera del sistema de Obsidian.

## Límites y privacidad
La identidad de un nodo depende de su ruta actual en el almacén, no de un identificador permanente. Folder Nodes no sube contenidos del almacén ni hace solicitudes de red. Cambiar el idioma de la interfaz no modifica notas, nombres ni propiedades.

Para más detalles, consulta la [guía completa en inglés](../../README.md) o la [guía en chino](README.zh-CN.md). Puedes informar de fallos en [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues).
