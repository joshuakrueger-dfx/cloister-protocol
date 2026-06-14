// =====================================================================
// DfxApi — thin browser fetch client for api.dfx.swiss.
// Ported from dfx-wallet (env → constant). Bearer injection, 401 refresh,
// public (unauth) GET for the per-user-filtered /asset + /fiat catalogs.
// CORS on api.dfx.swiss is `Access-Control-Allow-Origin: *`, so the browser
// calls the API directly — no proxy.
// =====================================================================

export const DFX_API_BASE = "https://api.dfx.swiss";

type RequestOptions = { signal?: AbortSignal; headers?: Record<string, string> };

export class DfxApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DfxApiError";
  }
  get isKycRequired(): boolean {
    return this.code === "KYC_LEVEL_REQUIRED" || this.code === "KYC_DATA_REQUIRED";
  }
  get isRegistrationRequired(): boolean {
    return this.code === "REGISTRATION_REQUIRED";
  }
}

class DfxApi {
  private baseUrl = DFX_API_BASE;
  private authToken: string | null = null;
  private onUnauthorized: (() => Promise<string | null>) | null = null;

  setAuthToken(token: string) { this.authToken = token; }
  clearAuthToken() { this.authToken = null; }
  getAuthToken(): string | null { return this.authToken; }
  setOnUnauthorized(handler: () => Promise<string | null>) { this.onUnauthorized = handler; }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", path, body, options);
  }
  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  /** Unauthenticated GET for public catalogs (/v1/asset, /v1/fiat). DFX filters
   *  those per-user when authenticated, returning a subset that may omit the
   *  asset/fiat a buy needs — so we fetch them without the Bearer. */
  async getPublic<T>(path: string, options?: { signal?: AbortSignal }): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    return this.handleResponse<T>(response);
  }

  private async request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const response = await this.doFetch(method, path, body, options);
    if (response.status === 401 && this.onUnauthorized) {
      const newToken = await this.onUnauthorized();
      if (newToken) {
        this.authToken = newToken;
        return this.handleResponse<T>(await this.doFetch(method, path, body, options));
      }
    }
    return this.handleResponse<T>(response);
  }

  private doFetch(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<Response> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    return fetch(url, {
      method,
      headers: this.getHeaders(options?.headers),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let apiError: { statusCode: number; code: string; message: string | string[] };
      try {
        apiError = await response.json();
      } catch {
        apiError = { statusCode: response.status, code: "UNKNOWN", message: `HTTP ${response.status}` };
      }
      const message = Array.isArray(apiError.message) ? apiError.message.join(", ") : apiError.message;
      throw new DfxApiError(apiError.statusCode ?? response.status, apiError.code ?? "UNKNOWN", message);
    }
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  private getHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
    if (this.authToken) headers["Authorization"] = `Bearer ${this.authToken}`;
    return headers;
  }
}

export const dfxApi = new DfxApi();
