import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { run, type RunnerHandle } from "@grammyjs/runner";
import {
  TELEGRAM_BOT_INSTANCE,
  assertPollingRuntimeAllowed,
  type TelegramBotInstance,
} from "@app/backend-bot-telegram";

@Injectable()
export class TelegramBotWorkerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private handle: RunnerHandle | null = null;

  constructor(
    @Inject(TELEGRAM_BOT_INSTANCE)
    private readonly telegram: TelegramBotInstance,
  ) {}

  onApplicationBootstrap(): void {
    assertPollingRuntimeAllowed(this.telegram.config);
    this.handle = run(this.telegram.bot, {
      runner: { silent: this.telegram.config.environment === "test" },
      sink: { concurrency: 10 },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.handle?.stop();
    this.handle = null;
  }

  isRunning(): boolean {
    return this.handle?.isRunning() ?? false;
  }
}
