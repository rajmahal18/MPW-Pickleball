import { createHash, randomBytes } from "node:crypto";
import { VOTING_CODE_ALPHABET, VOTING_CODE_LENGTH } from "@/lib/tournament/config";

export function normalizeVotingCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function secret(name: "VOTING_CODE_PEPPER" | "VOTE_ATTEMPT_SALT", developmentFallback: string) {
  const value = process.env[name] || process.env.SESSION_SECRET;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production") throw new Error(`${name} or SESSION_SECRET must contain at least 16 characters in production.`);
  return developmentFallback;
}

export function hashVotingCode(code: string) {
  return createHash("sha256")
    .update(`${secret("VOTING_CODE_PEPPER", "local-development-pepper")}:${normalizeVotingCode(code)}`)
    .digest("hex");
}

export function votingCodeHint(code: string) {
  const normalized = normalizeVotingCode(code);
  return `${normalized.slice(0, 3)}…${normalized.slice(-3)}`;
}

export function generateVotingCode(length = VOTING_CODE_LENGTH) {
  const bytes = randomBytes(length * 2);
  let code = "";
  for (const byte of bytes) {
    code += VOTING_CODE_ALPHABET[byte % VOTING_CODE_ALPHABET.length];
    if (code.length === length) break;
  }
  return code.match(/.{1,5}/g)?.join("-") ?? code;
}

export function hashNetworkIdentifier(value: string) {
  return createHash("sha256")
    .update(`${secret("VOTE_ATTEMPT_SALT", "local-attempt-salt")}:${value}`)
    .digest("hex");
}
