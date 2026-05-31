import type { ContainerManager } from "./container-manager";

declare global {
  var componentTestContainerManager: ContainerManager | undefined;
}
