export abstract class NotificationDeliveryPartitionMaintenance {
  abstract ensurePartitions(aheadMonths: number, now?: Date): Promise<void>;
}
