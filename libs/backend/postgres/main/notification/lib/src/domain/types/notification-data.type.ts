export type NotificationDataValue = string | number | Record<string, NotificationDataValue>;

export type NotificationData = Record<string, NotificationDataValue> | Record<string, never>;
