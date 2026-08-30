/* ============================================================
   CONFIGURAÇÃO — a única coisa que você provavelmente vai editar
   ============================================================ */

// Cole aqui o ID da sua planilha (veja README.md "Passo 1").
// O ID é o trecho da URL entre /d/ e /edit, ex:
// https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit
//                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^ isso aqui
const SHEET_ID = "1Wf63JsqDnIe1B6P67ePI7HOKhAE0iSp6l-pYHlCuJfo";

// Opcional: se os dados estiverem numa aba que NÃO é a primeira, cole o "gid"
// dessa aba (o número depois de "gid=" na URL quando você está com a aba
// aberta). Deixe "0" se for a primeira aba.
const SHEET_GID = "0";

// Nome das colunas na planilha (ajuste se seus cabeçalhos forem diferentes)
const COL_DATA = "Data";
const COL_NOME = "Nome";
const COL_RATING = "Rating";

// Categorias: rating -> {label, minutos}
const CATEGORIES = {
  "1": { label: "Iniciante", minutos: 5 },
  "2": { label: "Intermediário", minutos: 10 },
  "3": { label: "Experiente", minutos: 15 },
};

// Quantos nomes no topo de cada categoria marcar como "sugerido"
const SUGGESTED_COUNT = 1;

/* ============================================================
   LÓGICA — normalmente não precisa mexer daqui pra baixo
   ============================================================ */

const appEl = document.getElementById("app");
const updatedEl = document.getElementById("updated");
const refreshBtn = document.getElementById("refreshBtn");

refreshBtn.addEventListener("click", load);
document.addEventListener("DOMContentLoaded", load);
// Caso o script rode depois do DOMContentLoaded já ter disparado:
if (document.readyState !== "loading") load();

function parseDate(value) {
  if (!value) return null;
  // Tenta ISO primeiro (2026-05-01), depois formato Sheets padrão (5/1/2026)
  let d = new Date(value);
  if (!isNaN(d.getTime())) return d;
  const parts = value.split(/[\/\-]/);
  if (parts.length === 3) {
    // assume M/D/YYYY (padrão de export do Google Sheets em locale EN)
    const [m, day, y] = parts.map((p) => parseInt(p, 10));
    d = new Date(y < 100 ? 2000 + y : y, m - 1, day);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function daysBetween(a, b) {
  const MS_DAY = 1000 * 60 * 60 * 24;
  return Math.round((a.getTime() - b.getTime()) / MS_DAY);
}

function buildRanking(rows) {
  // último registro por (nome, categoria)
  const lastByKey = new Map(); // key = nome|rating -> Date mais recente

  rows.forEach((row) => {
    const nome = (row[COL_NOME] || "").trim();
    const rating = (row[COL_RATING] || "").toString().trim();
    const data = parseDate(row[COL_DATA]);
    if (!nome || !rating || !data || !CATEGORIES[rating]) return;

    const key = nome + "|" + rating;
    const prev = lastByKey.get(key);
    if (!prev || data > prev) lastByKey.set(key, data);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byCategory = {};
  Object.keys(CATEGORIES).forEach((r) => (byCategory[r] = []));

  lastByKey.forEach((lastDate, key) => {
    const [nome, rating] = key.split("|");
    byCategory[rating].push({
      nome,
      lastDate,
      dias: daysBetween(today, lastDate),
    });
  });

  Object.keys(byCategory).forEach((r) => {
    byCategory[r].sort((a, b) => b.dias - a.dias); // mais tempo sem discursar primeiro
  });

  return byCategory;
}

function formatLast(dias, lastDate) {
  const dateStr = lastDate.toLocaleDateString("pt-BR");
  if (dias <= 0) return `hoje (${dateStr})`;
  if (dias === 1) return `há 1 dia (${dateStr})`;
  if (dias < 30) return `há ${dias} dias (${dateStr})`;
  const meses = Math.round(dias / 30);
  if (meses < 12) return `há ~${meses} ${meses === 1 ? "mês" : "meses"} (${dateStr})`;
  const anos = (dias / 365).toFixed(1);
  return `há ~${anos} anos (${dateStr})`;
}

function render(byCategory) {
  appEl.innerHTML = "";

  Object.entries(CATEGORIES).forEach(([ratingKey, cat]) => {
    const people = byCategory[ratingKey] || [];

    const section = document.createElement("section");
    section.className = `category cat-${ratingKey}`;

    const head = document.createElement("div");
    head.className = "category-head";
    head.innerHTML = `<h2>${cat.label}</h2><span class="minutes">${cat.minutos} min</span>`;
    section.appendChild(head);

    if (people.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Nenhum registro ainda nesta categoria.";
      section.appendChild(empty);
    } else {
      const ul = document.createElement("ul");
      ul.className = "people";
      people.forEach((p, idx) => {
        const li = document.createElement("li");
        li.className = "person" + (idx < SUGGESTED_COUNT ? " suggested" : "");
        li.innerHTML = `
          <span class="rank">${idx + 1}.</span>
          <span class="name">${escapeHtml(p.nome)}</span>
          <span class="last">${formatLast(p.dias, p.lastDate)}</span>
        `;
        ul.appendChild(li);
      });
      section.appendChild(ul);
    }

    appEl.appendChild(section);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showState(message, isError) {
  appEl.innerHTML = `<div class="state${isError ? " error" : ""}">${message}</div>`;
}

function load() {
  if (!SHEET_ID || SHEET_ID.includes("COLE_AQUI")) {
    showState(
      "Configure o ID da planilha em app.js (constante SHEET_ID). Veja o README.md.",
      true
    );
    updatedEl.textContent = "não configurado";
    return;
  }

  showState("Buscando dados da planilha…", false);
  updatedEl.textContent = "atualizando…";

  // Remove uma tentativa anterior, se existir
  const oldScript = document.getElementById("gviz-loader");
  if (oldScript) oldScript.remove();

  let finished = false;

  // Timeout de segurança: se em 10s a planilha não respondeu
  // (rede ruim, planilha não pública, etc), mostra erro.
  const timeoutId = setTimeout(() => {
    if (finished) return;
    finished = true;
    console.error("Timeout esperando resposta da planilha");
    showState(
      "Não foi possível carregar os dados. Verifique sua conexão e se a planilha está compartilhada como 'Qualquer pessoa com o link'.",
      true
    );
    updatedEl.textContent = "erro ao atualizar";
  }, 10000);

  // Callback global que o Google vai chamar com os dados (técnica JSONP,
  // não sofre bloqueio de CORS como fetch() sofreria).
  window.handleGvizResponse = function (json) {
    if (finished) return;
    finished = true;
    clearTimeout(timeoutId);

    try {
      if (!json || json.status === "error" || !json.table) {
        throw new Error("Resposta da planilha veio com erro: " + JSON.stringify(json && json.errors));
      }

      const cols = json.table.cols.map((c) => (c.label || "").trim());
      const idxData = cols.indexOf(COL_DATA);
      const idxNome = cols.indexOf(COL_NOME);
      const idxRating = cols.indexOf(COL_RATING);

      if (idxNome === -1 || idxRating === -1 || idxData === -1) {
        throw new Error(
          "Não encontrei as colunas " + COL_DATA + "/" + COL_NOME + "/" + COL_RATING + " nos cabeçalhos: " + cols.join(", ")
        );
      }

      const rows = (json.table.rows || []).map((r) => {
        const cell = (i) => (r.c && r.c[i] ? r.c[i] : null);
        const cData = cell(idxData);
        const cNome = cell(idxNome);
        const cRating = cell(idxRating);
        return {
          [COL_DATA]: cData ? (cData.f || cData.v) : "",
          [COL_NOME]: cNome ? (cNome.f || cNome.v) : "",
          [COL_RATING]: cRating ? (cRating.f || cRating.v) : "",
        };
      });

      const byCategory = buildRanking(rows);
      render(byCategory);
      updatedEl.textContent =
        "atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch (err) {
      console.error(err);
      showState(
        "Os dados da planilha vieram num formato inesperado. Confira os nomes das colunas (Data, Nome, Rating) em app.js.",
        true
      );
      updatedEl.textContent = "erro ao atualizar";
    }
  };

  const src =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
    `?gid=${encodeURIComponent(SHEET_GID)}` +
    `&tqx=out:json;responseHandler:handleGvizResponse` +
    `&_=${Date.now()}`;

  const script = document.createElement("script");
  script.id = "gviz-loader";
  script.src = src;
  script.onerror = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeoutId);
    showState(
      "Não foi possível carregar os dados. Verifique sua conexão e se a planilha está compartilhada como 'Qualquer pessoa com o link'.",
      true
    );
    updatedEl.textContent = "erro ao atualizar";
  };
  document.body.appendChild(script);
}
