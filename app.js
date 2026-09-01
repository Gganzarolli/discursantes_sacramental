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
const COL_DESATIVAR = "Desativar"; // valores esperados: "S" (esconde) ou "N"/vazio (mostra)

// Categorias: rating -> {label, minutos}
const CATEGORIES = {
  "1": { label: "Iniciante", minutos: 5 },
  "2": { label: "Intermediário", minutos: 10 },
  "3": { label: "Experiente", minutos: 15 },
};

// Quantos nomes no topo de cada categoria marcar como "sugerido"
const SUGGESTED_COUNT = 1;

// Cole aqui a URL do Apps Script (veja AppsScript.gs / README.md "Passo 6").
// Enquanto estiver com o valor de exemplo, o botão de salvar fica desativado.
const WRITE_URL = "https://script.google.com/macros/s/AKfycbwhjHpUFTvC3Fq9e8bzV9d2vr4InRREl8cPdt29oOIBYM8xjLGVKjaVlOZu5cDMy5wjEg/exec";

// Só preencha se você definiu um SECRET no AppsScript.gs. Deixe "" se não usou.
const WRITE_SECRET = "";

// Nome da aba para onde a nova linha vai ser escrita (deixe "" para usar a
// primeira aba automaticamente).
const WRITE_SHEET_NAME = "";

/* ============================================================
   LÓGICA — normalmente não precisa mexer daqui pra baixo
   ============================================================ */

const appEl = document.getElementById("app");
const updatedEl = document.getElementById("updated");
const refreshBtn = document.getElementById("refreshBtn");
const collapseAllBtn = document.getElementById("collapseAllBtn");
const viewToggleBtn = document.getElementById("viewToggleBtn");
const sundayBarEl = document.getElementById("sundayBar");
const sundayInputEl = document.getElementById("sundayInput");
const summaryPanelEl = document.getElementById("summaryPanel");
const summaryRowsEl = document.getElementById("summaryRows");
const saveAllBtn = document.getElementById("saveAllBtn");
const saveStatusEl = document.getElementById("saveStatus");

// Guarda quem foi escolhido em cada categoria nesta sessão (ainda não salvo).
// { "1": "Nome Escolhido", "2": null, "3": null }
const selection = {};
Object.keys(CATEGORIES).forEach((r) => (selection[r] = null));

let cachedNextSunday = null;
let lastByCategory = {};
let lastByPerson = [];
let viewMode = "grouped"; // "grouped" (por categoria, padrão) ou "flat" (lista única)

// Controla quais categorias estão recolhidas nesta sessão (não persiste
// entre recarregamentos de propósito — é só pra facilitar a rolagem).
const collapsed = {};
Object.keys(CATEGORIES).forEach((r) => (collapsed[r] = false));
let allCollapsedFlag = false;

refreshBtn.addEventListener("click", load);
saveAllBtn.addEventListener("click", saveSelectionToSheet);
collapseAllBtn.addEventListener("click", () => {
  allCollapsedFlag = !allCollapsedFlag;
  Object.keys(collapsed).forEach((r) => (collapsed[r] = allCollapsedFlag));
  collapseAllBtn.textContent = allCollapsedFlag ? "Expandir tudo" : "Recolher tudo";
  renderCurrent();
});
viewToggleBtn.addEventListener("click", () => {
  viewMode = viewMode === "grouped" ? "flat" : "grouped";
  viewToggleBtn.textContent = viewMode === "flat" ? "Ver por categoria" : "Ver lista única";
  collapseAllBtn.style.display = viewMode === "flat" ? "none" : "";
  renderCurrent();
});
initSundayPicker();
document.addEventListener("DOMContentLoaded", load);
// Caso o script rode depois do DOMContentLoaded já ter disparado:
if (document.readyState !== "loading") load();

function nextSunday(from) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = domingo
  const diff = (7 - day) % 7; // 0 se hoje já é domingo
  d.setDate(d.getDate() + diff);
  return d;
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDateLocal(iso) {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

function setTargetSunday(date) {
  cachedNextSunday = date;
  sundayInputEl.value = isoDate(date);
  const label = date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  sundayBarEl.querySelector(".sunday-label").textContent = "📅 Domingo selecionado: " + label;
}

function initSundayPicker() {
  setTargetSunday(nextSunday(new Date()));
  sundayInputEl.min = isoDate(new Date());

  sundayInputEl.addEventListener("change", () => {
    if (!sundayInputEl.value) return;
    let picked = parseIsoDateLocal(sundayInputEl.value);
    if (picked.getDay() !== 0) {
      picked = nextSunday(picked); // ajusta automaticamente pro domingo seguinte
    }
    setTargetSunday(picked);
    // "já agendado" depende da data escolhida, então re-renderiza
    renderCurrent();
    renderSummary();
  });
}

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
  // último registro por (nome, categoria) — usado na view "por categoria"
  const lastByKey = new Map(); // key = nome|rating -> {date, desativar}
  // último registro geral por nome (qualquer categoria) — usado na view "lista única"
  const lastByNome = new Map(); // nome -> {date, desativar, rating}

  rows.forEach((row) => {
    const nome = (row[COL_NOME] || "").trim();
    const rating = (row[COL_RATING] || "").toString().trim();
    const data = parseDate(row[COL_DATA]);
    const desativar = (row[COL_DESATIVAR] || "").toString().trim().toUpperCase();
    if (!nome || !rating || !data || !CATEGORIES[rating]) return;

    const key = nome + "|" + rating;
    const prev = lastByKey.get(key);
    if (!prev || data > prev.date) lastByKey.set(key, { date: data, desativar });

    const prevNome = lastByNome.get(nome);
    if (!prevNome || data > prevNome.date) lastByNome.set(nome, { date: data, desativar, rating });
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byCategory = {};
  Object.keys(CATEGORIES).forEach((r) => (byCategory[r] = []));

  lastByKey.forEach((info, key) => {
    if (info.desativar === "S") return; // pessoa desativada: não aparece na seleção
    const [nome, rating] = key.split("|");
    byCategory[rating].push({
      nome,
      lastDate: info.date,
      dias: daysBetween(today, info.date),
    });
  });

  Object.keys(byCategory).forEach((r) => {
    byCategory[r].sort((a, b) => b.dias - a.dias); // mais tempo sem discursar primeiro
  });

  const byPerson = [];
  lastByNome.forEach((info, nome) => {
    if (info.desativar === "S") return;
    byPerson.push({
      nome,
      lastDate: info.date,
      dias: daysBetween(today, info.date),
      lastRating: info.rating, // categoria da última vez que discursou (só como referência)
    });
  });
  byPerson.sort((a, b) => b.dias - a.dias);

  return { byCategory, byPerson };
}

function formatLast(dias, lastDate) {
  const dateStr = lastDate.toLocaleDateString("pt-BR");
  if (dias < 0) return `agendado(a) para ${dateStr}`;
  if (dias === 0) return `hoje (${dateStr})`;
  if (dias === 1) return `há 1 dia (${dateStr})`;
  if (dias < 30) return `há ${dias} dias (${dateStr})`;
  const meses = Math.round(dias / 30);
  if (meses < 12) return `há ~${meses} ${meses === 1 ? "mês" : "meses"} (${dateStr})`;
  const anos = (dias / 365).toFixed(1);
  return `há ~${anos} anos (${dateStr})`;
}

function renderGrouped(byCategory) {
  appEl.innerHTML = "";

  Object.entries(CATEGORIES).forEach(([ratingKey, cat]) => {
    const people = byCategory[ratingKey] || [];

    const section = document.createElement("section");
    section.className = `category cat-${ratingKey}`;

    const isCollapsed = collapsed[ratingKey];

    const head = document.createElement("div");
    head.className = "category-head";
    head.innerHTML = `<h2>${cat.label}<span class="chevron">${isCollapsed ? "▶" : "▼"}</span></h2><span class="minutes">${cat.minutos} min</span>`;
    head.addEventListener("click", () => {
      collapsed[ratingKey] = !collapsed[ratingKey];
      renderCurrent();
    });
    section.appendChild(head);

    if (isCollapsed) {
      const hint = document.createElement("div");
      hint.className = "empty";
      hint.style.padding = "10px 18px";
      hint.textContent = `${people.length} pessoa(s) — toque no título pra expandir`;
      section.appendChild(hint);
      appEl.appendChild(section);
      return;
    }

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
        const isChosen = selection[ratingKey] === p.nome;
        const isScheduled = cachedNextSunday && isoDate(p.lastDate) === isoDate(cachedNextSunday);
        li.className =
          "person" +
          (idx < SUGGESTED_COUNT ? " suggested" : "") +
          (isChosen ? " chosen" : "") +
          (isScheduled ? " scheduled" : "");

        const actionHtml = isScheduled
          ? `<span class="badge-scheduled">✓ agendado p/ este domingo</span>`
          : `<button type="button" class="choose" data-rating="${ratingKey}" data-nome="${escapeHtml(p.nome)}">
               ${isChosen ? "✓ escolhido" : "Escolher"}
             </button>`;

        li.innerHTML = `
          <span class="rank">${idx + 1}.</span>
          <span class="name">${escapeHtml(p.nome)}</span>
          ${actionHtml}
          <span class="last">${formatLast(p.dias, p.lastDate)}</span>
        `;
        ul.appendChild(li);
      });
      section.appendChild(ul);
    }

    appEl.appendChild(section);
  });

  appEl.querySelectorAll("button.choose").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rating = btn.getAttribute("data-rating");
      const nome = btn.getAttribute("data-nome");
      selection[rating] = selection[rating] === nome ? null : nome; // clique de novo desmarca
      renderCurrent();
      renderSummary();
    });
  });
}

function renderFlat(byPerson) {
  appEl.innerHTML = "";

  const section = document.createElement("section");
  section.className = "category cat-flat";

  const head = document.createElement("div");
  head.className = "category-head";
  head.innerHTML = `<h2>Todos os membros — ordenado por tempo sem discursar</h2>`;
  section.appendChild(head);

  if (byPerson.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nenhum registro encontrado.";
    section.appendChild(empty);
  } else {
    const ul = document.createElement("ul");
    ul.className = "people";
    byPerson.forEach((p, idx) => {
      const li = document.createElement("li");
      const isScheduled = cachedNextSunday && isoDate(p.lastDate) === isoDate(cachedNextSunday);
      li.className = "person" + (isScheduled ? " scheduled" : "");

      const lastCat = CATEGORIES[p.lastRating];
      const lastCatHint = lastCat ? ` · última vez: ${lastCat.minutos} min` : "";

      const actionHtml = isScheduled
        ? `<span class="badge-scheduled">✓ agendado p/ este domingo</span>`
        : `<div class="slot-buttons">` +
          Object.entries(CATEGORIES)
            .map(([ratingKey, cat]) => {
              const isChosen = selection[ratingKey] === p.nome;
              return `<button type="button" class="slot-btn slot-${ratingKey}${isChosen ? " active" : ""}"
                        data-rating="${ratingKey}" data-nome="${escapeHtml(p.nome)}"
                        title="${cat.label} · ${cat.minutos} min">${ratingKey}º${isChosen ? " ✓" : ""}</button>`;
            })
            .join("") +
          `</div>`;

      li.innerHTML = `
        <span class="rank">${idx + 1}.</span>
        <span class="name">${escapeHtml(p.nome)}</span>
        ${actionHtml}
        <span class="last">${formatLast(p.dias, p.lastDate)}${lastCatHint}</span>
      `;
      ul.appendChild(li);
    });
    section.appendChild(ul);
  }

  appEl.appendChild(section);

  appEl.querySelectorAll("button.slot-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rating = btn.getAttribute("data-rating");
      const nome = btn.getAttribute("data-nome");
      selection[rating] = selection[rating] === nome ? null : nome; // clique de novo desmarca
      renderCurrent();
      renderSummary();
    });
  });
}

function renderCurrent() {
  if (viewMode === "flat") {
    renderFlat(lastByPerson);
  } else {
    renderGrouped(lastByCategory);
  }
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
      const idxDesativar = cols.indexOf(COL_DESATIVAR); // -1 se a coluna não existir, tudo bem

      if (idxNome === -1 || idxRating === -1 || idxData === -1) {
        throw new Error(
          "Não encontrei as colunas " + COL_DATA + "/" + COL_NOME + "/" + COL_RATING + " nos cabeçalhos: " + cols.join(", ")
        );
      }

      const rows = (json.table.rows || []).map((r) => {
        const cell = (i) => (i !== -1 && r.c && r.c[i] ? r.c[i] : null);
        const cData = cell(idxData);
        const cNome = cell(idxNome);
        const cRating = cell(idxRating);
        const cDesativar = cell(idxDesativar);
        return {
          [COL_DATA]: cData ? (cData.f || cData.v) : "",
          [COL_NOME]: cNome ? (cNome.f || cNome.v) : "",
          [COL_RATING]: cRating ? (cRating.f || cRating.v) : "",
          [COL_DESATIVAR]: cDesativar ? (cDesativar.f || cDesativar.v) : "",
        };
      });

      const ranking = buildRanking(rows);
      lastByCategory = ranking.byCategory;
      lastByPerson = ranking.byPerson;
      renderCurrent();
      renderSummary();
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

function renderSummary() {
  const anySelected = Object.values(selection).some((v) => v);
  summaryPanelEl.style.display = anySelected ? "block" : "none";
  if (!anySelected) return;

  summaryRowsEl.innerHTML = "";
  Object.entries(CATEGORIES).forEach(([ratingKey, cat]) => {
    const nome = selection[ratingKey];
    const row = document.createElement("div");
    row.className = "summary-row";
    const label =
      viewMode === "flat"
        ? `${ratingKey}º orador · ${cat.minutos} min`
        : `${cat.label} · ${cat.minutos} min`;
    row.innerHTML = `
      <span class="cat-label">${label}</span>
      <span class="picked-name${nome ? "" : " empty-pick"}">${nome ? escapeHtml(nome) : "não escolhido"}</span>
    `;
    summaryRowsEl.appendChild(row);
  });

  const writeConfigured = WRITE_URL && !WRITE_URL.includes("COLE_AQUI");
  saveAllBtn.disabled = !anySelected || !writeConfigured;
  saveAllBtn.textContent = writeConfigured
    ? "Salvar na planilha"
    : "Configure WRITE_URL em app.js primeiro";
}

function saveSelectionToSheet() {
  const sunday = cachedNextSunday || nextSunday(new Date());
  const entries = Object.entries(selection).filter(([, nome]) => !!nome);
  if (entries.length === 0) return;

  saveAllBtn.disabled = true;
  saveStatusEl.className = "save-status";
  saveStatusEl.textContent = "Salvando " + entries.length + " registro(s)…";

  const dataPayloadBase = {
    year: sunday.getFullYear(),
    month: sunday.getMonth() + 1,
    day: sunday.getDate(),
  };

  const requests = entries.map(([rating, nome]) =>
    fetch(WRITE_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight de CORS
      body: JSON.stringify({
        secret: WRITE_SECRET,
        sheetName: WRITE_SHEET_NAME,
        data: dataPayloadBase,
        nome: nome,
        rating: rating,
      }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (!json || json.ok !== true) throw new Error((json && json.error) || "erro desconhecido");
        return { rating, nome, ok: true };
      })
      .catch((err) => ({ rating, nome, ok: false, error: err.message }))
  );

  Promise.all(requests).then((results) => {
    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) {
      saveStatusEl.className = "save-status ok";
      saveStatusEl.textContent = "✓ Salvo na planilha com sucesso!";
      Object.keys(selection).forEach((r) => (selection[r] = null));
      setTimeout(() => load(), 1500); // recarrega a lista já refletindo a escolha
    } else {
      saveStatusEl.className = "save-status error";
      saveStatusEl.textContent =
        "Alguns não foram salvos: " + failed.map((f) => f.nome + " (" + f.error + ")").join(", ");
      saveAllBtn.disabled = false;
    }
  });
}
