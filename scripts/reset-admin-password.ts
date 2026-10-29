import "dotenv/config";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { encryptVaultSecret, hashPassword } from "../server/crypto.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.WOLLO_DATA_DIR || path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "wollo-db.json");
const ADMIN_EMAIL = "habibyesuf81@gmail.com";
const PORT = Number(process.env.PORT || 3000);

function assertServerStopped(): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: PORT });
    socket.setTimeout(1500);
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error(`A server is listening on port ${PORT}. Stop it before resetting the admin password.`));
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Could not confirm that port ${PORT} is free. Stop the server and retry.`));
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED") resolve();
      else reject(error);
    });
  });
}

function promptHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(new Error("Run this command in an interactive terminal so the password can be entered privately."));
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Password reset cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (/^[\x20-\x7e]$/.test(character) && value.length < 128) {
          value += character;
          process.stdout.write("*");
        }
      }
    };

    process.stdout.write(prompt);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function main(): Promise<void> {
  await assertServerStopped();
  if (!fs.existsSync(DB_FILE)) {
    throw new Error(`Database not found at ${DB_FILE}. Start the app once before using local password recovery.`);
  }

  const password = await promptHidden("New admin password (minimum 12 characters): ");
  if (password.length < 12) throw new Error("Password must be at least 12 characters long.");
  const confirmation = await promptHidden("Confirm new admin password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");

  const database = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as {
    customAdminPassword?: string;
    usersData?: Array<Record<string, unknown> & { email?: string; id?: string }>;
    passwordRecoveryRequests?: Array<Record<string, unknown> & { userId?: string; status?: string }>;
  };
  if (!Array.isArray(database.usersData)) throw new Error("Database does not contain a valid users list.");

  database.customAdminPassword = hashPassword(password, "admin-owner");
  for (const user of database.usersData) {
    if (String(user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) continue;
    const context = String(user.id || user.email).toLowerCase().trim();
    const passwordHash = hashPassword(password, context);
    user.role = "admin";
    user.password = passwordHash;
    user.passwordHash = passwordHash;
    user.passwordVault = encryptVaultSecret(password, context);
    user.encryptionAlg = "SHA-256+AES-VAULT";
  }
  for (const request of database.passwordRecoveryRequests || []) {
    if (request.userId !== "admin-owner" || (request.status !== "pending" && request.status !== "code-issued")) continue;
    request.status = "closed";
    delete request.codeHash;
    delete request.codeExpiresAt;
  }

  const tempFile = path.join(DATA_DIR, `wollo-db.reset-${process.pid}.tmp`);
  fs.writeFileSync(tempFile, JSON.stringify(database, null, 2), { encoding: "utf8", mode: 0o600 });
  try {
    fs.renameSync(tempFile, DB_FILE);
  } catch (error) {
    fs.rmSync(tempFile, { force: true });
    throw error;
  }

  process.stdout.write(`Admin password reset successfully for ${ADMIN_EMAIL}. Restart the app and sign in with your new password.\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Local admin password reset failed.";
  console.error(message);
  process.exitCode = 1;
});
