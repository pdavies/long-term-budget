const { calculateMortgagePayment, projectFinances: projectFinanceModel } = window.FinanceModel;

const defaults = {
  currentAge: 40,
  currentWorth: 50000,
  growthRate: 3,
  monthlyOutgoings: 2000,
  monthlyIncome: 3000,
  incomeStopsAge: 68,
  properties: [],
  oneOffs: [],
  recurring: [
    { id: crypto.randomUUID(), label: "State pension", amount: 1045, age: 68 }
  ]
};

const state = structuredClone(defaults);
const controls = {};
const outputs = {};
const chart = document.querySelector("#netWorthChart");
const tooltip = document.querySelector("#chartTooltip");
const propertyList = document.querySelector("#propertyList");
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
  "incomeStopsAge"
];
const chartMargin = { top: 34, right: 28, bottom: 44, left: 74 };

function init() {
  numericControls.forEach((id) => {
    controls[id] = document.querySelector(`#${id}`);
    outputs[id] = document.querySelector(`#${id}Out`);
    controls[id].value = state[id];
    controls[id].addEventListener("input", () => {
      state[id] = Number(controls[id].value);
      render();
    });
  });

  document.querySelector("#addProperty").addEventListener("click", () => {
    state.properties.push({
      id: crypto.randomUUID(),
      label: "Property",
      startAge: Math.min(100, state.currentAge + 1),
      propertyPrice: 450000,
      deposit: 90000,
      mortgageRate: 4.5,
      mortgageYears: 25,
      propertyGrowth: 0
    });
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

  render();
}

function syncFormFromState() {
  numericControls.forEach((id) => {
    controls[id].value = state[id];
  });
}

function projectFinances() {
  return projectFinanceModel(state, {
    formatCurrency: (value) => currency.format(value),
    formatAge
  });
}

let lastProjection = null;

function render() {
  updateOutputs();
  renderPropertyList();
  renderIncomeList(oneOffList, state.oneOffs, "oneOffs");
  renderIncomeList(recurringList, state.recurring, "recurring");
  lastProjection = projectFinances();
  renderChart(lastProjection);
}

function updateOutputs() {
  outputs.currentAge.value = state.currentAge;
  outputs.currentWorth.value = currency.format(state.currentWorth);
  outputs.growthRate.value = `${percent.format(state.growthRate)}%`;
  outputs.monthlyOutgoings.value = currency.format(state.monthlyOutgoings);
  outputs.monthlyIncome.value = currency.format(state.monthlyIncome);
  outputs.incomeStopsAge.value = state.incomeStopsAge;
}

function renderPropertyList() {
  propertyList.replaceChildren();

  if (state.properties.length === 0) {
    const empty = document.createElement("p");
    empty.className = "calculated-line";
    empty.textContent = "No properties yet.";
    propertyList.append(empty);
    return;
  }

  state.properties.forEach((property) => {
    const row = document.createElement("div");
    row.className = "income-item property-item";
    row.dataset.id = property.id;

    row.innerHTML = `
      <label>
        <span class="item-meta">Label</span>
        <input type="text" value="${escapeHtml(property.label)}" data-field="label" aria-label="Property label">
      </label>
      ${propertyRange("Start age", "startAge", property.startAge, 18, 100, 1, property.startAge)}
      ${propertyRange("Property price", "propertyPrice", property.propertyPrice, 50000, 2000000, 5000, currency.format(property.propertyPrice))}
      ${propertyRange("Deposit", "deposit", property.deposit, 0, property.propertyPrice, 5000, currency.format(property.deposit))}
      ${propertyRange("Mortgage interest", "mortgageRate", property.mortgageRate, 0, 12, 0.1, `${percent.format(property.mortgageRate)}%`)}
      ${propertyRange("Mortgage term", "mortgageYears", property.mortgageYears, 1, 40, 1, `${property.mortgageYears} year${property.mortgageYears === 1 ? "" : "s"}`)}
      ${propertyRange("Property value growth", "propertyGrowth", property.propertyGrowth, -5, 8, 0.1, `${percent.format(property.propertyGrowth)}%`)}
      <p class="calculated-line">
        Monthly payment: <strong data-role="payment">${currency.format(calculateMortgagePayment(property))}</strong>
        <span data-role="borrowed"> on ${currency.format(Math.max(0, property.propertyPrice - property.deposit))} borrowed</span>
      </p>
      <button class="remove-button" type="button" aria-label="Remove property">Remove</button>
    `;

    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.dataset.field;
        property[field] = field === "label" ? input.value : Number(input.value);

        if (field === "propertyPrice" && property.deposit > property.propertyPrice) {
          property.deposit = property.propertyPrice;
          const depositInput = row.querySelector('input[data-field="deposit"]');
          depositInput.max = property.propertyPrice;
          depositInput.value = property.deposit;
          updateFieldOutput(depositInput, currency.format(property.deposit));
        }
        if (field === "propertyPrice") {
          row.querySelector('input[data-field="deposit"]').max = property.propertyPrice;
        }

        if (field !== "label") {
          updateFieldOutput(input, formatPropertyValue(field, property[field]));
        }

        row.querySelector('[data-role="payment"]').textContent = currency.format(calculateMortgagePayment(property));
        row.querySelector('[data-role="borrowed"]').textContent = ` on ${currency.format(Math.max(0, property.propertyPrice - property.deposit))} borrowed`;
        lastProjection = projectFinances();
        renderChart(lastProjection);
      });
    });

    row.querySelector("button").addEventListener("click", () => {
      const index = state.properties.findIndex((candidate) => candidate.id === property.id);
      state.properties.splice(index, 1);
      render();
    });

    propertyList.append(row);
  });
}

function propertyRange(label, field, value, min, max, step, displayValue) {
  return `
    <label class="mini-range">
      <span class="item-meta">${label} <output>${displayValue}</output></span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-field="${field}" aria-label="${label}">
    </label>
  `;
}

function formatPropertyValue(field, value) {
  if (field === "propertyPrice" || field === "deposit") return currency.format(value);
  if (field === "mortgageRate" || field === "propertyGrowth") return `${percent.format(value)}%`;
  if (field === "mortgageYears") return `${value} year${value === 1 ? "" : "s"}`;
  return value;
}

function updateFieldOutput(input, value) {
  const output = input.closest("label")?.querySelector("output");
  if (output) output.textContent = value;
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
        if (field === "age") updateFieldOutput(input, item.age);
        if (field === "amount") updateFieldOutput(input, currency.format(item.amount));
        lastProjection = projectFinances();
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

function renderChart(projection, highlightIndex = null) {
  const width = chart.clientWidth || 760;
  const height = chart.clientHeight || 440;
  const margin = chartMargin;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const points = projection.points;
  const values = points.flatMap((point) => [0, point.liquid, point.worth]);
  const minWorth = Math.min(...values);
  const maxWorth = Math.max(1000, ...values);
  const pad = Math.max(10000, (maxWorth - minWorth) * 0.08);
  const yMin = minWorth - pad;
  const yMax = maxWorth + pad;
  const xMin = state.currentAge;
  const xMax = 100;

  const x = (age) => margin.left + ((age - xMin) / (xMax - xMin || 1)) * innerWidth;
  const y = (worth) => margin.top + (1 - ((worth - yMin) / (yMax - yMin || 1))) * innerHeight;
  const totalPath = linePath(points, x, y, "worth");
  const liquidAreaPath = areaBetweenPath(points, x, y, () => 0, (point) => point.liquid);
  const propertyAreaPath = areaBetweenPath(points, x, y, (point) => point.liquid, (point) => point.worth);

  const yTicks = buildTicks(yMin, yMax, 5);
  const xTicks = buildAgeTicks(xMin, xMax);
  const milestones = layoutMilestones(projection.milestones, x, y, margin, width);
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chart.innerHTML = `
    <title id="chartTitle">Expected net worth by age</title>
    <desc id="chartDesc">Stacked chart showing liquid wealth plus property equity from current age to age 100.</desc>
    <g class="chart-legend">
      <rect class="legend-liquid" x="${margin.left}" y="12" width="10" height="10" rx="2"></rect>
      <text x="${margin.left + 15}" y="21">Savings and investments</text>
      <rect class="legend-property" x="${margin.left + 158}" y="12" width="10" height="10" rx="2"></rect>
      <text x="${margin.left + 173}" y="21">Property equity</text>
    </g>
    ${yTicks.map((tick) => `
      <line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(tick)}" y2="${y(tick)}"></line>
      <text class="axis-label" x="${margin.left - 10}" y="${y(tick) + 4}" text-anchor="end">${formatCompactCurrency(tick)}</text>
    `).join("")}
    ${xTicks.map((tick) => `
      <line class="grid-line" x1="${x(tick)}" x2="${x(tick)}" y1="${margin.top}" y2="${height - margin.bottom}"></line>
      <text class="axis-label" x="${x(tick)}" y="${height - 13}" text-anchor="middle">${Math.round(tick)}</text>
    `).join("")}
    <line class="zero-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(0)}" y2="${y(0)}"></line>
    <path class="liquid-area" d="${liquidAreaPath}"></path>
    <path class="property-area" d="${propertyAreaPath}"></path>
    <path class="worth-line" d="${totalPath}"></path>
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

function linePath(points, x, y, key) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.age).toFixed(2)} ${y(point[key]).toFixed(2)}`).join(" ");
}

function areaBetweenPath(points, x, y, lower, upper) {
  const top = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.age).toFixed(2)} ${y(upper(point)).toFixed(2)}`).join(" ");
  const bottom = points.slice().reverse().map((point) => `L ${x(point.age).toFixed(2)} ${y(lower(point)).toFixed(2)}`).join(" ");
  return `${top} ${bottom} Z`;
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
  const viewBoxWidth = chart.clientWidth || 760;
  const pointerX = (event.clientX - rect.left) * (viewBoxWidth / rect.width);
  const plotLeft = chartMargin.left;
  const plotRight = viewBoxWidth - chartMargin.right;
  const plotProgress = (clamp(pointerX, plotLeft, plotRight) - plotLeft) / (plotRight - plotLeft || 1);
  const hoveredAge = state.currentAge + plotProgress * (100 - state.currentAge);
  const points = lastProjection.points;
  const index = nearestPointIndex(points, hoveredAge);
  const point = points[index];

  renderChart(lastProjection, index);
  tooltip.hidden = false;
  tooltip.style.left = `${event.clientX - rect.left + 14}px`;
  tooltip.style.top = `${event.clientY - rect.top}px`;
  tooltip.innerHTML = `
    Age ${formatAge(point.age)}
    <strong>${currency.format(point.worth)}</strong>
    <span>Liquid ${currency.format(point.liquid)}</span>
    <span>Property ${currency.format(point.propertyEquity)}</span>
  `;
}

function nearestPointIndex(points, age) {
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  points.forEach((point, index) => {
    const distance = Math.abs(point.age - age);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
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

function formatCompactCurrency(value) {
  return compactCurrency.format(Math.abs(value) < 1 ? 0 : value);
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
