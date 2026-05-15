(function attachFinanceModel(global) {
  function calculateMortgagePayment(property) {
    const principal = Math.max(0, property.propertyPrice - property.deposit);
    const months = Math.max(1, property.mortgageYears * 12);
    const monthlyRate = property.mortgageRate / 100 / 12;

    if (principal <= 0) return 0;
    if (monthlyRate === 0) return principal / months;

    return principal * (monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);
  }

  function mortgageBalanceAt(property, elapsedMonths) {
    const principal = Math.max(0, property.propertyPrice - property.deposit);
    const termMonths = Math.max(1, property.mortgageYears * 12);
    const month = clamp(elapsedMonths, 0, termMonths);
    const monthlyRate = property.mortgageRate / 100 / 12;
    const payment = calculateMortgagePayment(property);

    if (principal <= 0 || month >= termMonths) return 0;
    if (monthlyRate === 0) return Math.max(0, principal - payment * month);

    return Math.max(0, principal * (1 + monthlyRate) ** month - payment * (((1 + monthlyRate) ** month - 1) / monthlyRate));
  }

  function propertyValueAt(property, elapsedMonths) {
    const monthlyGrowth = (1 + property.propertyGrowth / 100) ** (1 / 12) - 1;
    return property.propertyPrice * (1 + monthlyGrowth) ** Math.max(0, elapsedMonths);
  }

  function projectFinances(state, options = {}) {
    const endAge = options.endAge ?? 100;
    const formatCurrency = options.formatCurrency ?? ((value) => String(value));
    const formatAge = options.formatAge ?? ((age) => Number.isInteger(age) ? String(age) : age.toFixed(1));
    const monthlyGrowth = (1 + state.growthRate / 100) ** (1 / 12) - 1;
    let liquid = state.currentWorth;
    let pension = state.pensionValue;
    const months = Math.max(0, Math.round((endAge - state.currentAge) * 12));
    const oneOffsByMonth = new Map();
    const propertyPlans = state.properties
      .map((property) => ({
        ...property,
        startMonth: Math.round((property.startAge - state.currentAge) * 12),
        termMonths: Math.max(1, property.mortgageYears * 12),
        payment: calculateMortgagePayment(property)
      }));

    state.oneOffs.forEach((item) => {
      const month = Math.round((item.age - state.currentAge) * 12);
      if (month >= 0 && month <= months) {
        oneOffsByMonth.set(month, (oneOffsByMonth.get(month) || 0) + Number(item.amount || 0));
      }
    });

    const points = [];

    for (let month = 0; month <= months; month += 1) {
      const age = state.currentAge + month / 12;

      if (month > 0) {
        const earnedIncome = age < state.incomeStopsAge ? state.monthlyIncome : 0;
        const recurringIncome = state.recurring.reduce((sum, item) => {
          return age >= Number(item.age || 0) ? sum + Number(item.amount || 0) : sum;
        }, 0);
        const mortgageOut = propertyPlans.reduce((sum, property) => {
          const elapsed = month - property.startMonth;
          return elapsed > 0 && elapsed <= property.termMonths ? sum + property.payment : sum;
        }, 0);
        const monthlyNet = earnedIncome + recurringIncome - state.monthlyOutgoings - mortgageOut;

        liquid = liquid * (1 + monthlyGrowth) + monthlyNet + (oneOffsByMonth.get(month) || 0);
        const pensionContribution = age < state.incomeStopsAge ? state.monthlyPensionContribution : 0;
        pension = pension * (1 + monthlyGrowth) + pensionContribution;

        if (liquid < 0 && pension > 0) {
          const spill = Math.min(pension, -liquid);
          liquid += spill;
          pension -= spill;
        }
      }

      propertyPlans.forEach((property) => {
        if (month === property.startMonth && property.startMonth >= 0) {
          liquid -= property.deposit;
        }
      });

      const propertyEquity = propertyPlans.reduce((sum, property) => {
        const elapsed = month - property.startMonth;
        if (elapsed < 0) return sum;
        return sum + propertyValueAt(property, elapsed) - mortgageBalanceAt(property, elapsed);
      }, 0);
      const worth = liquid + pension + propertyEquity;

      if (month % 3 === 0 || month === months) {
        points.push({ age, liquid, pension, propertyEquity, worth });
      }
    }

    const milestones = buildMilestones(state, points, propertyPlans, { formatCurrency, formatAge });

    return {
      points,
      milestones,
      properties: propertyPlans
    };
  }

  function buildMilestones(state, points, propertyPlans, { formatCurrency, formatAge }) {
    const milestones = [];

    state.oneOffs.forEach((item) => {
      if (Number(item.amount || 0) > 0 && item.age >= state.currentAge && item.age <= 100) {
        milestones.push({
          age: Number(item.age),
          label: item.label || "One-off income",
          detail: formatCurrency(item.amount),
          type: "one-off"
        });
      }
    });

    state.recurring.forEach((item) => {
      if (Number(item.amount || 0) > 0 && item.age >= state.currentAge && item.age <= 100) {
        milestones.push({
          age: Number(item.age),
          label: `${item.label || "Recurring income"} starts`,
          detail: `${formatCurrency(item.amount)}/mo`,
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

    propertyPlans.forEach((property) => {
      if (property.startAge >= state.currentAge && property.startAge <= 100) {
        milestones.push({
          age: property.startAge,
          label: `${property.label || "Property"} bought`,
          detail: formatCurrency(property.propertyPrice),
          type: "property"
        });
      }

      const payoffAge = property.startAge + property.mortgageYears;
      if (property.payment > 0 && payoffAge >= state.currentAge && payoffAge <= 100) {
        milestones.push({
          age: payoffAge,
          label: `${property.label || "Mortgage"} paid off`,
          detail: `Age ${formatAge(payoffAge)}`,
          type: "mortgage"
        });
      }
    });

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

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  const api = {
    calculateMortgagePayment,
    mortgageBalanceAt,
    projectFinances,
    propertyValueAt
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.FinanceModel = api;
  }
})(globalThis);
