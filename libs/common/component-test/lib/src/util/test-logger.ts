import { ConsoleLogger } from "@nestjs/common";

export const createTestLogger = (context = "ComponentTest"): ConsoleLogger => {
  const logger = new ConsoleLogger(context);
  logger.setLogLevels(["error", "warn"]);
  return logger;
};
