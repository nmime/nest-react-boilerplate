export interface ManagedTestContainer {
  stop(): Promise<void> | void;
}

export class ContainerManager {
  private readonly containers: ManagedTestContainer[] = [];

  register<T extends ManagedTestContainer>(container: T): T {
    this.containers.push(container);
    return container;
  }

  async stopAll(): Promise<void> {
    const containers = this.containers.splice(0).reverse();
    await Promise.all(
      containers.map((container) => Promise.resolve(container.stop())),
    );
  }
}

export const containerManager = new ContainerManager();
