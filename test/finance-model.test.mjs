import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  calculateMortgagePayment,
  mortgageBalanceAt,
  projectFinances,
  propertyValueAt
} = require("../finance-model.js");

function baseState(overrides = {}) {
  return {
    currentAge: 40,
    currentWorth: 0,
    growthRate: 0,
    monthlyOutgoings: 0,
    monthlyIncome: 0,
    incomeStopsAge: 100,
    properties: [],
    oneOffs: [],
    recurring: [],
    ...overrides
  };
}

function finalPoint(projection) {
  return projection.points[projection.points.length - 1];
}

function closeTo(actual, expected, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

test("projects simple monthly cashflow without growth", () => {
  const projection = projectFinances(baseState({
    currentWorth: 1000,
    monthlyIncome: 100,
    monthlyOutgoings: 40
  }), { endAge: 41 });

  closeTo(finalPoint(projection).liquid, 1720);
  closeTo(finalPoint(projection).propertyEquity, 0);
  closeTo(finalPoint(projection).worth, 1720);
});

test("stops earned income and starts recurring income at the configured ages", () => {
  const projection = projectFinances(baseState({
    monthlyIncome: 100,
    incomeStopsAge: 40.5,
    recurring: [{ label: "Pension", amount: 25, age: 40.5 }]
  }), { endAge: 41 });

  closeTo(finalPoint(projection).worth, 675);
});

test("applies one-off income in the month matching its configured age", () => {
  const projection = projectFinances(baseState({
    oneOffs: [{ label: "Windfall", amount: 1000, age: 40.5 }]
  }), { endAge: 41 });

  closeTo(finalPoint(projection).worth, 1000);
});

test("calculates zero-interest mortgage payments and balances", () => {
  const property = {
    propertyPrice: 120000,
    deposit: 20000,
    mortgageRate: 0,
    mortgageYears: 1,
    propertyGrowth: 0
  };

  closeTo(calculateMortgagePayment(property), 100000 / 12);
  closeTo(mortgageBalanceAt(property, 6), 50000);
  closeTo(mortgageBalanceAt(property, 12), 0);
});

test("calculates repayment mortgage payment with interest", () => {
  const property = {
    propertyPrice: 450000,
    deposit: 90000,
    mortgageRate: 4.5,
    mortgageYears: 25,
    propertyGrowth: 0
  };

  closeTo(calculateMortgagePayment(property), 2000.997, 0.001);
});

test("tracks mortgage payments as a transfer from liquid wealth to property equity", () => {
  const projection = projectFinances(baseState({
    currentWorth: 50000,
    properties: [{
      label: "Home",
      startAge: 40,
      propertyPrice: 100000,
      deposit: 20000,
      mortgageRate: 0,
      mortgageYears: 10,
      propertyGrowth: 0
    }]
  }), { endAge: 41 });

  const start = projection.points[0];
  closeTo(start.liquid, 30000);
  closeTo(start.propertyEquity, 20000);
  closeTo(start.worth, 50000);

  const end = finalPoint(projection);
  closeTo(end.liquid, 22000);
  closeTo(end.propertyEquity, 28000);
  closeTo(end.worth, 50000);
});

test("grows property value", () => {
  const property = {
    propertyPrice: 100000,
    deposit: 100000,
    mortgageRate: 0,
    mortgageYears: 1,
    propertyGrowth: 12
  };

  closeTo(propertyValueAt(property, 12), 112000);

  const projection = projectFinances(baseState({
    currentWorth: 100000,
    properties: [{
      label: "Home",
      startAge: 40,
      ...property
    }]
  }), { endAge: 41 });

  const end = finalPoint(projection);
  closeTo(end.liquid, 0);
  closeTo(end.propertyEquity, 112000);
  closeTo(end.worth, 112000);
});
