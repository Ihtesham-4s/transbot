import test from "node:test";
import assert from "node:assert/strict";
import { isValidRobotCommand } from "../src/services/robotSerialService.js";

test("accepts directional and diagonal movement commands", () => {
  for (const command of ["F", "B", "L", "R", "FL", "FR", "BL", "BR", "S", "U", "D"]) {
    assert.equal(isValidRobotCommand(command), true);
  }
});

test("rejects unknown commands", () => {
  assert.equal(isValidRobotCommand("XYZ"), false);
  assert.equal(isValidRobotCommand(""), false);
});
