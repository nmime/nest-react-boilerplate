export interface NotificationDataObject {
  [key: string]: NotificationDataValue;
}

export type NotificationDataValue = string | number | NotificationDataObject;

export type NotificationData = NotificationDataObject;
