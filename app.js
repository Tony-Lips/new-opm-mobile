/* ============================================================
   OPM ОТК Mobile PRO — app.js
   ============================================================ */

'use strict';

// ─── Константы ────────────────────────────────────────────────
const CHECK_ITEMS = [
  "Линейные размеры",
  "Резьба",
  "Механические свойства",
  "Внешний вид",
  "Защитное покрытие",
  "Маркировка",
  "Упаковка",
  "Количество",
  "Документация"
];

const DEFECT_LEVELS = [
  { value: "critical",     label: "🔴 Критический" },
  { value: "significant",  label: "🟡 Значительный" },
  { value: "minor",        label: "🟢 Незначительный" }
];

const STORAGE_KEY = "opm_otk_data";

// ─── Состояние ─────────────────────────────────────────────────
let positions      = [];
let activePosition = 0;
let actNumber      = "";
let userName       = "";

// ─── Утилиты ───────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function today() {
  return new Date().toLocaleDateString("ru-RU");
}

function nowTime() {
  return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ positions, actNumber, userName }));
  } catch (e) { /* игнорируем */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    positions   = data.positions  || [];
    actNumber   = data.actNumber  || "";
    userName    = data.userName   || "";
  } catch (e) { /* игнорируем */ }
}

// ─── Инициализация новой позиции ───────────────────────────────
function newPosition() {
  return {
    id:          uid(),
    supplier:    "",
    batch:       "",
    product:     "",
    qty:         "",
    unit:        "шт.",
    note:        "",
    actPhotos:   [],   // base64[]
    result:      "",   // OK / NOK / pending
    savedAt:     null,
    checks: CHECK_ITEMS.map(name => ({
      name,
      status:  "pending",   // ok | nok | pending
      defect:  "",
      level:   "",
      photos:  []
    }))
  };
}

// ─── DOM-хелперы ───────────────────────────────────────────────
function el(id)       { return document.getElementById(id); }
function ce(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

// ─── Шапка ─────────────────────────────────────────────────────
function initHeader() {
  actNumber = actNumber || ("АКТ-" + Date.now().toString().slice(-6));
  el("actNumber").textContent = actNumber;

  userName = userName || promptUser();
  el("userName").textContent = userName;
  saveState();
}

function promptUser() {
  const u = localStorage.getItem("opm_user") || "";
  if (u) return u;
  const name = window.prompt("Введите ваше имя / табельный номер:", "") || "Контролёр";
  localStorage.setItem("opm_user", name);
  return name;
}

// ─── Вкладки ───────────────────────────────────────────────────
function renderTabs() {
  const container = el("tabsContainer");
  container.innerHTML = "";

  positions.forEach((pos, idx) => {
    const tab = ce("div", "tab" + (idx === activePosition ? " active" : ""));
    tab.textContent = pos.product
      ? `#${idx + 1} ${pos.product.slice(0, 14)}`
      : `Позиция ${idx + 1}`;
    tab.addEventListener("click", () => switchTab(idx));
    container.appendChild(tab);
  });

  // кнопка «+» внутри вкладок
  const addTab = ce("div", "tab tab-add");
  addTab.textContent = "+ Позиция";
  addTab.title = "Добавить позицию";
  addTab.addEventListener("click", addPosition);
  container.appendChild(addTab);
}

function switchTab(idx) {
  activePosition = idx;
  renderTabs();
  renderPosition();
}

// ─── Позиции ───────────────────────────────────────────────────
function addPosition() {
  positions.push(newPosition());
  activePosition = positions.length - 1;
  saveState();
  renderTabs();
  renderPosition();
}

function deletePosition(idx) {
  if (!confirm(`Удалить позицию ${idx + 1}? Данные будут потеряны.`)) return;
  positions.splice(idx, 1);
  if (activePosition >= positions.length) activePosition = positions.length - 1;
  saveState();
  renderTabs();
  renderPosition();
}

function duplicatePosition(idx) {
  const clone = JSON.parse(JSON.stringify(positions[idx]));
  clone.id = uid();
  clone.savedAt = null;
  positions.splice(idx + 1, 0, clone);
  activePosition = idx + 1;
  saveState();
  renderTabs();
  renderPosition();
}

// ─── Рендер одной позиции ──────────────────────────────────────
function renderPosition() {
  const container = el("positionContainer");
  container.innerHTML = "";

  if (positions.length === 0) {
    const hint = ce("div", "card");
    hint.innerHTML = "<p>Нет позиций. Нажмите «Добавить позицию».</p>";
    container.appendChild(hint);
    return;
  }

  const pos = positions[activePosition];

  // ── Карточка: Общие данные ────────────────────────────────
  const card = ce("div", "card");
  card.innerHTML = `
    <div class="card-header">
      <b>📦 Позиция ${activePosition + 1}</b>
      <span class="pos-badge ${pos.result === 'ok' ? 'badge-ok' : pos.result === 'nok' ? 'badge-nok' : 'badge-pending'}">
        ${pos.result === 'ok' ? '✅ Принято' : pos.result === 'nok' ? '❌ Отклонено' : '⏳ В работе'}
      </span>
    </div>

    <label>Поставщик *</label>
    <input id="f_supplier" type="text" placeholder="ООО «Поставщик»" value="${esc(pos.supplier)}">

    <label>Партия / Лот *</label>
    <input id="f_batch" type="text" placeholder="№ партии" value="${esc(pos.batch)}">

    <label>Наименование товара *</label>
    <input id="f_product" type="text" placeholder="Болт М10×50 ГОСТ..." value="${esc(pos.product)}">

    <div class="row2">
      <div>
        <label>Кол-во</label>
        <input id="f_qty" type="number" min="0" placeholder="0" value="${esc(pos.qty)}">
      </div>
      <div>
        <label>Ед. изм.</label>
        <select id="f_unit">
          ${["шт.", "кг", "м", "л", "упак.", "компл."].map(u =>
            `<option${pos.unit === u ? " selected" : ""}>${u}</option>`
          ).join("")}
        </select>
      </div>
    </div>

    <label>Примечание</label>
    <textarea id="f_note" rows="2" placeholder="Доп. сведения...">${esc(pos.note)}</textarea>
  `;
  container.appendChild(card);
  bindFieldListeners(pos);

  // ── Карточка: Фото акта ───────────────────────────────────
  const photoCard = ce("div", "card");
  photoCard.innerHTML = `
    <b>📷 Фото акта <span class="req">*</span></b>
    <p class="hint">Общий вид партии, ярлык, упаковка. Минимум 1 фото.</p>
    <label class="photo-btn">
      📸 Добавить фото акта
      <input type="file" accept="image/*" capture="environment" multiple style="display:none"
             id="actPhotoInput">
    </label>
    <div class="photoPreview" id="actPhotoPreview"></div>
  `;
  container.appendChild(photoCard);
  renderPhotoPreview(pos.actPhotos, el("actPhotoPreview") || photoCard.querySelector("#actPhotoPreview"), (arr) => {
    pos.actPhotos = arr; saveState();
  });
  photoCard.querySelector("#actPhotoInput").addEventListener("change", e => {
    handlePhotoInput(e, pos.actPhotos, photoCard.querySelector("#actPhotoPreview"), (arr) => {
      pos.actPhotos = arr; saveState();
    });
  });

  // ── Карточка: Пункты контроля ─────────────────────────────
  const checksCard = ce("div", "card");
  checksCard.innerHTML = `<b>🔍 Пункты контроля</b>`;
  container.appendChild(checksCard);

  pos.checks.forEach((chk, ci) => {
    const item = ce("div", "checkItem");
    item.innerHTML = `
      <div class="checkTitle">${ci + 1}. ${chk.name}</div>

      <div class="status-row">
        <button class="btn-ok  ${chk.status === 'ok'  ? 'active-ok'  : ''}" data-ci="${ci}" data-s="ok">✅ OK</button>
        <button class="btn-nok ${chk.status === 'nok' ? 'active-nok' : ''}" data-ci="${ci}" data-s="nok">❌ НОК</button>
        <button class="btn-na  ${chk.status === 'na'  ? 'active-na'  : ''}" data-ci="${ci}" data-s="na">➖ Н/П</button>
      </div>

      <div class="defect-block" style="display:${chk.status === 'nok' ? 'block' : 'none'}">
        <label>Описание дефекта</label>
        <textarea class="defect-text" data-ci="${ci}" rows="2"
          placeholder="Опишите дефект...">${esc(chk.defect)}</textarea>

        <label>Классификация дефекта</label>
        <div class="level-row">
          ${DEFECT_LEVELS.map(d => `
            <label class="level-lbl">
              <input type="radio" name="level_${pos.id}_${ci}" value="${d.value}"
                ${chk.level === d.value ? "checked" : ""}
                data-ci="${ci}" class="level-radio">
              ${d.label}
            </label>
          `).join("")}
        </div>
      </div>

      <label class="photo-btn" style="margin-top:6px;">
        📎 Фото к пункту
        <input type="file" accept="image/*" capture="environment" multiple
               style="display:none" class="check-photo-input" data-ci="${ci}">
      </label>
      <div class="photoPreview check-photo-preview" data-ci="${ci}"></div>
    `;
    checksCard.appendChild(item);

    // рендер фото к пункту
    const prev = item.querySelector(`.check-photo-preview[data-ci="${ci}"]`);
    renderPhotoPreview(chk.photos, prev, arr => { chk.photos = arr; saveState(); });

    item.querySelector(`.check-photo-input[data-ci="${ci}"]`).addEventListener("change", e => {
      handlePhotoInput(e, chk.photos, prev, arr => { chk.photos = arr; saveState(); });
    });

    // кнопки статуса
    item.querySelectorAll("[data-s]").forEach(btn => {
      btn.addEventListener("click", () => {
        const c = +btn.dataset.ci;
        pos.checks[c].status = btn.dataset.s;
        saveState();
        renderPosition();
      });
    });

    // дефект / уровень
    const defTxt = item.querySelector(".defect-text");
    if (defTxt) defTxt.addEventListener("input", () => {
      pos.checks[+defTxt.dataset.ci].defect = defTxt.value; saveState();
    });
    item.querySelectorAll(".level-radio").forEach(r => {
      r.addEventListener("change", () => {
        pos.checks[+r.dataset.ci].level = r.value; saveState();
      });
    });
  });

  // ── Итог позиции ──────────────────────────────────────────
  const resultCard = ce("div", "card");
  resultCard.innerHTML = `
    <b>📋 Заключение по позиции</b>
    <div class="status-row" style="margin-top:10px;">
      <button class="btn-ok  ${pos.result === 'ok'  ? 'active-ok'  : ''}" id="res_ok">✅ Принять</button>
      <button class="btn-nok ${pos.result === 'nok' ? 'active-nok' : ''}" id="res_nok">❌ Отклонить</button>
    </div>
    <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
      <button class="btn btn-secondary" id="savePos">💾 Сохранить позицию</button>
      <button class="btn btn-danger"    id="delPos">🗑 Удалить позицию</button>
      <button class="btn btn-secondary" id="dupPos">📋 Дублировать</button>
    </div>
    ${pos.savedAt ? `<div class="hint" style="margin-top:6px;">Последнее сохранение: ${pos.savedAt}</div>` : ""}
  `;
  container.appendChild(resultCard);

  el("res_ok").addEventListener("click",  () => { pos.result = "ok";  saveState(); renderPosition(); renderTabs(); });
  el("res_nok").addEventListener("click", () => { pos.result = "nok"; saveState(); renderPosition(); renderTabs(); });
  el("savePos").addEventListener("click", () => savePosition(activePosition));
  el("delPos").addEventListener("click",  () => deletePosition(activePosition));
  el("dupPos").addEventListener("click",  () => duplicatePosition(activePosition));
}

// ─── Привязка полей ────────────────────────────────────────────
function bindFieldListeners(pos) {
  const map = {
    f_supplier: "supplier",
    f_batch:    "batch",
    f_product:  "product",
    f_qty:      "qty",
    f_unit:     "unit",
    f_note:     "note"
  };
  Object.entries(map).forEach(([id, key]) => {
    const elem = el(id);
    if (!elem) return;
    elem.addEventListener("input",  () => { pos[key] = elem.value; saveState(); renderTabs(); });
    elem.addEventListener("change", () => { pos[key] = elem.value; saveState(); renderTabs(); });
  });
}

// ─── Сохранение позиции ────────────────────────────────────────
function savePosition(idx) {
  const pos = positions[idx];
  const errors = [];
  if (!pos.supplier.trim()) errors.push("Поставщик");
  if (!pos.batch.trim())    errors.push("Партия");
  if (!pos.product.trim())  errors.push("Наименование товара");
  if (pos.actPhotos.length === 0) errors.push("Фото акта (мин. 1)");

  if (errors.length) {
    alert("Заполните обязательные поля:\n• " + errors.join("\n• "));
    return;
  }

  pos.savedAt = today() + " " + nowTime();
  saveState();
  renderPosition();
  showToast("✅ Позиция сохранена");
}

// ─── Фото ──────────────────────────────────────────────────────
function handlePhotoInput(event, arr, preview, cb) {
  const files = Array.from(event.target.files);
  let loaded = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      arr.push(e.target.result);
      loaded++;
      if (loaded === files.length) {
        cb(arr);
        renderPhotoPreview(arr, preview, cb);
      }
    };
    reader.readAsDataURL(file);
  });
  event.target.value = "";
}

function renderPhotoPreview(arr, container, cb) {
  if (!container) return;
  container.innerHTML = "";
  arr.forEach((src, i) => {
    const wrap = ce("div", "photo-wrap");
    const img = ce("img");
    img.src = src;
    img.addEventListener("click", () => openLightbox(src));
    const del = ce("button", "photo-del");
    del.textContent = "✕";
    del.title = "Удалить фото";
    del.addEventListener("click", () => {
      arr.splice(i, 1);
      cb(arr);
      renderPhotoPreview(arr, container, cb);
    });
    wrap.appendChild(img);
    wrap.appendChild(del);
    container.appendChild(wrap);
  });
}

// ─── Лайтбокс ─────────────────────────────────────────────────
function openLightbox(src) {
  const lb = ce("div", "lightbox");
  lb.innerHTML = `<img src="${src}"><button class="lb-close">✕</button>`;
  lb.addEventListener("click", e => {
    if (e.target === lb || e.target.classList.contains("lb-close")) lb.remove();
  });
  document.body.appendChild(lb);
}

// ─── Формирование акта ─────────────────────────────────────────
function createAct() {
  if (positions.length === 0) { alert("Нет позиций для формирования акта."); return; }

  const multiPage = el("multiPageAct").checked;
  let out = "";
  const sep = "═".repeat(50);
  const dash = "─".repeat(50);

  out += sep + "\n";
  out += `АКТ ВХОДНОГО КОНТРОЛЯ  ${actNumber}\n`;
  out += `Дата: ${today()}    Контролёр: ${userName}\n`;
  out += sep + "\n\n";

  positions.forEach((pos, i) => {
    if (multiPage && i > 0) out += "\n" + sep + "\n\n";

    const nokChecks = pos.checks.filter(c => c.status === "nok");
    const okChecks  = pos.checks.filter(c => c.status === "ok");
    const naChecks  = pos.checks.filter(c => c.status === "na");

    out += `ПОЗИЦИЯ ${i + 1}\n`;
    out += dash + "\n";
    out += `Поставщик : ${pos.supplier || "—"}\n`;
    out += `Партия    : ${pos.batch    || "—"}\n`;
    out += `Товар     : ${pos.product  || "—"}\n`;
    out += `Кол-во    : ${pos.qty || "—"} ${pos.unit}\n`;
    if (pos.note) out += `Примечание: ${pos.note}\n`;
    out += "\n";

    out += `Результаты проверки:\n`;
    out += `  ✅ Соответствует  : ${okChecks.length} пункт(ов)\n`;
    out += `  ❌ Несоответствие : ${nokChecks.length} пункт(ов)\n`;
    out += `  ➖ Не применимо  : ${naChecks.length} пункт(ов)\n`;
    out += "\n";

    if (nokChecks.length > 0) {
      out += "ДЕФЕКТЫ:\n";
      nokChecks.forEach(c => {
        const levelLabel = DEFECT_LEVELS.find(d => d.value === c.level)?.label || "не классифицирован";
        out += `  • ${c.name}\n`;
        out += `    Уровень : ${levelLabel}\n`;
        out += `    Дефект  : ${c.defect || "—"}\n`;
        out += `    Фото    : ${c.photos.length} шт.\n`;
      });
      out += "\n";
    }

    const verdict = pos.result === "ok"  ? "✅ ПРИНЯТО"
                  : pos.result === "nok" ? "❌ ОТКЛОНЕНО"
                  : "⏳ НЕ ЗАВЕРШЕНО";
    out += `ЗАКЛЮЧЕНИЕ: ${verdict}\n`;
    out += `Фото акта : ${pos.actPhotos.length} шт.\n`;
    if (pos.savedAt) out += `Сохранено : ${pos.savedAt}\n`;
    out += "\n";
  });

  out += sep + "\n";
  out += `Итого позиций: ${positions.length}   `;
  out += `Принято: ${positions.filter(p => p.result === "ok").length}   `;
  out += `Отклонено: ${positions.filter(p => p.result === "nok").length}\n`;
  out += sep + "\n";

  el("reportOutput").textContent = out;
  el("reportOutput").scrollIntoView({ behavior: "smooth" });
  showToast("📄 Акт сформирован");
}

// ─── Рапорт руководителю ───────────────────────────────────────
function sendReport() {
  const text = el("reportOutput").textContent;
  if (!text.trim()) { alert("Сначала сформируйте акт."); return; }

  const subject = encodeURIComponent(`[ОТК] ${actNumber} от ${today()}`);
  const body    = encodeURIComponent(text);
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

// ─── Экспорт JSON ─────────────────────────────────────────────
function exportJSON() {
  const data = JSON.stringify({ actNumber, userName, date: today(), positions }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = ce("a");
  a.href     = url;
  a.download = `${actNumber}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("💾 JSON экспортирован");
}

// ─── Сброс сессии ─────────────────────────────────────────────
function resetSession() {
  if (!confirm("Начать новую сессию? Все несохранённые данные будут удалены.")) return;
  positions      = [];
  activePosition = 0;
  actNumber      = "АКТ-" + Date.now().toString().slice(-6);
  el("actNumber").textContent = actNumber;
  el("reportOutput").textContent = "";
  saveState();
  renderTabs();
  renderPosition();
  showToast("🔄 Новая сессия начата");
}

// ─── Toast ─────────────────────────────────────────────────────
function showToast(msg) {
  const t = ce("div", "toast");
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("toast-show"));
  setTimeout(() => { t.classList.remove("toast-show"); setTimeout(() => t.remove(), 350); }, 2500);
}

// ─── Статус онлайн/оффлайн ─────────────────────────────────────
function updateOnlineStatus() {
  const s = el("statusSystem");
  if (s) {
    s.textContent = navigator.onLine ? "ONLINE" : "OFFLINE";
    s.style.color = navigator.onLine ? "#2ecc71" : "#e74c3c";
  }
}

// ─── Escape для HTML ───────────────────────────────────────────
function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── CSS, добавляемый динамически ─────────────────────────────
function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .tab-add { background: #f0f4ff; border-style: dashed; }
    .card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    .pos-badge { font-size:12px; padding:3px 8px; border-radius:20px; }
    .badge-ok      { background:#d5f5e3; color:#1e8449; }
    .badge-nok     { background:#fadbd8; color:#a93226; }
    .badge-pending { background:#fef9e7; color:#b7950b; }
    .row2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .status-row { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
    .btn-ok, .btn-nok, .btn-na {
      padding:8px 14px; border:2px solid #ccc; border-radius:8px;
      background:#fff; cursor:pointer; font-size:14px; font-weight:bold;
    }
    .active-ok  { background:#d5f5e3; border-color:#1e8449; }
    .active-nok { background:#fadbd8; border-color:#a93226; }
    .active-na  { background:#eaf2ff; border-color:#2980b9; }
    .defect-block { margin-top:8px; padding:10px; background:#fff8f8; border-radius:8px; border:1px solid #f5c6cb; }
    .level-row { display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; }
    .level-lbl { display:flex; align-items:center; gap:4px; cursor:pointer; font-size:14px; }
    .photo-btn {
      display:inline-block; margin-top:8px; padding:8px 14px;
      background:#f0f4ff; border:1px dashed #90a4d4; border-radius:8px;
      cursor:pointer; font-size:14px;
    }
    .photo-wrap { position:relative; display:inline-block; }
    .photoPreview img { width:80px; height:80px; object-fit:cover; border-radius:8px; border:1px solid #ccc; cursor:zoom-in; }
    .photo-del {
      position:absolute; top:2px; right:2px; background:rgba(0,0,0,.55);
      color:#fff; border:none; border-radius:50%; width:20px; height:20px;
      font-size:11px; cursor:pointer; line-height:20px; text-align:center; padding:0;
    }
    .req { color:#e74c3c; }
    .hint { font-size:12px; color:#888; margin:2px 0 6px; }
    .btn-secondary { background:#eee; color:#333; }
    .btn-danger    { background:#fadbd8; color:#a93226; }
    .lightbox {
      position:fixed; inset:0; background:rgba(0,0,0,.85);
      display:flex; align-items:center; justify-content:center; z-index:9999;
    }
    .lightbox img { max-width:95vw; max-height:90vh; border-radius:8px; }
    .lb-close {
      position:fixed; top:16px; right:16px; background:#fff; border:none;
      border-radius:50%; width:36px; height:36px; font-size:20px; cursor:pointer;
    }
    .toast {
      position:fixed; bottom:20px; left:50%; transform:translateX(-50%) translateY(40px);
      background:#333; color:#fff; padding:10px 20px; border-radius:30px;
      font-size:14px; opacity:0; transition:all .3s; z-index:9998; pointer-events:none;
    }
    .toast-show { opacity:1; transform:translateX(-50%) translateY(0); }
    .btn-toolbar {
      display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;
    }
    .btn-toolbar .btn { width:auto; flex:1; min-width:120px; }
  `;
  document.head.appendChild(style);
}

// ─── Тулбар под основными кнопками ─────────────────────────────
function injectToolbar() {
  const toolbar = ce("div", "card btn-toolbar");
  toolbar.innerHTML = `
    <button class="btn btn-secondary" id="exportJsonBtn">💾 Экспорт JSON</button>
    <button class="btn btn-secondary" id="resetBtn">🔄 Новая сессия</button>
  `;
  // вставляем после кнопок
  const addBtn = el("addPositionBtn");
  addBtn.parentNode.insertBefore(toolbar, addBtn.nextSibling.nextSibling.nextSibling);

  el("exportJsonBtn").addEventListener("click", exportJSON);
  el("resetBtn").addEventListener("click", resetSession);
}

// ─── Точка входа ───────────────────────────────────────────────
(function init() {
  injectStyles();
  loadState();
  initHeader();
  injectToolbar();

  el("addPositionBtn").addEventListener("click",  addPosition);
  el("createActBtn").addEventListener("click",    createAct);
  el("sendReportBtn").addEventListener("click",   sendReport);

  window.addEventListener("online",  updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  updateOnlineStatus();

  renderTabs();
  renderPosition();
})();
