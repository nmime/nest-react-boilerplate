import { containerManager } from "./container-manager";
import type { ContainerManager } from "./container-manager";

export const setupContainers = (): void => {
  (
    globalThis as typeof globalThis & {
      componentTestContainerManager?: ContainerManager;
    }
  ).componentTestContainerManager = containerManager;
};

export const teardownContainers = async (): Promise<void> => {
  await containerManager.stopAll();
};
