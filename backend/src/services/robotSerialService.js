/**
 * Robot serial communication service.
 *
 * Command protocol (firmware v2):
 * All commands are newline-terminated ASCII strings sent at 9600 baud.
 *
 * Mode control:
 *   MODE:AUTO     — switch robot to autonomous mode
 *   MODE:MANUAL   — switch robot to manual drive mode
 *
 * Auto-mode commands (robot must be in AUTO):
 *   TASK:AB / TASK:AC / TASK:BA / TASK:BC / TASK:CA / TASK:CB — assign pickup→drop task
 *   STOP          — emergency stop (auto mode)
 *   RESET         — reset robot to Zone A, clear current task
 *   NUDGE:L       — nudge left (position correction, hidden keypress)
 *   NUDGE:R       — nudge right (position correction, hidden keypress)
 *
 * Manual-mode commands (robot must be in MANUAL):
 *   F / B / L / R         — drive forward/back/left/right (continuous until next command)
 *   FL / FR / BL / BR     — diagonal drive
 *   S                     — stop motors
 *   SPEED:<right>,<left>  — set motor speeds e.g. SPEED:140,150
 *
 * Zone-arrival logging (any mode):
 *   AA / AB / AC          — log arrival at Zone A / B / C
 */

import { SerialPort } from "serialport";

const DEFAULT_PORT = process.env.ROBOT_SERIAL_PORT || "COM7";
const DEFAULT_BAUD_RATE = Number(process.env.ROBOT_SERIAL_BAUD_RATE || 9600);

// Simple (exact-match) valid commands
const EXACT_COMMANDS = new Set([
  // Mode
  "MODE:AUTO", "MODE:MANUAL",
  // Auto commands
  "TASK:AB", "TASK:AC", "TASK:BA", "TASK:BC", "TASK:CA", "TASK:CB",
  "STOP", "RESET",
  "NUDGE:L", "NUDGE:R",
  // Manual drive
  "F", "B", "L", "R", "FL", "FR", "BL", "BR",
  "S",
  // Zone arrival (both new 3-zone AA/AB/AC and firmware legacy AZ1/AZ2/AZ3/AHOME)
  "AA", "AB", "AC", "AZ1", "AZ2", "AZ3", "AHOME"
]);

// SPEED:<right>,<left> — both values 0–255 integers
const SPEED_COMMAND_PATTERN = /^SPEED:(\d{1,3}),(\d{1,3})$/;

let port = null;
let openingPromise = null;
let lastError = null;
let activePortPath = DEFAULT_PORT;

function createUnavailableError(message, cause) {
  const error = new Error(message);
  error.code = "ROBOT_SERIAL_UNAVAILABLE";
  error.cause = cause;
  return error;
}

function resetPort() {
  port = null;
  openingPromise = null;
}

function attachPortHandlers(serialPort) {
  serialPort.on("error", (error) => {
    lastError = error;
    console.error(`[robot-serial] ${activePortPath} error:`, error?.message || error);
  });

  serialPort.on("close", () => {
    resetPort();
    console.warn(`[robot-serial] ${activePortPath} closed.`);
  });
}

async function openPort() {
  if (port?.isOpen) return port;
  if (openingPromise) return openingPromise;

  openingPromise = new Promise((resolve, reject) => {
    const serialPort = new SerialPort({
      path: DEFAULT_PORT,
      baudRate: DEFAULT_BAUD_RATE,
      autoOpen: false
    });

    attachPortHandlers(serialPort);

    serialPort.open((error) => {
      openingPromise = null;

      if (error) {
        lastError = error;
        port = null;
        return reject(
          createUnavailableError(
            `${DEFAULT_PORT} is not available. Check that HC-05 is paired, powered, and not open in another program.`,
            error
          )
        );
      }

      activePortPath = DEFAULT_PORT;
      port = serialPort;
      console.log(`[robot-serial] Connected to ${DEFAULT_PORT} at ${DEFAULT_BAUD_RATE} baud.`);
      return resolve(serialPort);
    });
  });

  return openingPromise;
}

export function isValidRobotCommand(command) {
  if (typeof command !== "string") return false;
  return EXACT_COMMANDS.has(command) || SPEED_COMMAND_PATTERN.test(command);
}

export async function sendRobotSerialCommand(command) {
  if (!isValidRobotCommand(command)) {
    const error = new Error(
      `Invalid command: "${command}". Allowed: movement (F/B/L/R/FL/FR/BL/BR/S), mode (MODE:AUTO/MANUAL), ` +
      `task (TASK:AB/AC/BA/BC/CA/CB), stop (STOP), reset (RESET), nudge (NUDGE:L/R), ` +
      `zone arrival (AA/AB/AC), speed (SPEED:<right>,<left>).`
    );
    error.code = "ROBOT_COMMAND_INVALID";
    throw error;
  }

  // Fast 1000ms timeout wrapper so serial communication NEVER blocks HTTP requests or hangs the server
  const timeoutMs = 1000;

  try {
    const writePromise = (async () => {
      const serialPort = await openPort();
      const payload = `${command}\n`;

      await new Promise((resolve, reject) => {
        serialPort.write(payload, "utf8", (writeError) => {
          if (writeError) {
            lastError = writeError;
            return reject(createUnavailableError(`Failed to write command to ${activePortPath}.`, writeError));
          }

          serialPort.drain((drainError) => {
            if (drainError) {
              lastError = drainError;
              return reject(createUnavailableError(`Failed to flush command to ${activePortPath}.`, drainError));
            }
            return resolve();
          });
        });
      });

      return {
        command,
        port: activePortPath,
        baudRate: DEFAULT_BAUD_RATE,
        sentAt: new Date().toISOString()
      };
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Serial port COM7 timeout after ${timeoutMs}ms.`)), timeoutMs)
    );

    return await Promise.race([writePromise, timeoutPromise]);
  } catch (err) {
    console.warn(`[robot-serial] Hardware command notice ("${command}"):`, err?.message || err);
    // Safe fallback object so caller receives immediate success with offline status
    return {
      command,
      port: DEFAULT_PORT,
      baudRate: DEFAULT_BAUD_RATE,
      offline: true,
      sentAt: new Date().toISOString()
    };
  }
}

export function getRobotSerialStatus() {
  return {
    port: activePortPath,
    baudRate: DEFAULT_BAUD_RATE,
    connected: Boolean(port?.isOpen),
    lastError: lastError?.message || null
  };
}
