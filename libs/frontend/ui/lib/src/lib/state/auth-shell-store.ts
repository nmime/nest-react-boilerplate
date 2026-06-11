import { makeAutoObservable } from "mobx";

export class AuthShellStore {
  bearerToken: string | null = null;

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

  clearBearerToken(): void {
    this.bearerToken = null;
  }

  private normalizeToken(token?: string | null): string | null {
    const normalized = token?.trim() ?? "";
    return normalized ? normalized : null;
  }
}
