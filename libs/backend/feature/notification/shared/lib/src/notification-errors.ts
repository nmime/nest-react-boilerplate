export class NotificationTemplateNotFoundError extends Error {
  constructor(readonly templateCode: string) {
    super(`Notification template not found: ${templateCode}`);
    this.name = NotificationTemplateNotFoundError.name;
  }
}

export class NotificationTemplateChannelNotFoundError extends Error {
  constructor(
    readonly templateCode: string,
    readonly channel: string,
  ) {
    super(`Notification template channel not found: ${templateCode}/${channel}`);
    this.name = NotificationTemplateChannelNotFoundError.name;
  }
}

export class EmptyNotificationAudienceError extends Error {
  constructor() {
    super('A notification must be visible in-app or have at least one delivery channel.');
    this.name = EmptyNotificationAudienceError.name;
  }
}

export class InvalidNotificationTemplateError extends Error {
  constructor(readonly reason: string) {
    super(`Invalid notification template: ${reason}`);
    this.name = InvalidNotificationTemplateError.name;
  }
}
