import { SerialPort } from "serialport";

const DEFAULT_PORT = process.env.ROBOT_SERIAL_PORT || "COM7";
const DEFAULT_BAUD_RATE = Number(process.env.ROBOT_SERIAL_BAUD_RATE || 9600);
const VALID_COMMANDS = new Set(["U", "D", "L", "R", "F", "B", "FL", "FR", "BL", "BR", "S", "AZ1", "AZ2", "AZ3", "AHOME"]);
const COMMAND_ALIASES = Object.freeze({
  U: "F",
  D: "B"
});

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
  return typeof command === "string" && VALID_COMMANDS.has(command);
}

export async function sendRobotSerialCommand(command) {
  if (!isValidRobotCommand(command)) {
    const error = new Error("Invalid command. Use movement commands or zone-arrival commands.");
    error.code = "ROBOT_COMMAND_INVALID";
    throw error;
  }

  const serialPort = await openPort();
  const normalizedCommand = COMMAND_ALIASES[command] || command;
  const payload = `${normalizedCommand}\n`;

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
    command: normalizedCommand,
    requestedCommand: command,
    port: activePortPath,
    baudRate: DEFAULT_BAUD_RATE,
    sentAt: new Date().toISOString()
  };
}

export function getRobotSerialStatus() {
  return {
    port: activePortPath,
    baudRate: DEFAULT_BAUD_RATE,
    connected: Boolean(port?.isOpen),
    lastError: lastError?.message || null
  };
}
