import crypto from "node:crypto";

const pending = new Map(); // challenge -> expiry
const tokens = new Set();

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const unb64url = (s) => Buffer.from(s, "base64url");

function prune() {
  const now = Date.now();
  for (const [k, v] of pending) if (v < now) pending.delete(k);
}

export function registrationOptions(rpName) {
  prune();
  const challenge = b64url(crypto.randomBytes(32));
  pending.set(challenge, Date.now() + 120000);
  return {
    challenge,
    rp: { name: rpName, id: "localhost" },
    user: { id: b64url(crypto.randomBytes(16)), name: "owner", displayName: "OpenEveryAgent Owner" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    timeout: 60000,
    authenticatorSelection: { userVerification: "preferred", residentKey: "preferred" },
    attestation: "none",
  };
}

export function finishRegistration(stored, credIdB64, coseKeyB64) {
  if (!credIdB64 || !coseKeyB64) return false;
  stored.credId = credIdB64;
  stored.key = coseKeyB64;
  return true;
}

function importCoseP256(coseB64) {
  const buf = unb64url(coseB64);
  const xi = buf.indexOf(Buffer.from([0x21, 0x58, 0x20]));
  const yi = buf.indexOf(Buffer.from([0x22, 0x58, 0x20]));
  if (xi === -1 || yi === -1) throw new Error("not a P-256 COSE key");
  const x = buf.subarray(xi + 3, xi + 35);
  const y = buf.subarray(yi + 3, yi + 35);
  return crypto.createPublicKey({
    key: { kty: "EC", crv: "P-256", x: x.toString("base64url"), y: y.toString("base64url") },
    format: "jwk",
  });
}

export function authOptions() {
  prune();
  const challenge = b64url(crypto.randomBytes(32));
  pending.set(challenge, Date.now() + 120000);
  return { challenge, timeout: 60000, userVerification: "preferred" };
}

export function verifyAssertion(stored, credIdB64, authDataB64, clientDataB64, sigB64) {
  if (!stored?.credId || credIdB64 !== stored.credId) return null;
  const clientDataRaw = unb64url(clientDataB64);
  const clientData = JSON.parse(clientDataRaw.toString("utf8"));
  if (clientData.type !== "webauthn.get") return null;
  if (!pending.has(clientData.challenge)) return null;
  pending.delete(clientData.challenge);
  if (!/^https?:\/\/(localhost|127\.|\[::1\])/.test(clientData.origin || "")) return null;
  const authData = unb64url(authDataB64);
  if (authData.length < 37) return null;
  const flags = authData[32];
  if (!(flags & 0x01)) return null; // user present
  const signed = Buffer.concat([authData, crypto.createHash("sha256").update(clientDataRaw).digest()]);
  let pub;
  try {
    pub = importCoseP256(stored.key);
  } catch {
    return null;
  }
  const ok = crypto.verify("sha256", signed, { key: pub, dsaEncoding: "der" }, unb64url(sigB64));
  if (!ok) return null;
  const token = crypto.randomBytes(24).toString("hex");
  tokens.add(token);
  return token;
}

export function checkToken(token) {
  return !!token && tokens.has(token);
}

export function revokeToken(token) {
  tokens.delete(token);
}
