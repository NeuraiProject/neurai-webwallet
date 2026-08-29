/**
 * One place to turn an RPC failure into something a user can read.
 *
 * Two contracts arrive here, and they must produce the same text:
 *
 *   `Error` — what jswallet >= 0.15 rejects with. Its `message` names the RPC
 *   method and the useful description, `cause` holds the original rejection and
 *   `code` carries the JSON-RPC code when there was one.
 *
 *   The legacy structured object — `{ error: { message } }`, `{ statusText }`
 *   and friends — still reaching us from anything that talks to the node
 *   without going through jswallet.
 *
 * The classification below (timeout, unreachable) used to run only on the
 * legacy shape. Once every jswallet rejection became an `Error`, that branch
 * returned early and the classification was silently dead: a server that was
 * simply unreachable started showing a raw transport message instead of saying
 * so. Both paths now share it.
 */

type RpcErrorShape = {
  message?: unknown;
  error?: {
    message?: unknown;
    error?: {
      message?: unknown;
    };
  };
  data?: {
    message?: unknown;
  };
  response?: {
    data?: {
      error?: unknown;
    };
    statusText?: unknown;
  };
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
};

/** Failures the user can act on, phrased as the situation rather than the symptom. */
function classify(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes("timeout")) {
    return "RPC timeout: server is not responding";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed")
  ) {
    return "RPC unreachable: cannot connect to server";
  }
  return null;
}

function asStatus(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/**
 * @param err - Anything thrown by an RPC call
 * @returns A single-line description safe to show the user
 */
export function formatRpcError(err: unknown): string {
  if (!err) return "Unknown RPC error";
  if (typeof err === "string") return classify(err) ?? err;

  if (err instanceof Error) {
    const message = String(err.message || "").trim();
    if (!message) return "RPC error";
    const classified = classify(message);
    if (classified) return classified;
    // jswallet exposes the JSON-RPC code on the error itself so callers do not
    // have to dig through `cause`; show it when there is one.
    const status = asStatus((err as Error & { code?: unknown }).code);
    return status ? `RPC error (${status}): ${message}` : message;
  }

  const errorObj = err as RpcErrorShape;
  const msgCandidate =
    errorObj?.message ??
    errorObj?.error?.message ??
    errorObj?.error?.error?.message ??
    errorObj?.data?.message ??
    errorObj?.response?.data?.error ??
    errorObj?.response?.statusText ??
    null;

  const status = asStatus(errorObj?.status ?? errorObj?.statusCode ?? errorObj?.code);
  const msg = typeof msgCandidate === "string" ? msgCandidate.trim() : "";

  const classified = classify(msg);
  if (classified) return classified;

  if (msg) {
    return status ? `RPC error (${status}): ${msg}` : `RPC error: ${msg}`;
  }

  // Last resort: show the object itself rather than an empty "RPC error".
  try {
    const seen = new WeakSet();
    const json = JSON.stringify(
      errorObj,
      (_k, v) => {
        if (typeof v === "object" && v !== null) {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        }
        return v;
      },
      2,
    );
    if (json && json !== "{}") return `RPC error: ${json}`;
  } catch {
    // Unserialisable: fall through to the generic message.
  }

  return "RPC error";
}
