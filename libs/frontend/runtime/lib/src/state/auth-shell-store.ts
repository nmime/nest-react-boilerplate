import { makeAutoObservable } from "mobx";

export class AuthShellStore {
  bearerToken: string | null = null;
  refreshToken: string | null = null;

  constructor(initialBearerToken?: string | null) {
    this.bearerToken = this.normalizeToken(initialBearerToken);
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isAuthenticated(): boolean {
    return Boolean(this.bearerToken);
  }

  setBearerToken(nextToken?: string | null): void {
    this.bearerToken = this.normalizeToken(nextToken);
  }

  setSession(
    nextBearerToken?: string | null,
    nextRefreshToken?: string | null,
  ): void {
    this.bearerToken = this.normalizeToken(nextBearerToken);
    this.refreshToken = this.normalizeToken(nextRefreshToken);
  }

  clearBearerToken(): void {
    this.bearerToken = null;
  }

  clearSession(): void {
    this.bearerToken = null;
    this.refreshToken = null;
  }

  private normalizeToken(token?: string | null): string | null {
    const normalized = token?.trim() ?? "";
    return normalized ? normalized : null;
  }
}
