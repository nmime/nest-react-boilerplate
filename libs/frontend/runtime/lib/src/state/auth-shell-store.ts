import { makeAutoObservable } from 'mobx';

export class AuthShellStore {
  sessionStatus: 'unknown' | 'authenticated' | 'guest' = 'unknown';
  /** Public account metadata for cache ownership; never a credential. */
  principalKey: string | null = null;

  constructor(initiallyAuthenticated = false) {
    if (initiallyAuthenticated) {
      this.sessionStatus = 'authenticated';
    }
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isAuthenticated(): boolean {
    return this.sessionStatus === 'authenticated';
  }

  markAuthenticated(principal?: { subject: string; tenantId: string }): void {
    this.sessionStatus = 'authenticated';
    this.principalKey = principal ? JSON.stringify([principal.tenantId, principal.subject]) : null;
  }

  clearSession(): void {
    this.sessionStatus = 'guest';
    this.principalKey = null;
  }
}
