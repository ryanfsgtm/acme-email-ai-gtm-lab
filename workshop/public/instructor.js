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
  ["attio-setup", "Attio setup"],
  ["seed-attio", "Seed Attio"],
  ["naive-summary", "Naive summary"],
  ["coverage-audit", "Coverage audit"],
  ["design-prompt", "Design the prompt"],
  ["build-system", "Build the system"],
  ["verify-system", "Verify the system"],
]);

function renderPace(data, classSize) {
  const values = new Map((data.stages || []).map((row) => [row.stage, row]));
  const rows = [...stageLabels].map(([stage, label]) => {
    const value = values.get(stage) || { worked: 0, blocked: 0, responses: 0 };
    const worked = Number(value.worked || 0);
    const blocked = Number(value.blocked || 0);
    const workedPercent = classSize ? Math.round((worked / classSize) * 100) : 0;
    const blockedPercent = classSize ? Math.round((blocked / classSize) * 100) : 0;
    const workedWidth = Math.min(workedPercent, 100);
    const blockedWidth = Math.min(blockedPercent, Math.max(0, 100 - workedWidth));
    const row = document.createElement("div");
    row.className = "pace-row";
    const status = workedPercent >= 80 ? "on-pace" : value.responses ? "below-pace" : "waiting";
    row.innerHTML = `
      <div class="pace-label"><strong>${label}</strong><span>${value.responses}/${classSize} checked in</span></div>
      <svg class="pace-track" viewBox="0 0 100 12" preserveAspectRatio="none" role="img" aria-label="${label}: ${workedPercent}% worked, ${blockedPercent}% blocked">
        <rect class="pace-background" x="0" y="0" width="100" height="12"></rect>
        <rect class="pace-success" x="0" y="0" width="${workedWidth}" height="12"></rect>
        <rect class="pace-blocked" x="${workedWidth}" y="0" width="${blockedWidth}" height="12"></rect>
        <line class="pace-target" x1="80" y1="0" x2="80" y2="12"></line>
      </svg>
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
$("#clear-data").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const confirmed = window.confirm("Clear every survey response and workshop check-in? This cannot be undone.");
  if (!confirmed) return;
  button.disabled = true;
  $("#clear-status").textContent = "Clearing…";
  try {
    const endpoint = `${location.pathname.replace(/\/$/, "")}/api/reset`;
    const response = await fetch(endpoint, { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not clear class data.");
    $("#clear-status").textContent = "All class data cleared.";
    toast("Class data cleared");
    await loadResults();
  } catch (error) {
    $("#clear-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
loadResults();
setInterval(loadResults, 3000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadResults(); });
