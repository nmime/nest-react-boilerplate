import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import * as notificationsSource from '@app/common-notifications';
import type { AcceptanceWorld } from '../support/world.ts';

// Executable acceptance evidence for REQ-NOTIFY-DELIVERY-001.
const notifications =
  (
    notificationsSource as unknown as {
      default?: typeof notificationsSource;
    }
  ).default ?? notificationsSource;
const { isNotificationDeliveryChannel, NotificationChannel } = notifications;
type NotificationChannelValue = (typeof NotificationChannel)[keyof typeof NotificationChannel];
Given('an in-app notification channel', function (this: AcceptanceWorld) {
  this.notificationChannel = NotificationChannel.InApp;
});

Given('an email notification channel', function (this: AcceptanceWorld) {
  this.notificationChannel = NotificationChannel.Email;
});

When('it is evaluated for external delivery', function (this: AcceptanceWorld) {
  this.externalDelivery = isNotificationDeliveryChannel(this.notificationChannel as NotificationChannelValue);
});

Then('the channel is rejected for external delivery', function (this: AcceptanceWorld) {
  assert.equal(this.externalDelivery, false);
});

Then('the channel is accepted for external delivery', function (this: AcceptanceWorld) {
  assert.equal(this.externalDelivery, true);
});
