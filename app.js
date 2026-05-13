const defaults = {
  currentAge: 40,
  currentWorth: 250000,
  growthRate: 5,
  monthlyOutgoings: 2500,
  monthlyIncome: 4500,
  incomeStopsAge: 68,
  mortgageEnabled: false,
  propertyPrice: 450000,
  deposit: 90000,
  mortgageRate: 4.5,
  mortgageYears: 25,
  oneOffs: [
    { id: crypto.randomUUID(), label: "Inheritance", amount: 50000, age: 60 }
  ],
  recurring: [
    { id: crypto.randomUUID(), label: "State pension", amount: 900, age: 67 }
  ]
};

const state = structuredClone(defaults);
const controls = {};
const outputs = {};
const chart = document.querySelector("#netWorthChart");
const tooltip = document.querySelector("#chartTooltip");
const oneOffList = document.querySelector("#oneOffList");
const recurringList = document.querySelector("#recurringList");

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0
});

const compactCurrency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  notation: "compact",
  maximumFractionDigits: 1
});

const percent = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1
});

const numericControls = [
  "currentAge",
  "currentWorth",
  "growthRate",
  "monthlyOutgoings",
  "monthlyIncome",
  "incomeStopsAge",
  "propertyPrice",
  "deposit",
  "mortgageRate",
  "mortgageYears"
];

function init() {
  numericControls.forEach((id) => {
    controls[id] = document.querySelector(`#${id}`);
    outputs[id] = document.querySelector(`#${id}Out`);
    controls[id].value = state[id];
    controls[id].addEventListener("input", () => {
      state[id] = Number(controls[id].value);
      if (id === "propertyPrice") syncDepositLimit();
      render();
    });
  });

  controls.mortgageEnabled = document.querySelector("#mortgageEnabled");
  controls.mortgageEnabled.checked = state.mortgageEnabled;
  controls.mortgageEnabled.addEventListener("input", () => {
    state.mortgageEnabled = controls.mortgageEnabled.checked;
    render();
  });

  document.querySelector("#addOneOff").addEventListener("click", () => {
    state.oneOffs.push({
      id: crypto.randomUUID(),
      label: "One-off income",
      amount: 25000,
      age: Math.min(100, state.currentAge + 10)
    });
    render();
  });

  document.querySelector("#addRecurring").addEventListener("click", () => {
    state.recurring.push({
      id: crypto.randomUUID(),
      label: "Recurring income",
      amount: 500,
      age: Math.min(100, state.currentAge + 5)
    });
    render();
  });

  document.querySelector("#resetButton").addEventListener("click", () => {
    Object.assign(state, structuredClone(defaults));
    syncFormFromState();
    render();
  });

  chart.addEventListener("pointermove", handleChartPointer);
  chart.addEventListener("pointerleave", () => {
    tooltip.hidden = true;
    renderChart(lastProjection);
  });
  window.addEventListener("resize", () => {
    if (lastProjection) renderChart(lastProjection);
  });
  window.addEventListener("scroll", () => {
    if (tooltip.hidden) return;
    tooltip.hidden = true;
    if (lastProjection) renderChart(lastProjection);
  }, { passive: true });

  syncDepositLimit();
  render();
}

function syncFormFromState() {
  numericControls.forEach((id) => {
    controls[id].value = state[id];
  });
  controls.mortgageEnabled.checked = state.mortgageEnabled;
}

function syncDepositLimit() {
  controls.deposit.max = state.propertyPrice;
  if (state.deposit > state.propertyPrice) {
    state.deposit = state.propertyPrice;
    controls.deposit.value = state.deposit;
  }
}

function calculateMortgagePayment() {
  if (!state.mortgageEnabled) return 0;
  const principal = Math.max(0, state.propertyPrice - state.deposit);
  const months = Math.max(1, state.mortgageYears * 12);
  const monthlyRate = state.mortgageRate / 100 / 12;

  if (principal <= 0) return 0;
  if (monthlyRate === 0) return principal / months;

  return principal * (monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);
}

function projectFinances() {
  const endAge = 100;
  const monthlyGrowth = (1 + state.growthRate / 100) ** (1 / 12) - 1;
  const mortgagePayment = calculateMortgagePayment();
  const mortgageMonths = state.mortgageEnabled ? state.mortgageYears * 12 : 0;
  let worth = state.currentWorth - (state.mortgageEnabled ? state.deposit : 0);
  const months = Math.max(0, Math.round((endAge - state.currentAge) * 12));
  const points = [{ age: state.currentAge, worth }];
  const oneOffsByMonth = new Map();

  state.oneOffs.forEach((item) => {
    const month = Math.round((item.age - state.currentAge) * 12);
    if (month >= 0 && month <= months) {
      oneOffsByMonth.set(month, (oneOffsByMonth.get(month) || 0) + Number(item.amount || 0));
    }
  });

  for (let month = 1; month <= months; month += 1) {
    const age = state.currentAge + month / 12;
    const earnedIncome = age < state.incomeStopsAge ? state.monthlyIncome : 0;
    const recurringIncome = state.recurring.reduce((sum, item) => {
      return age >= Number(item.age || 0) ? sum + Number(item.amount || 0) : sum;
    }, 0);
    const mortgageOut = month <= mortgageMonths ? mortgagePayment : 0;
    const monthlyNet = earnedIncome + recurringIncome - state.monthlyOutgoings - mortgageOut;

    worth = worth * (1 + monthlyGrowth) + monthlyNet + (oneOffsByMonth.get(month) || 0);

    if (month % 3 === 0 || month === months) {
      points.push({ age, worth });
    }
  }

  const milestones = buildMilestones(points, mortgageMonths);

  return {
    points,
    milestones,
    mortgagePayment,
    principal: Math.max(0, state.propertyPrice - state.deposit)
  };
}

function buildMilestones(points, mortgageMonths) {
  const milestones = [];

  state.oneOffs.forEach((item) => {
    if (Number(item.amount || 0) > 0 && item.age >= state.currentAge && item.age <= 100) {
      milestones.push({
        age: Number(item.age),
        label: item.label || "One-off income",
        detail: currency.format(item.amount),
        type: "one-off"
      });
    }
  });

  state.recurring.forEach((item) => {
    if (Number(item.amount || 0) > 0 && item.age >= state.currentAge && item.age <= 100) {
      milestones.push({
        age: Number(item.age),
        label: `${item.label || "Recurring income"} starts`,
        detail: `${currency.format(item.amount)}/mo`,
        type: "recurring"
      });
    }
  });

  if (state.monthlyIncome > 0 && state.incomeStopsAge >= state.currentAge && state.incomeStopsAge <= 100) {
    milestones.push({
      age: state.incomeStopsAge,
      label: "Income stops",
      detail: `Age ${state.incomeStopsAge}`,
      type: "income-stop"
    });
  }

  if (state.mortgageEnabled && mortgageMonths > 0 && calculateMortgagePayment() > 0) {
    const payoffAge = state.currentAge + mortgageMonths / 12;
    if (payoffAge >= state.currentAge && payoffAge <= 100) {
      milestones.push({
        age: payoffAge,
        label: "Mortgage paid off",
        detail: `Age ${formatAge(payoffAge)}`,
        type: "mortgage"
      });
    }
  }

  return milestones
    .sort((a, b) => a.age - b.age)
    .map((milestone) => ({
      ...milestone,
      worth: worthAtAge(points, milestone.age)
    }));
}

function worthAtAge(points, age) {
  if (age <= points[0].age) return points[0].worth;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];

    if (age <= next.age) {
      const progress = (age - previous.age) / (next.age - previous.age || 1);
      return previous.worth + (next.worth - previous.worth) * progress;
    }
  }

  return points[points.length - 1].worth;
}

let lastProjection = null;

function render() {
  updateOutputs();
  renderIncomeList(oneOffList, state.oneOffs, "oneOffs");
  renderIncomeList(recurringList, state.recurring, "recurring");
  lastProjection = projectFinances();
  updateSummary(lastProjection);
  renderChart(lastProjection);
}

function updateOutputs() {
  outputs.currentAge.value = state.currentAge;
  outputs.currentWorth.value = currency.format(state.currentWorth);
  outputs.growthRate.value = `${percent.format(state.growthRate)}%`;
  outputs.monthlyOutgoings.value = currency.format(state.monthlyOutgoings);
  outputs.monthlyIncome.value = currency.format(state.monthlyIncome);
  outputs.incomeStopsAge.value = state.incomeStopsAge;
  outputs.propertyPrice.value = currency.format(state.propertyPrice);
  outputs.deposit.value = currency.format(state.deposit);
  outputs.mortgageRate.value = `${percent.format(state.mortgageRate)}%`;
  outputs.mortgageYears.value = `${state.mortgageYears} year${state.mortgageYears === 1 ? "" : "s"}`;

  const payment = calculateMortgagePayment();
  document.querySelector("#mortgagePayment").textContent = currency.format(payment);
  document.querySelector("#mortgageNote").textContent = state.mortgageEnabled
    ? ` on ${currency.format(Math.max(0, state.propertyPrice - state.deposit))} borrowed`
    : " while disabled";
  document.querySelector("#chartCaption").textContent = `Projection from age ${state.currentAge} to 100, excluding inflation and property value changes.`;
}

function renderIncomeList(container, items, key) {
  container.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "calculated-line";
    empty.textContent = "No entries yet.";
    container.append(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "income-item";
    row.dataset.id = item.id;
    const amountMax = key === "recurring" ? 10000 : 1000000;
    const amountStep = key === "recurring" ? 50 : 1000;
    const amountLabel = key === "recurring" ? "Monthly amount" : "Amount";

    row.innerHTML = `
      <label>
        <span class="item-meta">Label</span>
        <input type="text" value="${escapeHtml(item.label)}" data-field="label" aria-label="Income label">
      </label>
      <label class="mini-range">
        <span class="item-meta">Age <output>${item.age}</output></span>
        <input type="range" min="18" max="100" step="1" value="${item.age}" data-field="age" aria-label="Start age">
      </label>
      <label class="mini-range">
        <span class="item-meta">${amountLabel} <output>${currency.format(item.amount)}</output></span>
        <input type="range" min="0" max="${amountMax}" step="${amountStep}" value="${item.amount}" data-field="amount" aria-label="${amountLabel}">
      </label>
      <button class="remove-button" type="button" aria-label="Remove income">Remove</button>
    `;

    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.dataset.field;
        item[field] = field === "label" ? input.value : Number(input.value);
        const output = input.closest("label")?.querySelector("output");
        if (output && field === "age") output.value = item.age;
        if (output && field === "amount") output.value = currency.format(item.amount);
        lastProjection = projectFinances();
        updateSummary(lastProjection);
        renderChart(lastProjection);
      });
    });

    row.querySelector("button").addEventListener("click", () => {
      const index = items.findIndex((candidate) => candidate.id === item.id);
      items.splice(index, 1);
      render();
    });

    container.append(row);
  });
}

function updateSummary(projection) {
  const points = projection.points;
  const finalPoint = points[points.length - 1];
  const lowest = points.reduce((min, point) => point.worth < min.worth ? point : min, points[0]);
  const firstNegative = points.find((point) => point.worth < 0);

  document.querySelector("#worthAt100").textContent = currency.format(finalPoint.worth);
  document.querySelector("#lowestWorth").textContent = `${currency.format(lowest.worth)} at ${formatAge(lowest.age)}`;
  document.querySelector("#runway").textContent = firstNegative ? `Age ${formatAge(firstNegative.age)}` : "Age 100+";
}

function renderChart(projection, highlightIndex = null) {
  const width = chart.clientWidth || 760;
  const height = chart.clientHeight || 440;
  const margin = { top: 20, right: 28, bottom: 38, left: 74 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const points = projection.points;
  const minWorth = Math.min(0, ...points.map((point) => point.worth));
  const maxWorth = Math.max(1000, ...points.map((point) => point.worth));
  const pad = Math.max(10000, (maxWorth - minWorth) * 0.08);
  const yMin = minWorth - pad;
  const yMax = maxWorth + pad;
  const xMin = state.currentAge;
  const xMax = 100;

  const x = (age) => margin.left + ((age - xMin) / (xMax - xMin || 1)) * innerWidth;
  const y = (worth) => margin.top + (1 - ((worth - yMin) / (yMax - yMin || 1))) * innerHeight;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.age).toFixed(2)} ${y(point.worth).toFixed(2)}`).join(" ");
  const areaPath = `${path} L ${x(points[points.length - 1].age).toFixed(2)} ${y(0).toFixed(2)} L ${x(points[0].age).toFixed(2)} ${y(0).toFixed(2)} Z`;

  const yTicks = buildTicks(yMin, yMax, 5);
  const xTicks = buildAgeTicks(xMin, xMax);
  const milestones = layoutMilestones(projection.milestones, x, y, margin, width);
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chart.innerHTML = `
    <title id="chartTitle">Expected net worth by age</title>
    <desc id="chartDesc">Line chart showing projected net worth from current age to age 100.</desc>
    ${yTicks.map((tick) => `
      <line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(tick)}" y2="${y(tick)}"></line>
      <text class="axis-label" x="${margin.left - 10}" y="${y(tick) + 4}" text-anchor="end">${compactCurrency.format(tick)}</text>
    `).join("")}
    ${xTicks.map((tick) => `
      <line class="grid-line" x1="${x(tick)}" x2="${x(tick)}" y1="${margin.top}" y2="${height - margin.bottom}"></line>
      <text class="axis-label" x="${x(tick)}" y="${height - 13}" text-anchor="middle">${Math.round(tick)}</text>
    `).join("")}
    <line class="zero-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(0)}" y2="${y(0)}"></line>
    <path class="worth-area" d="${areaPath}"></path>
    <path class="worth-line" d="${path}"></path>
    ${milestones.map((milestone) => `
      <g class="milestone milestone-${milestone.type}">
        <line class="milestone-guide" x1="${milestone.x.toFixed(2)}" x2="${milestone.x.toFixed(2)}" y1="${(milestone.labelY + 21).toFixed(2)}" y2="${milestone.y.toFixed(2)}"></line>
        <circle class="milestone-dot" cx="${milestone.x.toFixed(2)}" cy="${milestone.y.toFixed(2)}" r="4.8"></circle>
        <rect class="milestone-label-bg" x="${(milestone.labelX - 68).toFixed(2)}" y="${(milestone.labelY - 13).toFixed(2)}" width="136" height="37" rx="6"></rect>
        <text class="milestone-label" x="${milestone.labelX.toFixed(2)}" y="${milestone.labelY.toFixed(2)}">
          <tspan x="${milestone.labelX.toFixed(2)}" dy="0">${escapeHtml(truncateLabel(milestone.label, 21))}</tspan>
          <tspan class="milestone-detail" x="${milestone.labelX.toFixed(2)}" dy="15">${escapeHtml(milestone.detail)}</tspan>
        </text>
      </g>
    `).join("")}
    ${highlightIndex !== null ? `<circle class="chart-dot" cx="${x(points[highlightIndex].age)}" cy="${y(points[highlightIndex].worth)}" r="6"></circle>` : ""}
  `;
}

function layoutMilestones(milestones, x, y, margin, width) {
  const lanes = [margin.top + 22, margin.top + 67, margin.top + 112, margin.top + 157, margin.top + 202];
  const lastLaneX = lanes.map(() => -Infinity);
  const labelHalfWidth = 68;

  return milestones.slice(0, 10).map((milestone) => {
    const markerX = x(milestone.age);
    const markerY = y(milestone.worth);
    let lane = lastLaneX.findIndex((lastX) => markerX - lastX > 144);
    if (lane === -1) {
      lane = lastLaneX.indexOf(Math.min(...lastLaneX));
    }
    lastLaneX[lane] = markerX;

    return {
      ...milestone,
      x: markerX,
      y: markerY,
      labelX: clamp(markerX, margin.left + labelHalfWidth, width - margin.right - labelHalfWidth),
      labelY: lanes[lane]
    };
  });
}

function handleChartPointer(event) {
  if (!lastProjection) return;
  const rect = chart.getBoundingClientRect();
  const xPos = event.clientX - rect.left;
  const points = lastProjection.points;
  const index = Math.max(0, Math.min(points.length - 1, Math.round((xPos / rect.width) * (points.length - 1))));
  const point = points[index];

  renderChart(lastProjection, index);
  tooltip.hidden = false;
  tooltip.style.left = `${event.clientX - rect.left + 14}px`;
  tooltip.style.top = `${event.clientY - rect.top}px`;
  tooltip.innerHTML = `Age ${formatAge(point.age)}<strong>${currency.format(point.worth)}</strong>`;
}

function buildTicks(min, max, count) {
  const span = max - min || 1;
  const rawStep = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const start = Math.ceil(min / step) * step;
  const ticks = [];

  for (let value = start; value <= max; value += step) {
    ticks.push(value);
  }

  return ticks;
}

function buildAgeTicks(min, max) {
  const ticks = [];
  const start = Math.ceil(min / 10) * 10;
  for (let age = start; age <= max; age += 10) {
    ticks.push(age);
  }
  if (!ticks.includes(Math.round(min))) ticks.unshift(min);
  if (!ticks.includes(max)) ticks.push(max);
  return ticks;
}

function truncateLabel(label, maxLength) {
  const normalized = String(label).trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatAge(age) {
  return Number.isInteger(age) ? String(age) : age.toFixed(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

init();
