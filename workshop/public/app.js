const state = {
  clientId: localStorage.getItem("acme-workshop-client") || crypto.randomUUID(),
  results: null,
  poll: null,
};
localStorage.setItem("acme-workshop-client", state.clientId);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 1800);
}

function currentView() {
  return new URLSearchParams(location.search).get("view") === "instructor" ? "instructor" : "student";
}

function configureView() {
  const view = currentView();
  $("#student-view").hidden = view !== "student";
  $("#instructor-view").hidden = view !== "instructor";
  $$('[data-view-link]').forEach((link) => link.classList.toggle("active", link.dataset.viewLink === view));
  document.title = view === "instructor" ? "Instructor · AI in GTM Coding Agent Lab" : "AI in GTM · Coding Agent Lab";
  const studentUrl = `${location.origin}/`;
  $("#student-url").textContent = studentUrl;
}

function value(form, name) {
  return new FormData(form).get(name)?.toString() || "";
}

async function submitSurvey(form, phase) {
  const status = $(".form-status", form);
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const payload = {
    clientId: state.clientId,
    familiarity: Number(data.get("familiarity")),
    confidence: Number(data.get("confidence")),
  };
  if (phase === "start") {
    payload.role = value(form, "role");
    payload.tools = data.getAll("tools").map(String);
    payload.goal = value(form, "goal");
    if (!payload.tools.length) {
      status.textContent = "Choose at least one tool option.";
      status.classList.add("error");
      return;
    }
  } else {
    payload.confidenceChange = value(form, "confidenceChange");
    payload.likelyUse = Number(data.get("likelyUse"));
    payload.mostValuable = value(form, "mostValuable");
    payload.takeaway = value(form, "takeaway");
  }
  const button = $("button[type=submit]", form);
  button.disabled = true;
  status.classList.remove("error");
  status.textContent = "Saving…";
  try {
    const response = await fetch(`/api/survey/${phase}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save your response.");
    localStorage.setItem(`acme-survey-${phase}`, JSON.stringify(payload));
    status.textContent = phase === "start" ? "Starting point saved. You can update it anytime." : "Final reflection saved. Thank you.";
    button.textContent = "Saved ✓";
    toast("Response saved");
    await loadResults();
  } catch (error) {
    status.classList.add("error");
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function restoreForm(form, phase) {
  const saved = localStorage.getItem(`acme-survey-${phase}`);
  if (!saved) return;
  try {
    const payload = JSON.parse(saved);
    for (const [name, inputValue] of Object.entries(payload)) {
      if (name === "clientId") continue;
      if (Array.isArray(inputValue)) {
        inputValue.forEach((item) => {
          const input = $$(`[name="${name}"]`, form).find((element) => element.value === item);
          if (input) input.checked = true;
        });
      } else {
        const inputs = $$(`[name="${name}"]`, form);
        const matching = inputs.find((element) => element.value === String(inputValue));
        if (matching && (matching.type === "radio" || matching.type === "checkbox")) matching.checked = true;
        else if (inputs[0]) inputs[0].value = inputValue;
      }
    }
    $(".form-status", form).textContent = "Your saved response is shown below.";
  } catch {}
}

async function copyText(text, button, success = "Copied") {
  await navigator.clipboard.writeText(text);
  const original = button.textContent;
  button.textContent = `${success} ✓`;
  button.classList.add("copied");
  toast(success);
  setTimeout(() => { button.textContent = original; button.classList.remove("copied"); }, 1600);
}

function setupPrompts() {
  $$(".prompt-card").forEach((card) => {
    const step = card.dataset.step;
    const checkbox = $(".step-check", card);
    checkbox.checked = localStorage.getItem(`acme-step-${step}`) === "done";
    card.classList.toggle("done", checkbox.checked);
    if (checkbox.checked) $(".step-state", card).textContent = "Complete";
    checkbox.addEventListener("change", () => {
      localStorage.setItem(`acme-step-${step}`, checkbox.checked ? "done" : "");
      card.classList.toggle("done", checkbox.checked);
      $(".step-state", card).textContent = checkbox.checked ? "Complete" : card.dataset.step === "1" ? "Start here" : "Ready";
    });
    $(".copy-button", card).addEventListener("click", (event) => copyText($(".prompt-text", card).textContent.trim(), event.currentTarget, "Prompt copied"));
  });
}

function setupToolChoices() {
  const boxes = $$('[name="tools"]');
  boxes.forEach((box) => box.addEventListener("change", () => {
    if (box.value === "None yet" && box.checked) boxes.filter((other) => other !== box).forEach((other) => { other.checked = false; });
    if (box.value !== "None yet" && box.checked) {
      const none = boxes.find((other) => other.value === "None yet");
      if (none) none.checked = false;
    }
  }));
}

function rowsMap(rows = []) {
  return new Map(rows.map((row) => [String(row.label), Number(row.count)]));
}

function renderBars(selector, rows = []) {
  const root = $(selector);
  if (!rows.length) {
    root.innerHTML = '<div class="empty-chart">Waiting for responses…</div>';
    return;
  }
  const max = Math.max(...rows.map((row) => Number(row.count)), 1);
  root.replaceChildren(...rows.sort((a, b) => Number(b.count) - Number(a.count)).map((row) => {
    const element = document.createElement("div");
    element.className = "bar-row";
    const label = document.createElement("span");
    label.textContent = row.label;
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(Number(row.count) / max) * 100}%`;
    track.append(fill);
    const count = document.createElement("span");
    count.className = "bar-count";
    count.textContent = row.count;
    element.append(label, track, count);
    return element;
  }));
}

function renderComparison(data) {
  const root = $("#familiarity-chart");
  const start = rowsMap(data.start.familiarity);
  const end = rowsMap(data.end.familiarity);
  const max = Math.max(...start.values(), ...end.values(), 1);
  const groups = [1, 2, 3, 4, 5].map((score) => {
    const group = document.createElement("div");
    group.className = "compare-group";
    for (const [kind, values] of [["start", start], ["end", end]]) {
      const bar = document.createElement("div");
      bar.className = `compare-bar ${kind}`;
      const count = values.get(String(score)) || 0;
      bar.style.height = `${Math.max(2, (count / max) * 170)}px`;
      const label = document.createElement("span");
      label.textContent = count;
      bar.append(label);
      group.append(bar);
    }
    const scoreLabel = document.createElement("div");
    scoreLabel.className = "compare-label";
    scoreLabel.textContent = score;
    group.append(scoreLabel);
    return group;
  });
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.innerHTML = '<span><i style="background:#b8bcb9"></i>Start</span><span><i style="background:#0b6b4f"></i>End</span>';
  root.replaceChildren(...groups, legend);
}

function renderResults(data) {
  state.results = data;
  const startCount = Number(data.counts.start || 0);
  const endCount = Number(data.counts.end || 0);
  $("#response-count").textContent = startCount ? `${startCount} ${startCount === 1 ? "person has" : "people have"} checked in` : "Waiting for the room…";
  $("#metric-start").textContent = startCount;
  $("#metric-end").textContent = endCount;
  $("#metric-paired").textContent = data.paired?.paired_count || 0;
  const delta = data.paired?.confidence_delta;
  $("#metric-confidence").textContent = delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`;
  renderComparison(data);
  renderBars("#student-familiarity-chart", data.start.familiarity.map((row) => ({ ...row, label: `Level ${row.label}` })));
  renderBars("#student-tools-chart", data.start.tools);
  renderBars("#tools-chart", data.start.tools);
  renderBars("#roles-chart", data.start.roles);
  renderBars("#change-chart", data.end.changes);
  renderBars("#valuable-chart", data.end.valuable);
  $$(".last-updated").forEach((element) => { element.textContent = `Updated ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`; });
}

async function loadResults() {
  try {
    const response = await fetch("/api/results", { cache: "no-store" });
    if (!response.ok) throw new Error("Results unavailable");
    renderResults(await response.json());
  } catch {
    if (currentView() === "instructor") $$(".last-updated").forEach((element) => { element.textContent = "Reconnecting…"; });
  }
}

function init() {
  configureView();
  const startForm = $("#start-form");
  const endForm = $("#end-form");
  restoreForm(startForm, "start");
  restoreForm(endForm, "end");
  startForm.addEventListener("submit", (event) => { event.preventDefault(); submitSurvey(startForm, "start"); });
  endForm.addEventListener("submit", (event) => { event.preventDefault(); submitSurvey(endForm, "end"); });
  setupPrompts();
  setupToolChoices();
  $("#copy-url").addEventListener("click", (event) => copyText(`${location.origin}/`, event.currentTarget, "Student link copied"));
  loadResults();
  state.poll = setInterval(loadResults, 3000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadResults();
  });
}

init();
