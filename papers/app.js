// Lite Docs — no-backend, single-user editor
// NOTE: This is an approximation of a Docs-like editor for offline/local use.
// It supports rich text, comments, "suggesting" highlights, local history, and export.

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const page = $("#page");
const titleInput = $("#docTitle");
const autosaveStatus = $("#autosaveStatus");

let state = {
  id: localStorage.getItem("liteDocs.currentId") || crypto.randomUUID(),
  suggestMode: false,
  history: [], // {time, title, html}
  comments: [] // {id, anchorPath, text, time}
};

// ---------- Persistence ----------
function saveSnapshot(source="auto"){
  const snap = {
    time: Date.now(),
    title: titleInput.value.trim() || "Untitled document",
    html: page.innerHTML
  };
  state.history.push(snap);
  localStorage.setItem(`liteDocs.doc.${state.id}`, JSON.stringify({
    id: state.id, title: snap.title, html: snap.html, history: state.history, comments: state.comments
  }));
  localStorage.setItem("liteDocs.currentId", state.id);
  autosaveStatus.textContent = source === "auto" ? "Saved" : `Saved (${source})`;
}
function loadCurrent(){
  const raw = localStorage.getItem(`liteDocs.doc.${state.id}`);
  if(raw){
    try{
      const data = JSON.parse(raw);
      state = {...state, ...data};
      titleInput.value = data.title || "Untitled document";
      page.innerHTML = data.html || "";
      state.comments = data.comments || [];
      renderComments();
      updateWordCount();
    }catch(e){ console.error(e); }
  }else{
    // initial content
    page.innerHTML = `<p style="font-size:24px; font-weight:700; margin-bottom:16px;">${escapeHtml(titleInput.value)}</p>
<p>Start typing… Use the toolbar above for formatting, insert images, tables, links, and more.</p>`;
    saveSnapshot("init");
  }
}
function newDocument(){
  state = { id: crypto.randomUUID(), suggestMode: false, history: [], comments: [] };
  titleInput.value = "Untitled document";
  page.innerHTML = "";
  saveSnapshot("new");
}

function openFromFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      state = { ...state, ...data };
      titleInput.value = data.title || "Untitled document";
      page.innerHTML = data.html || "";
      renderComments();
      saveSnapshot("open");
    }catch(e){
      alert("Invalid file.");
    }
  };
  reader.readAsText(file);
}

function exportHTML(){
  const html = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(titleInput.value)}</title>${page.innerHTML}`;
  const blob = new Blob([html], {type:"text/html"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeFileName(titleInput.value)}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadJSON(){
  const doc = {
    id: state.id,
    title: titleInput.value.trim() || "Untitled document",
    html: page.innerHTML,
    history: state.history,
    comments: state.comments
  };
  const blob = new Blob([JSON.stringify(doc,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeFileName(titleInput.value)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Toolbar actions ----------
function exec(cmd, value=null){
  document.execCommand(cmd, false, value);
  updateWordCount();
  saveDebounced();
}

function applyFontFamily(f){
  if(f === "default") return;
  document.execCommand("fontName", false, f);
  saveDebounced();
}
function applyFontSize(px){
  document.execCommand("fontSize", false, "7"); // set largest, then shrink via span
  $$("font[size='7']").forEach(el => {
    const span = document.createElement("span");
    span.style.fontSize = px+"px";
    span.innerHTML = el.innerHTML;
    el.replaceWith(span);
  });
  saveDebounced();
}
function applyLineHeight(h){
  wrapBlockWithStyle("line-height", h);
  saveDebounced();
}
function setTextColor(color){ document.execCommand("foreColor", false, color); saveDebounced(); }
function setHighlight(color){
  const sel = document.getSelection();
  if(!sel.rangeCount) return;
  const span = document.createElement("span");
  span.style.backgroundColor = color;
  wrapRange(sel.getRangeAt(0), span);
  saveDebounced();
}

function insertLink(){
  const url = prompt("Enter URL:");
  if(!url) return;
  document.execCommand("createLink", false, url);
  saveDebounced();
}

function insertImage(file){
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(img.src); };
    img.src = reader.result;
    img.style.maxWidth = "100%";
    insertNodeAtCaret(img);
    saveDebounced();
  };
  reader.readAsDataURL(file);
}

function insertTable(rows=3, cols=3){
  const table = document.createElement("table");
  table.style.borderCollapse = "collapse";
  table.style.width = "100%";
  table.style.margin = "8px 0";
  for(let r=0;r<rows;r++){
    const tr = document.createElement("tr");
    for(let c=0;c<cols;c++){
      const td = document.createElement("td");
      td.contentEditable = "true";
      td.style.border = "1px solid #ddd";
      td.style.padding = "6px";
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  insertNodeAtCaret(table);
  saveDebounced();
}

function insertPageBreak(){
  const hr = document.createElement("hr");
  hr.className = "page-break";
  insertNodeAtCaret(hr);
  saveDebounced();
}

function toggleCheckList(){
  // naive: toggle list and add checkboxes
  document.execCommand("insertUnorderedList");
  // add checkboxes to list items
  const sel = document.getSelection();
  if(!sel.rangeCount) return;
  const li = findClosest(sel.anchorNode, "LI");
  if(!li) return;
  const ul = li.closest("ul");
  ul.querySelectorAll("li").forEach(li => {
    if(!li.querySelector("input[type='checkbox']")){
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.style.marginRight = "6px";
      li.prepend(cb);
    }
  });
  saveDebounced();
}

// ---------- Suggesting + Comments ----------
function toggleSuggestMode(on){
  state.suggestMode = on;
  $("#toggleSuggest").checked = on;
}

function wrapSelectionSuggest(){
  const sel = document.getSelection();
  if(!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if(range.collapsed) return;
  const span = document.createElement("span");
  span.className = "suggest";
  wrapRange(range, span);
  saveDebounced();
}

function addComment(){
  const sel = document.getSelection();
  if(!sel.rangeCount) return;
  if(sel.isCollapsed){
    alert("Select text to comment on.");
    return;
  }
  const range = sel.getRangeAt(0);
  // anchor is a path to the start container (rough)
  const anchorPath = getNodePath(range.startContainer);
  const text = prompt("Comment:");
  if(!text) return;
  const item = { id: crypto.randomUUID(), anchorPath, text, time: Date.now() };
  state.comments.push(item);

  // visually mark selection
  const mark = document.createElement("mark");
  mark.dataset.commentId = item.id;
  wrapRange(range, mark);

  renderComments();
  saveDebounced();
}

function renderComments(){
  const list = $("#commentList");
  list.innerHTML = "";
  state.comments.forEach(c => {
    const div = document.createElement("div");
    div.className = "comment";
    div.innerHTML = `<div>${escapeHtml(c.text)}</div>
      <small>${new Date(c.time).toLocaleString()}</small>
      <div style="display:flex; gap:6px;">
        <button data-action="jump" data-id="${c.id}">Jump</button>
        <button data-action="delete" data-id="${c.id}">Delete</button>
      </div>`;
    list.appendChild(div);
  });
}

$("#commentList").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if(!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if(action === "delete"){
    state.comments = state.comments.filter(c => c.id !== id);
    $$(`mark[data-comment-id="${id}"]`).forEach(el => el.replaceWith(...el.childNodes));
    renderComments();
    saveDebounced();
  }else if(action === "jump"){
    const mark = $(`mark[data-comment-id="${id}"]`);
    if(mark){
      mark.scrollIntoView({behavior:"smooth", block:"center"});
      mark.animate([{outline:"2px solid #2563eb"}, {outline:"0"}], {duration:1000});
    }
  }
});

// ---------- Find & Replace ----------
function openFind(){
  $("#dlgFindReplace").showModal();
  $("#findText").focus();
}
function findNext(){
  const needle = $("#findText").value;
  if(!needle) return;
  const range = document.createRange();
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, null);
  let node;
  while((node = walker.nextNode())){
    const idx = node.data.toLowerCase().indexOf(needle.toLowerCase());
    if(idx !== -1){
      range.setStart(node, idx);
      range.setEnd(node, idx + needle.length);
      const sel = document.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      page.focus();
      break;
    }
  }
}
function replaceOnce(){
  const replace = $("#replaceText").value ?? "";
  const sel = document.getSelection();
  if(sel.rangeCount){
    document.execCommand("insertText", false, replace);
  }
  saveDebounced();
}
function replaceAll(){
  const needle = $("#findText").value ?? "";
  const replace = $("#replaceText").value ?? "";
  if(!needle) return;
  page.innerHTML = page.innerHTML.replaceAll(new RegExp(escapeRegExp(needle), "gi"), replace);
  saveDebounced();
}

// ---------- History ----------
function openHistory(){
  $("#dlgHistory").showModal();
  const list = $("#historyList");
  list.innerHTML = "";
  state.history.slice().reverse().forEach(snap => {
    const div = document.createElement("div");
    div.className = "comment";
    div.innerHTML = `<div><strong>${escapeHtml(snap.title)}</strong></div>
      <small>${new Date(snap.time).toLocaleString()}</small>
      <div style="display:flex; gap:6px;">
        <button data-time="${snap.time}">Restore</button>
      </div>`;
    list.appendChild(div);
  });
}

$("#historyList").addEventListener("click", e => {
  const btn = e.target.closest("button[data-time]");
  if(!btn) return;
  const time = Number(btn.dataset.time);
  const snap = state.history.find(s => s.time === time);
  if(snap){
    titleInput.value = snap.title;
    page.innerHTML = snap.html;
    saveSnapshot("restore");
    $("#dlgHistory").close();
  }
});

// ---------- Page setup ----------
function openPageSetup(){
  $("#dlgPage").showModal();
}
function applyPageSetup(){
  const size = $("#pageSize").value;
  const dims = size === "a4" ? {w: 793, h: 1122} : {w: 816, h: 1056}; // approx px @96dpi
  $(".page").style.width = dims.w + "px";
  $(".page").style.minHeight = dims.h + "px";

  const mt = parseFloat($("#marginTop").value) * 96;
  const mr = parseFloat($("#marginRight").value) * 96;
  const mb = parseFloat($("#marginBottom").value) * 96;
  const ml = parseFloat($("#marginLeft").value) * 96;
  $(".page").style.padding = `${mt}px ${mr}px ${mb}px ${ml}px`;
  saveDebounced();
}

// ---------- Utilities ----------
function wrapRange(range, wrapper){
  wrapper.append(range.extractContents());
  range.insertNode(wrapper);
}
function wrapBlockWithStyle(prop, value){
  const sel = document.getSelection();
  if(!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const block = findClosest(range.startContainer, ".page") ? findClosest(range.startContainer, "P") || findClosest(range.startContainer, "DIV") : null;
  if(block){
    block.style[prop] = value;
  }else{
    document.execCommand("formatBlock", false, "p");
    const p = findClosest(document.getSelection().anchorNode, "P");
    if(p) p.style[prop] = value;
  }
}
function findClosest(node, selector){
  if(!node) return null;
  return (node.nodeType === 1 ? node : node.parentElement)?.closest(selector) || null;
}
function insertNodeAtCaret(node){
  const sel = document.getSelection();
  if(!sel.rangeCount){
    page.appendChild(node);
    return;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
}
function escapeHtml(str){
  return str.replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function escapeRegExp(str){ return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function safeFileName(name){ return name.replace(/[^\w\-]+/g,'_').slice(0,64) || "document"; }

let saveTimer;
function saveDebounced(){
  autosaveStatus.textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSnapshot("auto"), 500);
}

function updateWordCount(){
  const text = page.innerText.trim();
  const words = text ? text.split(/\s+/).length : 0;
  $("#wordCount").textContent = `${words} word${words===1?'':'s'}`;
}

// ---------- Events ----------
window.addEventListener("DOMContentLoaded", () => {
  loadCurrent();
  page.addEventListener("input", () => { updateWordCount(); saveDebounced(); });
  page.addEventListener("keydown", e => {
    if(state.suggestMode && (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete")){
      // wrap recent change
      setTimeout(wrapSelectionSuggest, 0);
    }
  });
});

// Toolbar bindings
$("#toolbar").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if(!btn) return;
  const cmd = btn.dataset.cmd;
  if(cmd){ exec(cmd); }
});

$("#fontFamily").addEventListener("change", e => applyFontFamily(e.target.value));
$("#fontSize").addEventListener("change", e => applyFontSize(Number(e.target.value)));
$("#lineHeight").addEventListener("change", e => applyLineHeight(Number(e.target.value)));

$("#btnTextColor").addEventListener("click", () => $("#inputTextColor").click());
$("#inputTextColor").addEventListener("change", e => setTextColor(e.target.value));
$("#btnHighlight").addEventListener("click", () => $("#inputHighlight").click());
$("#inputHighlight").addEventListener("change", e => setHighlight(e.target.value));

$("#btnLink").addEventListener("click", insertLink);
$("#btnImage").addEventListener("click", () => $("#inputImage").click());
$("#inputImage").addEventListener("change", e => e.target.files[0] && insertImage(e.target.files[0]));
$("#btnTable").addEventListener("click", () => {
  const r = Number(prompt("Rows?", "3") || 3);
  const c = Number(prompt("Cols?", "3") || 3);
  if(r>0 && c>0) insertTable(r,c);
});
$("#btnPageBreak").addEventListener("click", insertPageBreak);
$("#btnFindReplace").addEventListener("click", openFind);
$("#btnComment").addEventListener("click", addComment);
$("#btnCheckList").addEventListener("click", toggleCheckList);

$("#toggleSuggest").addEventListener("change", e => toggleSuggestMode(e.target.checked));
$("#btnUndo").addEventListener("click", () => document.execCommand("undo"));
$("#btnRedo").addEventListener("click", () => document.execCommand("redo"));

$("#btnNew").addEventListener("click", newDocument);
$("#btnOpen").addEventListener("click", () => $("#inputOpen").click());
$("#inputOpen").addEventListener("change", e => e.target.files[0] && openFromFile(e.target.files[0]));
$("#btnSave").addEventListener("click", downloadJSON);
$("#btnExportHTML").addEventListener("click", exportHTML);
$("#btnPrint").addEventListener("click", () => window.print());
$("#btnHistory").addEventListener("click", openHistory);
$("#btnSettings").addEventListener("click", openPageSetup);
$("#btnApplyPage").addEventListener("click", applyPageSetup);

// Find/Replace dialog buttons
$("#btnFindNext").addEventListener("click", (e) => { e.preventDefault(); findNext(); });
$("#btnReplace").addEventListener("click", (e) => { e.preventDefault(); replaceOnce(); });
$("#btnReplaceAll").addEventListener("click", (e) => { e.preventDefault(); replaceAll(); });

// Title change
titleInput.addEventListener("input", saveDebounced);

// Keyboard shortcuts
document.addEventListener("keydown", e => {
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s"){ e.preventDefault(); downloadJSON(); }
  if((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f"){ e.preventDefault(); openFind(); }
  if(e.ctrlKey && e.altKey && e.key.toLowerCase() === "n"){ e.preventDefault(); newDocument(); }
});

// Drag-drop images
page.addEventListener("dragover", e => e.preventDefault());
page.addEventListener("drop", e => {
  e.preventDefault();
  const file = e.dataTransfer.files?.[0];
  if(file && file.type.startsWith("image/")) insertImage(file);
});

// ---------- Done ----------
console.log("Lite Docs ready.");
