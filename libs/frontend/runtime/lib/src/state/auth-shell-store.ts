import { makeAutoObservable } from 'mobx';

export class AuthShellStore {
  sessionStatus: 'unknown' | 'authenticated' | 'guest' = 'unknown';

  constructor(initiallyAuthenticated = false) {
    if (initiallyAuthenticated) {
      this.sessionStatus = 'authenticated';
    }
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isAuthenticated(): boolean {
    return this.sessionStatus === 'authenticated';
  }

  markAuthenticated(): void {
    this.sessionStatus = 'authenticated';
  }

  clearSession(): void {
    this.sessionStatus = 'guest';
  }
}
