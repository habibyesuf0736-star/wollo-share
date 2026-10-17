import crypto from "crypto";

const PEPPER = "WOLLO_SHARE_SECURITY_PEPPER_2026_V1";
const VAULT_MASTER_KEY = "WOLLO_SHARE_AES_CTR_HMAC_VAULT_KEY_2026_V1";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(String(input ?? ""), "utf8").digest("hex");
}

function utf8ToHex(str: string): string {
  return Buffer.from(String(str ?? ""), "utf8").toString("hex");
}

export function hashPassword(plain: string, saltContext = "wollo_default_salt"): string {
  const str = String(plain ?? "");
  if (str.startsWith("enc$sha256$")) return str;
  const cleanSalt = String(saltContext || "wollo_default_salt").toLowerCase().trim() || "wollo_default_salt";
  const saltHex = utf8ToHex(cleanSalt);
  let digest = sha256Hex(`${PEPPER}::${cleanSalt}::${str}`);
  for (let i = 0; i < 3; i++) {
    digest = sha256Hex(`${PEPPER}::round${i}::${cleanSalt}::${digest}`);
  }
  return `enc$sha256$${saltHex}$${digest}`;
}

export function encryptVaultSecret(plainText: string, contextKey = "default", fixedIvHex = ""): string {
  const str = String(plainText ?? "");
  if (!str || str.startsWith("enc$vault$")) return str;
  const ivHex = fixedIvHex || crypto.randomBytes(8).toString("hex");
  const plainBytes = Buffer.from(str, "utf8");
  const outBytes = Buffer.alloc(plainBytes.length);
  for (let blockIdx = 0; blockIdx * 32 < plainBytes.length; blockIdx++) {
    const keystreamHex = sha256Hex(`${VAULT_MASTER_KEY}::STREAM::${contextKey}::${ivHex}::${blockIdx}`);
    const keystream = Buffer.from(keystreamHex, "hex");
    for (let j = 0; j < 32 && blockIdx * 32 + j < plainBytes.length; j++) {
      outBytes[blockIdx * 32 + j] = plainBytes[blockIdx * 32 + j] ^ keystream[j];
    }
  }
  const cipherHex = outBytes.toString("hex");
  const macHex = sha256Hex(`${VAULT_MASTER_KEY}::MAC::${contextKey}::${ivHex}::${cipherHex}`).slice(0, 24);
  return `enc$vault$${ivHex}$${cipherHex}$${macHex}`;
}
