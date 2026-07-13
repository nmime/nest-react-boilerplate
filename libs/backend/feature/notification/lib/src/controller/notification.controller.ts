import { Body, Controller, Logger, Post } from '@nestjs/common';
import { NotificationService } from '@app/common-notification';

@Controller('api/v1/notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly notificationService: NotificationService) {}

  @Post('template')
  async createTemplateNotification(
    @Body() body: {
      channel: string;
      targetType: string;
      targetId: string;
      templateCode: string;
      data?: Record<string, unknown>;
      priority?: number;
    },
  ): Promise<{ id: string; templateCode: string }> {
    const notification = await this.notificationService.createTemplateNotification({
      channel: body.channel as any,
      targetType: body.targetType as any,
      targetId: body.targetId,
      templateCode: body.templateCode,
      data: body.data,
      priority: body.priority,
    });

    return { id: notification?.id ?? '', templateCode: body.templateCode };
  }

  @Post('template/batch')
  async createTemplateNotificationsBatch(
    @Body() body: {
      channel: string;
      targetType: string;
      items: { targetId: string; templateCode: string; data?: Record<string, unknown>; priority?: number }[];
    },
  ): Promise<{ count: number }> {
    await this.notificationService.createTemplateNotificationsBatch({
      channel: body.channel as any,
      targetType: body.targetType as any,
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
