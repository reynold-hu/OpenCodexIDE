/* WebAuthn (Touch ID) helpers — original implementation */
const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string) => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "===".slice((pad.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export function passkeySupported() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}

export async function registerPasskey(): Promise<{ token: string }> {
  const opts = await fetch("/api/passkey/register-begin", { method: "POST" }).then((r) => r.json());
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: unb64u(opts.challenge),
      rp: opts.rp,
      user: { id: unb64u(opts.user.id), name: opts.user.name, displayName: opts.user.displayName },
      pubKeyCredParams: opts.pubKeyCredParams,
      timeout: opts.timeout,
      authenticatorSelection: opts.authenticatorSelection,
      attestation: opts.attestation,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("registration cancelled");
  const resp = cred.response as AuthenticatorAttestationResponse;
  const cose = resp.getPublicKey ? resp.getPublicKey() : (resp as any).attestationObject;
  const r = await fetch("/api/passkey/register-finish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credId: b64u(cred.rawId), coseKey: b64u(cose as ArrayBuffer) }),
  }).then((x) => x.json());
  if (!r.token) throw new Error(r.error || "registration failed");
  return r;
}

export async function authenticatePasskey(): Promise<{ token: string }> {
  const opts = await fetch("/api/passkey/auth-begin", { method: "POST" }).then((r) => r.json());
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: unb64u(opts.challenge),
      timeout: opts.timeout,
      userVerification: opts.userVerification,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("authentication cancelled");
  const resp = assertion.response as AuthenticatorAssertionResponse;
  const r = await fetch("/api/passkey/auth-finish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      credId: b64u(assertion.rawId),
      authData: b64u(resp.authenticatorData),
      clientData: b64u(resp.clientDataJSON),
      signature: b64u(resp.signature),
    }),
  }).then((x) => x.json());
  if (!r.token) throw new Error(r.error || "verification failed");
  return r;
}
