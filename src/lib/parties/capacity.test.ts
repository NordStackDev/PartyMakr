import assert from "node:assert/strict";
import { test } from "vitest";

import {
  capacityDefault,
  capacityOptions,
  capacityValue,
} from "./capacity";

test("an admin-set capacity outside the standard choices survives an edit", () => {
  const selected = capacityDefault(25, false);
  const values = capacityOptions(25).map((o) => o.value);

  assert.equal(selected, "25");
  assert.ok(values.includes(selected), "25 must be a selectable option");
  assert.equal(capacityValue(selected), 25);
});

test("a custom capacity is listed in size order", () => {
  assert.deepEqual(
    capacityOptions(25).map((o) => o.value),
    ["10", "20", "25", "30", "50", "100", "unlimited"],
  );
});

test("standard capacities are not duplicated", () => {
  assert.deepEqual(
    capacityOptions(30).map((o) => o.value),
    ["10", "20", "30", "50", "100", "unlimited"],
  );
});

test("an unlimited party stays unlimited when edited", () => {
  const selected = capacityDefault(null, false);
  assert.equal(selected, "unlimited");
  assert.ok(capacityOptions(null).some((o) => o.value === selected));
  assert.equal(capacityValue(selected), null);
});

test("new parties default to 20 guests", () => {
  assert.equal(capacityDefault(null, true), "20");
});

test("capacityValue rejects invalid input", () => {
  assert.equal(capacityValue(""), null);
  assert.equal(capacityValue("0"), null);
  assert.equal(capacityValue("-5"), null);
  assert.equal(capacityValue("2.5"), null);
  assert.equal(capacityValue("abc"), null);
});
