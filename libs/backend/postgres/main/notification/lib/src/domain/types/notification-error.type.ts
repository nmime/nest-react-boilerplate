import { NotificationErrorReason } from '../enums';

export interface NotificationError {
  reason: NotificationErrorReason;
  message?: string;
}
