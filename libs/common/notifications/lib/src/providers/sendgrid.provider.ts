import type { NotificationProvider, SendEmailInput, SendEmailResult } from '../contracts/notification.provider';

export class SendGridProvider implements NotificationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string,
  ) {}

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: { email: this.fromEmail },
        subject: input.subject,
        templateId: input.templateId,
        dynamic_template_data: input.variables,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SendGrid error ${response.status}: ${text}`);
    }

    return { success: true };
  }
}
