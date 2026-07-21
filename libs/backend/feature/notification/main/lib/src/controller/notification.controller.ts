import { Body, Controller, Post, Put } from '@nestjs/common';
import {
  CreateNotificationBatchRequestDto,
  CreateNotificationRequestDto,
  NotificationService,
  UpsertNotificationTemplateRequestDto,
} from '@app/backend-feature-notification-shared';
import type { NotificationTemplateRecord } from '@app/common-notifications';

@Controller('api/v1/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Put('templates')
  upsertTemplate(@Body() body: UpsertNotificationTemplateRequestDto): Promise<NotificationTemplateRecord> {
    return this.notificationService.upsertTemplate({
      code: body.code,
      description: body.description,
      channels: body.channels,
    });
  }

  @Post()
  async createTemplateNotification(
    @Body() body: CreateNotificationRequestDto,
  ): Promise<{ id: string; templateCode: string }> {
    const notification = await this.notificationService.createTemplateNotification({
      targetType: body.targetType,
      targetId: body.targetId,
      templateCode: body.templateCode,
      deliveries: body.deliveries,
      channels: body.channels,
      inAppVisible: body.inAppVisible,
      data: body.data,
      extra: body.extra,
      priority: body.priority,
      sendAfter: body.sendAfter ? new Date(body.sendAfter) : undefined,
    });

    return { id: notification.id, templateCode: body.templateCode };
  }

  @Post('batch')
  async createTemplateNotificationsBatch(@Body() body: CreateNotificationBatchRequestDto): Promise<{ ids: string[] }> {
    const notifications = await this.notificationService.createTemplateNotificationsBatch({
      targetType: body.targetType,
      deliveries: body.deliveries,
      channels: body.channels,
      inAppVisible: body.inAppVisible,
      priority: body.priority,
      sendAfter: body.sendAfter ? new Date(body.sendAfter) : undefined,
      items: body.items.map((item) => ({
        targetId: item.targetId,
        templateCode: item.templateCode,
        deliveries: item.deliveries,
        channels: item.channels,
        inAppVisible: item.inAppVisible,
        data: item.data,
        extra: item.extra,
        priority: item.priority,
        sendAfter: item.sendAfter ? new Date(item.sendAfter) : undefined,
      })),
    });

    return { ids: notifications.map((notification) => notification.id) };
  }
}
