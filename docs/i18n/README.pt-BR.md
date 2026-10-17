# Folder Nodes

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

## O que o Folder Nodes faz?
O Folder Nodes combina uma pasta do Obsidian com uma nota Markdown de mesmo nome. Por exemplo, a pasta A e a nota A/A.md formam um nó completo. Se faltar uma das partes, o plugin mostra "Incompleto" e não cria nem move arquivos por conta própria.

Você continua usando o Explorador de Arquivos do Obsidian. O plugin acrescenta a barra lateral de conteúdo dos nós, o Node Graph, ícones e ordenação manual entre nós irmãos.

## Instalação
É necessário ter o Obsidian 1.12.7 ou mais recente. Acesse "Configurações → Plugins da comunidade → Procurar", pesquise Folder Nodes, instale e ative. Outra opção é baixar main.js, manifest.json e styles.css da mesma versão em [Releases](https://github.com/ZHYX91/obsidian-folder-nodes/releases) e colocá-los em Vault/.obsidian/plugins/folder-nodes/. Ao atualizar, mantenha data.json para preservar suas configurações.

O plugin funciona no computador e no Android. No Android, movimentar pastas usa menus em vez de arrastar e soltar. Aparelhos Android físicos e iOS não fazem parte da matriz de aceitação oficial do projeto.

## Comece por aqui
1. Faça um backup do cofre e confira as opções "Geral" e "Gerenciamento" do Folder Nodes.
2. Verifique se a pasta A contém A/A.md. Se faltar alguma parte, crie-a quando desejar ou marque o item como "Não gerenciado".
3. Use "Novo nó" para criar pasta e nota juntas. Clique no nome da pasta para abrir a nota do nó. Em "Conteúdo do nó", veja os filhos, imagens, vídeos e outros arquivos.
4. Abra o Node Graph: "Global" mostra todos os nós gerenciados, "Subárvore" mostra o nó selecionado e seus descendentes, e "Local" mostra a vizinhança. Você pode alternar 2D/3D e exibir links entre notas.

## Ícones e criação de nós
A propriedade icon da nota do nó aceita, em ordem de preferência, imagens do cofre, ícones Lucide, caracteres e emojis. color: muda a cor de caracteres e Lucide ou funciona como cor reserva. Veja uma prévia no painel de configurações antes de salvar.

Ao criar um nó a partir de texto selecionado, é possível conferir nome, local e aliases. Links internos que ainda não existem também podem criar nós na área gerenciada. Seleções que atravessam várias células de uma tabela Markdown são recusadas para evitar danos à tabela.

## Ocultar e deixar de gerenciar
**Ocultar**: hidden=true na propriedade folder-nodes oculta o nó e seus descendentes apenas nas visualizações do Folder Nodes no Explorador, no Conteúdo dos Nós e no Node Graph. A busca e a abertura direta do Obsidian continuam funcionando. **Não gerenciado**: o Folder Nodes não executa operações estruturais nesses itens, mas não os esconde nem apaga.

"Renomear arquivo" modifica apenas um arquivo ou pasta; ações do "nó que contém a nota" afetam o nó inteiro. Organização em lote e migração de propriedades mostram uma prévia antes da gravação; a verificação de integridade é somente leitura. Conflitos interrompem a ação, sem tentar adivinhar a solução. A exclusão de um nó completo usa a lixeira do sistema do Obsidian.

## Limites e privacidade
A identidade do nó é o caminho atual no cofre, não um ID permanente. O Folder Nodes não envia conteúdo do cofre nem realiza solicitações de rede. Trocar o idioma da interface não altera notas, nomes de arquivos ou propriedades.

Para mais informações, consulte o [guia completo em inglês](../../README.md) ou o [guia em chinês](README.zh-CN.md). Relate problemas no [GitHub Issues](https://github.com/ZHYX91/obsidian-folder-nodes/issues).
