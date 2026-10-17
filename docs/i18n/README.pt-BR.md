# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## Capturas de tela

As imagens mostram o conteúdo dos nós, o Explorador de Arquivos, o Node Graph, os ícones e a criação de nós a partir de texto selecionado.

![Node contents](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-contents-en.png)

![File Explorer](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-explorer-en.png)

![Node Graph](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-graph-en.png)

![Icons](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-settings-icons-en.png)

![Node creation](https://raw.githubusercontent.com/ZHYX91/obsidian-folder-nodes/main/docs/assets/folder-nodes-creation-en.png)

## Recursos

O Folder Nodes combina uma pasta do Obsidian com uma nota Markdown de mesmo nome. Por exemplo, a pasta A e a nota A/A.md formam um nó completo. Se faltar uma das partes, o plugin mostra "Incompleto" e não cria nem move arquivos por conta própria.

Você continua usando o Explorador de Arquivos do Obsidian. O plugin acrescenta a barra lateral de conteúdo dos nós, o Node Graph, ícones e ordenação manual entre nós irmãos.

Você pode criar, renomear, mover, mesclar, ordenar e excluir nós completos. O Explorador de Arquivos original do Obsidian continua funcionando. O conteúdo de um nó separa filhos, álbum de imagens estáticas e outros arquivos. GIFs usam miniaturas paradas; vídeos e áudios não têm reprodução embutida. O Node Graph mantém a hierarquia de pastas e pode mostrar links entre notas.

## Requisitos e compatibilidade

É necessário ter o Obsidian 1.12.7 ou mais recente. Acesse "Configurações → Plugins da comunidade → Procurar", pesquise Folder Nodes, instale e ative. Outra opção é baixar main.js, manifest.json e styles.css da mesma versão em [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases) e colocá-los em Vault/.obsidian/plugins/folder-nodes/. Ao atualizar, mantenha data.json para preservar suas configurações.
O plugin funciona no computador e no Android. No Android, movimentar pastas usa menus em vez de arrastar e soltar. Aparelhos Android físicos e iOS não fazem parte da matriz de aceitação oficial do projeto.

## Instalação

É necessário ter o Obsidian 1.12.7 ou mais recente. Acesse "Configurações → Plugins da comunidade → Procurar", pesquise Folder Nodes, instale e ative. Outra opção é baixar main.js, manifest.json e styles.css da mesma versão em [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases) e colocá-los em Vault/.obsidian/plugins/folder-nodes/. Ao atualizar, mantenha data.json para preservar suas configurações.

## Como usar

1. Faça um backup do cofre e confira as opções "Geral" e "Gerenciamento" do Folder Nodes.
2. Verifique se a pasta A contém A/A.md. Se faltar alguma parte, crie-a quando desejar ou marque o item como "Não gerenciado".
3. Use "Novo nó" para criar pasta e nota juntas. Clique no nome da pasta para abrir a nota do nó. Em "Conteúdo do nó", veja os filhos, imagens, vídeos e outros arquivos.
4. Abra o Node Graph: "Global" mostra todos os nós gerenciados, "Subárvore" mostra o nó selecionado e seus descendentes, e "Local" mostra a vizinhança. Você pode alternar 2D/3D e exibir links entre notas.

Ao criar um nó a partir de texto selecionado, é possível conferir nome, local e aliases. Links internos que ainda não existem também podem criar nós na área gerenciada. Seleções que atravessam várias células de uma tabela Markdown são recusadas para evitar danos à tabela.

## Configurações

**Geral**: idioma, nós ocultos e página inicial. **Gerenciamento**: regras de exclusão, organização em lote, migração e verificação somente leitura. **Ícones e aparência**: herança, posição e fontes de emoji. **Seleção e nomes**: confirmação, aliases e regras de nome. **Node Graph**: dimensão, direção e desempenho. Trocar o idioma não modifica as notas.

## Propriedade folder-nodes

```yaml
folder-nodes:
  - order=manual
  - rank=1024
  - hidden=true
```

A lista de texto `folder-nodes` na nota do nó armazena apenas opções diferentes do padrão: `order=manual` ativa a ordem manual dos filhos, `rank=N` guarda a posição e `hidden=true` oculta o nó e seus descendentes gerenciados. Valores padrão não são escritos; sem opções a propriedade é removida. Os campos antigos `folderNodeChildrenSort`, `folderNodeSiblingRank` e `folderNodeHidden` continuam sendo lidos. A migração não ocorre automaticamente. Atualize todos os dispositivos e confira a prévia em “Gerenciamento” antes de confirmar.

## Propriedade icon

A propriedade icon da nota do nó aceita, em ordem de preferência, imagens do cofre, ícones Lucide, caracteres e emojis. color: muda a cor de caracteres e Lucide ou funciona como cor reserva. Veja uma prévia no painel de configurações antes de salvar.

```yaml
icon:
  - "[[Assets/project.svg]]"
  - "lucide:folder-tree"
  - 文
  - "color:#7c3aed"
```

## Limitações

A identidade do nó é o caminho atual no cofre, não um ID permanente. O Folder Nodes não envia conteúdo do cofre nem realiza solicitações de rede. Trocar o idioma da interface não altera notas, nomes de arquivos ou propriedades.

A identidade do nó é o caminho atual do cofre, não um ID permanente. README.md, index.md ou _A.md não substituem A/A.md. Uma mesclagem é interrompida quando há conflito de caminho ou frontmatter. Não há busca de imagens remotas, miniaturas PDF/vídeo, prévia HEIC/HEIF nem reprodução integrada de mídia. O Android não tem arrastar e soltar como no computador. Gráficos grandes usam Canvas sem omitir a hierarquia.

## Privacidade e segurança

**Ocultar**: hidden=true na propriedade folder-nodes oculta o nó e seus descendentes apenas nas visualizações do Folder Nodes no Explorador, no Conteúdo dos Nós e no Node Graph. A busca e a abertura direta do Obsidian continuam funcionando. **Não gerenciado**: o Folder Nodes não executa operações estruturais nesses itens, mas não os esconde nem apaga.

"Renomear arquivo" modifica apenas um arquivo ou pasta; ações do "nó que contém a nota" afetam o nó inteiro. Organização em lote e migração de propriedades mostram uma prévia antes da gravação; a verificação de integridade é somente leitura. Conflitos interrompem a ação, sem tentar adivinhar a solução. A exclusão de um nó completo usa a lixeira do sistema do Obsidian.

O processamento é local: o plugin não envia conteúdo do cofre nem faz solicitações de rede. Organização e migração exibem prévia e param em caso de conflito. A exclusão de nós completos usa a lixeira do sistema do Obsidian. Links só são gravados na área de transferência após uma ação explícita de copiar; o plugin nunca lê a área de transferência. Configurações e exclusões ficam em data.json.

## Desenvolvimento

Para desenvolver, use Node.js 24.19.0 e npm 11.17.0. Execute `npm ci`, `npm run check` e `npm run release:check`. Os documentos técnicos completos estão disponíveis em inglês e chinês simplificado.

```bash
npm ci
npm run check
npm run release:check
```

## Suporte

Dúvidas: [Q&A](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/q-a). Sugestões: [Ideas](https://github.com/ZHYX91/obsidian-folder-nodes/discussions/categories/ideas). Erros: [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose). Informe versões, sistema e passos para reproduzir, mas retire caminhos e conteúdo privados.

## Licença

[MIT](https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/LICENSE) © ZhengYX
