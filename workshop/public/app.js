const state = {
  clientId: localStorage.getItem("acme-workshop-client") || crypto.randomUUID(),
  currentStage: Number(localStorage.getItem("acme-current-stage") || 0),
  results: null,
};
localStorage.setItem("acme-workshop-client", state.clientId);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const stages = $$(".stage");
const shortStageLabels = ["Start", "Attio", "Baseline", "Audit", "Build", "Verify", "Reflect"];

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 1800);
}

function value(form, name) {
  return new FormData(form).get(name)?.toString() || "";
}

function savedFeedback(stage) {
  return localStorage.getItem(`acme-feedback-${stage}`);
}

function surveyReady(stage) {
  if (stage === "starting-survey") return Boolean(localStorage.getItem("acme-survey-start"));
  if (stage === "final-survey") return Boolean(localStorage.getItem("acme-survey-end"));
  return true;
}

function updateStageControls(stageElement) {
  const ready = surveyReady(stageElement.dataset.stage);
  const outcome = savedFeedback(stageElement.dataset.stage);
  $$(".feedback-button", stageElement).forEach((button) => {
    button.disabled = !ready;
    button.classList.toggle("selected", button.dataset.outcome === outcome);
  });
  const next = $(".next-stage", stageElement);
  if (next) next.disabled = stageElement.dataset.stage === "starting-survey" ? !ready : !outcome;
  const complete = $(".deck-complete", stageElement);
  if (complete) complete.hidden = stageElement.dataset.stage === "final-survey" ? !ready : !outcome;
  const hint = $(".feedback-hint", stageElement);
  if (hint) hint.textContent = ready ? "Choose one to continue." : "Submit the survey first.";
}

function showStage(index, focus = false) {
  state.currentStage = Math.max(0, Math.min(index, stages.length - 1));
  localStorage.setItem("acme-current-stage", String(state.currentStage));
  stages.forEach((stage, stageIndex) => { stage.hidden = stageIndex !== state.currentStage; });
  const current = stages[state.currentStage];
  $("#progress-label").textContent = `Stage ${state.currentStage + 1} of ${stages.length} · ${current.dataset.title}`;
  $$(".progress-link").forEach((button, index) => {
    const active = index === state.currentStage;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  document.title = `${current.dataset.title} · AI in GTM`;
  updateStageControls(current);
  if (focus) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    current.focus({ preventScroll: true });
  }
}

async function saveFeedback(stageElement, outcome) {
  const stage = stageElement.dataset.stage;
  const buttons = $$(".feedback-button", stageElement);
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const response = await fetch("/ai-in-gtm-class/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: state.clientId, stage, outcome }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save your check-in.");
    localStorage.setItem(`acme-feedback-${stage}`, outcome);
    updateStageControls(stageElement);
    toast(outcome === "worked" ? "Marked as working" : "Marked as blocked");
  } catch (error) {
    buttons.forEach((button) => { button.disabled = false; });
    toast(error.message);
  }
}

function setupDeck() {
  const progressLinks = $("#progress-links");
  progressLinks.replaceChildren(...stages.map((stage, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "progress-link";
    button.textContent = shortStageLabels[index];
    button.title = `Stage ${index + 1}: ${stage.dataset.title}`;
    button.setAttribute("aria-label", `Go to stage ${index + 1}: ${stage.dataset.title}`);
    button.addEventListener("click", () => showStage(index, true));
    return button;
  }));
  stages.forEach((stage, index) => {
    stage.tabIndex = -1;
    const promptActions = $(".prompt-actions", stage);
    if (promptActions) promptActions.insertAdjacentHTML("afterend", '<div class="stage-divider"></div>');
    const checkin = ["starting-survey", "final-survey"].includes(stage.dataset.stage) ? "" : `
      <section class="stage-checkin" aria-label="Stage feedback">
        <div><strong>Did this work for you?</strong><span class="feedback-hint"></span></div>
        <div class="feedback-buttons">
          <button class="feedback-button worked" type="button" data-outcome="worked" aria-label="Yes, this worked"><span aria-hidden="true">✓</span> Worked</button>
          <button class="feedback-button blocked" type="button" data-outcome="blocked" aria-label="No, I am blocked"><span aria-hidden="true">×</span> I’m blocked</button>
        </div>
      </section>`;
    stage.insertAdjacentHTML("beforeend", `
      ${checkin}
      <nav class="deck-actions" aria-label="Stage navigation">
        <button class="button back-stage" type="button" ${index === 0 ? "disabled" : ""}>Back</button>
        ${index < stages.length - 1 ? '<button class="button primary next-stage" type="button">Continue</button>' : '<span class="deck-complete">You’re done. Thank you.</span>'}
      </nav>
    `);
    $$(".feedback-button", stage).forEach((button) => button.addEventListener("click", () => saveFeedback(stage, button.dataset.outcome)));
    $(".back-stage", stage).addEventListener("click", () => showStage(index - 1, true));
    const next = $(".next-stage", stage);
    if (next) next.addEventListener("click", () => showStage(index + 1, true));
    updateStageControls(stage);
  });
  if (!Number.isInteger(state.currentStage) || state.currentStage < 0 || state.currentStage >= stages.length) state.currentStage = 0;
  showStage(state.currentStage);
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
    const response = await fetch(`/ai-in-gtm-class/api/survey/${phase}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save your response.");
    localStorage.setItem(`acme-survey-${phase}`, JSON.stringify(payload));
    status.textContent = phase === "start" ? "Starting point saved. Continue when the class is ready." : "Final reflection saved. You’re done—thank you.";
    button.textContent = "Saved ✓";
    updateStageControls(form.closest(".stage"));
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

async function copyText(text, button) {
  await navigator.clipboard.writeText(text);
  const original = button.textContent;
  button.textContent = "Copied ✓";
  button.classList.add("copied");
  toast("Prompt copied");
  setTimeout(() => { button.textContent = original; button.classList.remove("copied"); }, 1600);
}

function setupPrompts() {
  $$(".prompt-card").forEach((card) => {
    $(".copy-button", card).addEventListener("click", (event) => copyText($(".prompt-text", card).textContent.trim(), event.currentTarget));
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

function renderBars(selector, rows = []) {
  const root = $(selector);
  if (!root) return;
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

function renderResults(data) {
  state.results = data;
  renderBars("#student-familiarity-chart", data.start.familiarity.map((row) => ({ ...row, label: `Level ${row.label}` })));
  renderBars("#student-tools-chart", data.start.tools);
  $$(".last-updated").forEach((element) => { element.textContent = `Updated ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`; });
}

async function loadResults() {
  try {
    const response = await fetch("/ai-in-gtm-class/api/results", { cache: "no-store" });
    if (!response.ok) throw new Error("Results unavailable");
    renderResults(await response.json());
  } catch {
    $$(".last-updated").forEach((element) => { element.textContent = "Reconnecting…"; });
  }
}

function init() {
  const startForm = $("#start-form");
  const endForm = $("#end-form");
  restoreForm(startForm, "start");
  restoreForm(endForm, "end");
  startForm.addEventListener("submit", (event) => { event.preventDefault(); submitSurvey(startForm, "start"); });
  endForm.addEventListener("submit", (event) => { event.preventDefault(); submitSurvey(endForm, "end"); });
  setupPrompts();
  setupToolChoices();
  setupDeck();
  loadResults();
  setInterval(loadResults, 3000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadResults(); });
}

init();
