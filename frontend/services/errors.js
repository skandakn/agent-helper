/**
 * One error type for every backend failure.
 *
 * `request()` used to throw two different shapes — a bare `Error` with a
 * `.network` flag for transport failures, and another with `.status` for HTTP
 * errors — and each caller invented its own handling. Some rendered
 * `err.message` (which for a 422 was a raw Pydantic `loc: msg` string), some
 * swallowed the error entirely, and nothing distinguished "your session
 * expired" from "the backend is asleep". This module gives every failure a
 * kind, a message written for a person, and an explicit "is retrying
 * meaningful" answer.
 */

export const ERROR_KIND = {
  OFFLINE: "offline",
  TIMEOUT: "timeout",
  NETWORK: "network",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  VALIDATION: "validation",
  CONFLICT: "conflict",
  RATE_LIMITED: "rate_limited",
  SERVER: "server",
  UNKNOWN: "unknown",
};

/** Whether re-issuing the identical request could plausibly succeed. */
const RETRYABLE = new Set([
  ERROR_KIND.OFFLINE,
  ERROR_KIND.TIMEOUT,
  ERROR_KIND.NETWORK,
  ERROR_KIND.RATE_LIMITED,
  ERROR_KIND.SERVER,
]);

/** What the person can actually do about it, keyed for the UI. */
const ACTION = {
  [ERROR_KIND.OFFLINE]: "retry",
  [ERROR_KIND.TIMEOUT]: "retry",
  [ERROR_KIND.NETWORK]: "checkConnection",
  [ERROR_KIND.UNAUTHORIZED]: "signIn",
  [ERROR_KIND.FORBIDDEN]: "none",
  [ERROR_KIND.NOT_FOUND]: "none",
  [ERROR_KIND.VALIDATION]: "fixInput",
  [ERROR_KIND.CONFLICT]: "reload",
  [ERROR_KIND.RATE_LIMITED]: "retry",
  [ERROR_KIND.SERVER]: "retry",
  [ERROR_KIND.UNKNOWN]: "retry",
};

export class ApiError extends Error {
  constructor(kind, message, { status = null, detail = null, path = "", cause = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.detail = detail;
    this.path = path;
    this.retryable = RETRYABLE.has(kind);
    this.action = ACTION[kind] || "retry";
    if (cause) this.cause = cause;
  }

  /** Translation key for a short, human-readable summary. */
  get messageKey() {
    return `errors.${this.kind}`;
  }

  toJSON() {
    return {
      kind: this.kind,
      status: this.status,
      path: this.path,
      message: this.message,
      retryable: this.retryable,
      action: this.action,
    };
  }
}

/** Map an HTTP status onto a kind. */
export function kindForStatus(status) {
  if (status === 401) return ERROR_KIND.UNAUTHORIZED;
  if (status === 403) return ERROR_KIND.FORBIDDEN;
  if (status === 404) return ERROR_KIND.NOT_FOUND;
  if (status === 409) return ERROR_KIND.CONFLICT;
  if (status === 422 || status === 400) return ERROR_KIND.VALIDATION;
  if (status === 429) return ERROR_KIND.RATE_LIMITED;
  if (status >= 500) return ERROR_KIND.SERVER;
  return ERROR_KIND.UNKNOWN;
}

/**
 * Flatten FastAPI's error bodies into one readable line.
 * A 422 arrives as `[{loc: ["body","theme"], msg: "field required"}]`.
 */
export function formatDetail(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        const loc = Array.isArray(item?.loc)
          ? item.loc.filter((part) => part !== "body").join(".")
          : "";
        const message = item?.msg || JSON.stringify(item);
        return loc ? `${loc}: ${message}` : message;
      })
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    return detail.message || detail.msg || JSON.stringify(detail);
  }
  return String(detail ?? "");
}

export function isApiError(err) {
  return err instanceof ApiError;
}

/** Wrap anything thrown into an ApiError so callers only handle one shape. */
export function toApiError(err, path = "") {
  if (isApiError(err)) return err;
  return new ApiError(ERROR_KIND.UNKNOWN, err?.message || "Unexpected error.", {
    path,
    cause: err,
  });
}
