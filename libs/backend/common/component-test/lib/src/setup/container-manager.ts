export interface ManagedTestContainer {
  stop(): Promise<void> | void;
}

export interface ContainerStopFailureContext {
  container: ManagedTestContainer;
  stopIndex: number;
  totalContainers: number;
}

export class ContainerStopError extends Error {
  constructor(
    message: string,
    public readonly context: ContainerStopFailureContext,
    options: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ContainerStopError";
  }

  get container(): ManagedTestContainer {
    return this.context.container;
  }

  get stopIndex(): number {
    return this.context.stopIndex;
  }

  get totalContainers(): number {
    return this.context.totalContainers;
  }
}

export class ContainerManager {
  private readonly containers: ManagedTestContainer[] = [];

  register<T extends ManagedTestContainer>(container: T): T {
    this.containers.push(container);
    return container;
  }

  async stopAll(): Promise<void> {
    const containers = this.containers.splice(0).reverse();
    const stopResults = await Promise.allSettled(
      containers.map(async (container) => await container.stop()),
    );
    const stopErrors = stopResults.flatMap((result, stopIndex) => {
      if (result.status === "fulfilled") {
        return [];
      }

      return [
        new ContainerStopError(
          `Failed to stop managed test container at teardown index ${
            stopIndex + 1
          }/${containers.length}.`,
          {
            container: containers[stopIndex],
            stopIndex,
            totalContainers: containers.length,
          },
          { cause: result.reason },
        ),
      ];
    });

    if (stopErrors.length > 0) {
      throw new AggregateError(
        stopErrors,
        `Failed to stop ${stopErrors.length} of ${containers.length} managed test containers.`,
      );
    }
  }
}

export const containerManager = new ContainerManager();
