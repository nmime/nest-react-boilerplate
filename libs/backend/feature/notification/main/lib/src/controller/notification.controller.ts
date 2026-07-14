import { Body, Controller, Post } from '@nestjs/common';
import {
  CreateNotificationBatchRequestDto,
  CreateNotificationRequestDto,
  NotificationService,
} from '@app/common-notification';

@Controller('api/v1/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('template')
  async createTemplateNotification(
    @Body() body: CreateNotificationRequestDto,
  ): Promise<{ id: string; templateCode: string }> {
    const notification = await this.notificationService.createTemplateNotification({
      channel: body.channel,
      targetType: body.targetType,
      targetId: body.targetId,
      templateCode: body.templateCode,
      data: body.data,
      priority: body.priority,
    });

    return { id: notification?.id ?? '', templateCode: body.templateCode };
  }

  @Post('template/batch')
  async createTemplateNotificationsBatch(@Body() body: CreateNotificationBatchRequestDto): Promise<{ count: number }> {
    await this.notificationService.createTemplateNotificationsBatch({
      channel: body.channel,
      targetType: body.targetType,
      items: body.items.map((item) => ({
        targetId: item.targetId,
        templateCode: item.templateCode,
        data: item.data,
        priority: item.priority,
      })),
    });

    return { count: body.items.length };
  }
}
