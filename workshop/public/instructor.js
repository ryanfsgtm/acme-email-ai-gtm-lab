const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 1600);
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
  legend.innerHTML = '<span><i class="legend-start"></i>Start</span><span><i class="legend-end"></i>End</span>';
  root.replaceChildren(...groups, legend);
}

const stageLabels = new Map([
  ["starting-survey", "Starting survey"],
  ["attio-setup", "Attio setup"],
  ["naive-summary", "Naive summary"],
  ["coverage-audit", "Coverage audit"],
  ["build-system", "Build the system"],
  ["verify-system", "Verify the system"],
  ["final-survey", "Final reflection"],
]);

function renderPace(data, classSize) {
  const values = new Map((data.stages || []).map((row) => [row.stage, row]));
  const rows = [...stageLabels].map(([stage, label]) => {
    const value = values.get(stage) || { worked: 0, blocked: 0, responses: 0 };
    const worked = Number(value.worked || 0);
    const blocked = Number(value.blocked || 0);
    const workedPercent = classSize ? Math.round((worked / classSize) * 100) : 0;
    const blockedPercent = classSize ? Math.round((blocked / classSize) * 100) : 0;
    const row = document.createElement("div");
    row.className = "pace-row";
    const status = workedPercent >= 80 ? "on-pace" : value.responses ? "below-pace" : "waiting";
    row.innerHTML = `
      <div class="pace-label"><strong>${label}</strong><span>${value.responses}/${classSize} checked in</span></div>
      <div class="pace-track" aria-label="${label}: ${workedPercent}% worked, ${blockedPercent}% blocked">
        <span class="pace-target" aria-hidden="true"></span>
        <span class="pace-success" style="width:${Math.min(workedPercent, 100)}%"></span>
        <span class="pace-blocked" style="left:${Math.min(workedPercent, 100)}%;width:${Math.min(blockedPercent, Math.max(0, 100 - workedPercent))}%"></span>
      </div>
      <strong class="pace-percent ${status}">${workedPercent}%</strong>
    `;
    return row;
  });
  $("#pace-chart").replaceChildren(...rows);
}

function renderResults(data) {
  const startCount = Number(data.counts.start || 0);
  const endCount = Number(data.counts.end || 0);
  $("#metric-start").textContent = startCount;
  $("#metric-end").textContent = endCount;
  $("#metric-paired").textContent = data.paired?.paired_count || 0;
  const delta = data.paired?.confidence_delta;
  $("#metric-confidence").textContent = delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`;
  renderPace(data, startCount);
  renderComparison(data);
  renderBars("#tools-chart", data.start.tools);
  renderBars("#roles-chart", data.start.roles);
  renderBars("#change-chart", data.end.changes);
  renderBars("#valuable-chart", data.end.valuable);
  $$(".last-updated").forEach((element) => {
    element.textContent = `Updated ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
  });
}

async function loadResults() {
  try {
    const response = await fetch("/ai-in-gtm-class/api/results", { cache: "no-store" });
    if (!response.ok) throw new Error();
    renderResults(await response.json());
  } catch {
    $$(".last-updated").forEach((element) => { element.textContent = "Reconnecting…"; });
  }
}

const studentUrl = `${location.origin}/ai-in-gtm-class`;
$("#student-url").textContent = studentUrl;
$("#copy-url").addEventListener("click", async () => {
  await navigator.clipboard.writeText(studentUrl);
  toast("Student URL copied");
});
loadResults();
setInterval(loadResults, 3000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadResults(); });
