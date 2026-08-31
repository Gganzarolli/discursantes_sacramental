# Quadro de Discursantes — app web (PWA)

App leve que lê os dados direto da sua planilha do Google Sheets e mostra,
na hora da reunião, quem está há mais tempo sem discursar em cada categoria
(5 / 10 / 15 min). Não precisa de Play Store nem de conta de desenvolvedor.

## Estrutura esperada da planilha

Uma aba com 3 colunas, uma linha por discurso já realizado:

| Data       | Nome         | Rating |
|------------|--------------|--------|
| 2026-05-01 | Maria Lopes  | 2      |

- **Rating**: 1 = 5 min (iniciante), 2 = 10 min (intermediário), 3 = 15 min (experiente)
- Pode ter quantas linhas de histórico quiser — o app sempre olha só a
  **última** data de cada pessoa em cada categoria.

---

## Passo 1 — Compartilhar a planilha e pegar o ID

1. Abra a planilha no Google Sheets.
2. Clique em **Compartilhar** (canto superior direito) → em "Acesso geral",
   mude para **"Qualquer pessoa com o link"** e o papel como **Leitor**.
   Não precisa dar permissão de edição.
3. Copie a URL da planilha na barra de endereço. Ela tem este formato:

   ```
   https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit#gid=0
                                          └──────────── ID ────────────┘        └gid┘
   ```

4. Guarde o trecho entre `/d/` e `/edit` — esse é o **ID da planilha**.
5. Se os dados estiverem numa aba diferente da primeira, clique nessa aba e
   olhe o número depois de `gid=` no final da URL — esse é o **gid**. Se for
   a primeira aba, o gid é `0`.

> Diferente da opção "Publicar na web", isso só dá acesso de **leitura** a
> quem tiver o link — mais simples de configurar e equivalente em termos de
> privacidade (mesmo risco baixo, já que são só nomes e datas de discurso).

## Passo 2 — Configurar o app

Abra o arquivo `app.js` e cole o ID (e o gid, se necessário) nas constantes:

```js
const SHEET_ID = "COLE_AQUI_O_ID_DA_SUA_PLANILHA";
const SHEET_GID = "0"; // troque se os dados estiverem em outra aba
```

Se os nomes das colunas na sua planilha forem diferentes de
`Data`, `Nome`, `Rating`, ajuste também as constantes `COL_DATA`,
`COL_NOME`, `COL_RATING` logo abaixo.

## Passo 3 — Subir para o GitHub (usando o GitHub Desktop)

1. No GitHub (site), crie um repositório novo, público, sem README
   (ex: `discursantes-app`).
2. Abra o **GitHub Desktop** → **File → Clone repository** → escolha o
   repositório que você acabou de criar → escolha uma pasta no seu
   computador.
3. Copie todos os arquivos desta pasta (`index.html`, `app.js`,
   `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`) para dentro
   da pasta do repositório clonado.
4. No GitHub Desktop, você vai ver os arquivos listados como mudanças.
   Escreva uma mensagem de commit (ex: "primeira versão do app") e clique
   em **Commit to main**.
5. Clique em **Push origin** para enviar ao GitHub.

## Passo 4 — Ativar o GitHub Pages

1. No site do GitHub, entre no repositório → **Settings → Pages**.
2. Em "Source", selecione a branch **main** e a pasta **/ (root)**.
3. Salve. Em ~1 minuto o GitHub mostra a URL pública, algo como:
   `https://SEU-USUARIO.github.io/discursantes-app/`

Esse é o link que vocês vão usar na reunião.

## Passo 5 — Instalar no Android

1. Abra o link do Passo 4 no **Chrome** do celular.
2. Toque no menu (⋮) → **"Adicionar à tela inicial"** (ou o Chrome pode
   sugerir isso automaticamente, com um banner "Instalar app").
3. Confirme. Agora existe um ícone na tela inicial que abre o app em tela
   cheia, sem barra de endereço — visualmente como um app nativo.

---

## Como usar toda semana

- Antes da reunião, é só abrir o app (ele busca a versão mais atual da
  planilha automaticamente).
- Cada categoria mostra os nomes ordenados por "tempo desde o último
  discurso" — o primeiro de cada lista já vem marcado como **★ sugerido**.
- Depois de decidir quem vai discursar, adicionem a linha correspondente
  na planilha do Google Sheets normalmente (data de domingo que vem, nome,
  rating). Da próxima vez que abrir o app, o ranking já reflete a escolha.

## Passo 6 — Escrever na planilha automaticamente (escolher discursante)

Isso permite que, ao tocar em "Escolher" num nome, o app registre
automaticamente uma nova linha na planilha para o próximo domingo.

1. Abra sua planilha no Google Sheets.
2. Menu **Extensões → Apps Script**. Vai abrir um editor de código numa
   aba nova.
3. Apague o conteúdo padrão (`function myFunction() {}`) e cole o conteúdo
   inteiro do arquivo `AppsScript.gs` (está junto com os outros arquivos
   deste projeto).
4. (Opcional, recomendado) Troque o valor de `SECRET` no topo do código por
   uma senha simples inventada por você, tipo `"discurso2026"`. Se trocar,
   anote — vai usar o mesmo valor no `app.js` daqui a pouco.
5. Clique em **Implantar** (canto superior direito) → **Nova implantação**.
6. Em "Tipo", clique no ícone de engrenagem e escolha **"App da Web"**.
7. Configure:
   - **Executar como**: Eu (sua conta)
   - **Quem pode acessar**: Qualquer pessoa
8. Clique em **Implantar**. O Google vai pedir para autorizar — é o seu
   próprio script agendando escrita na sua própria planilha, pode
   autorizar sem medo.
9. Copie a **URL do app da Web** que aparece (algo como
   `https://script.google.com/macros/s/AKfycb.../exec`).
10. No `app.js`, cole essa URL em `WRITE_URL`, e se você definiu um
    `SECRET` no passo 4, copie o mesmo valor para `WRITE_SECRET`.
11. Salve, faça commit e push no GitHub Desktop como sempre.

> **Atenção:** se um dia você editar o código do `AppsScript.gs` de novo,
> só salvar não atualiza o app já publicado — é preciso ir em
> **Implantar → Gerenciar implantações → editar (ícone de lápis) →
> Nova versão → Implantar**.

### Como fica o uso na reunião

- Toque em "Escolher" ao lado do nome desejado em cada categoria (pode
  trocar de ideia clicando de novo antes de salvar).
- Um painel "Escolha para o próximo domingo" aparece embaixo mostrando os
  3 escolhidos e a data do domingo calculada automaticamente.
- Toque em **"Salvar na planilha"** — o app escreve as 3 linhas na
  planilha (data do domingo, nome, categoria) e atualiza a lista sozinho.

## Limitação atual (e possível evolução)

O app só enxerga quem **já tem histórico** de discurso na planilha. Um
irmão novo, que nunca discursou antes, só aparece na lista depois do
primeiro registro. Se quiser, dá para adicionar uma segunda aba
"Membros" (Nome + categoria máxima) para que novatos apareçam desde o
início com status "nunca discursou" — é uma extensão simples do mesmo
código, é só pedir.
