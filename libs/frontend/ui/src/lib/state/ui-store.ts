import { makeAutoObservable } from "mobx";

export type UiTheme = "light" | "dark" | "system";

export class UiStore {
  activeModal: string | null = null;
  sidebarOpen = true;
  theme: UiTheme = "system";

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setTheme(theme: UiTheme): void {
    this.theme = theme;
  }

  setSidebarOpen(open: boolean): void {
    this.sidebarOpen = open;
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  openModal(modalId: string): void {
    this.activeModal = modalId;
  }

  closeModal(): void {
    this.activeModal = null;
  }
}
