import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Injectable,
  Post,
  UseGuards,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';
import { InternalException, UnauthorizedException } from '@app/backend-common-exception';
import { supportedLocales, type Locale } from '@app/backend-common-i18n';
import { AuthProvider, DefaultAuthTenantId, normalizeTenantId, Public } from '@app/backend-feature-auth-shared';
import { ExternalAuthService } from '../../application/external-auth.service';
import { AuthUserStoreInjectToken, type AuthUserStore } from '../../infrastructure/auth-user-store';

class TelegramBotSubjectDto {
  @IsString()
  @Matches(/^\d{1,20}$/u)
  providerSubject!: string;
}

class TelegramBotBridgeLinkDto extends TelegramBotSubjectDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/u)
  linkToken!: string;
}

class TelegramBotBridgeLocaleDto extends TelegramBotSubjectDto {
  @IsIn(supportedLocales)
  locale!: Locale;
}

/** A dedicated service credential authenticates transport-verified bot senders. */
@Injectable()
export class TelegramBotAuthBridgeService {
  private readonly credentialHash: Buffer | undefined;
  private readonly tenantId: string;

  constructor(
    @Inject(ExternalAuthService) private readonly externalAuth: ExternalAuthService,
    @Inject(AuthUserStoreInjectToken) private readonly users: AuthUserStore,
  ) {
    const secret = process.env.TELEGRAM_BOT_AUTH_SECRET?.trim();
    const configuredTenant = process.env.TELEGRAM_BOT_AUTH_TENANT_ID?.trim();
    if ((secret && !/^[\x21-\x7e]{32,256}$/u.test(secret)) || (configuredTenant && !secret)) {
      throw new Error('Telegram bot auth bridge requires a dedicated 32–256 character service credential.');
    }
    const tenant = configuredTenant ? normalizeTenantId(configuredTenant) : DefaultAuthTenantId;
    if (!tenant) {
      throw new Error('TELEGRAM_BOT_AUTH_TENANT_ID must be a UUID.');
    }
    this.tenantId = tenant;
    this.credentialHash = secret ? hashCredential(secret) : undefined;
  }

  authenticate(authorization: unknown): void {
    if (
      !this.credentialHash ||
      typeof authorization !== 'string' ||
      authorization.length > 263 ||
      !authorization.startsWith('Bearer ') ||
      !timingSafeEqual(this.credentialHash, hashCredential(authorization.slice(7)))
    ) {
      throw new UnauthorizedException();
    }
  }

  async resolve(providerSubject: string) {
    if (process.env.AUTH_TELEGRAM_ENABLED === 'false') {
      return null;
    }
    const principal = await this.externalAuth.resolveProviderPrincipal(
      AuthProvider.Telegram,
      providerSubject,
      this.tenantId,
    );
    if (!principal) {
      return null;
    }
    const found = await this.users.findById(principal.subject, this.tenantId);
    if (found.isErr()) {
      throw new InternalException();
    }
    return found.value?.status === 'active'
      ? { userId: found.value.id, tenantId: this.tenantId, locale: found.value.locale }
      : null;
  }

  async link(input: TelegramBotBridgeLinkDto) {
    const result = await this.externalAuth.telegramBotLink({ ...input, expectedTenantId: this.tenantId });
    if (result.status !== 'linked') {
      throw new UnauthorizedException();
    }
    return this.resolve(input.providerSubject);
  }

  async updateLocale(input: TelegramBotBridgeLocaleDto) {
    // Never accept a cached bot userId or a caller-selected tenant as authority.
    const principal = await this.resolve(input.providerSubject);
    if (!principal) {
      throw new UnauthorizedException();
    }
    const updated = await this.users.setLocale(principal.userId, input.locale, this.tenantId);
    if (updated.isErr()) {
      throw new InternalException();
    }
    if (!updated.value || updated.value.status !== 'active') {
      throw new UnauthorizedException();
    }
    return { userId: updated.value.id, tenantId: this.tenantId, locale: updated.value.locale };
  }
}

function hashCredential(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

@Injectable()
export class TelegramBotAuthBridgeGuard implements CanActivate {
  constructor(@Inject(TelegramBotAuthBridgeService) private readonly bridge: TelegramBotAuthBridgeService) {}

  canActivate(context: ExecutionContext): boolean {
    this.bridge.authenticate(
      context.switchToHttp().getRequest<{ headers: { authorization?: unknown } }>().headers.authorization,
    );
    return true;
  }
}

@ApiExcludeController()
@Controller('auth/internal/telegram-bot')
@Public()
@UseGuards(TelegramBotAuthBridgeGuard)
export class TelegramBotAuthBridgeController {
  constructor(@Inject(TelegramBotAuthBridgeService) private readonly bridge: TelegramBotAuthBridgeService) {}

  @Post('resolve')
  @HttpCode(200)
  resolve(
    @Body(
      new ValidationPipe({
        expectedType: TelegramBotSubjectDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    input: TelegramBotSubjectDto,
  ) {
    return this.bridge.resolve(input.providerSubject);
  }

  @Post('link')
  @HttpCode(200)
  link(
    @Body(
      new ValidationPipe({
        expectedType: TelegramBotBridgeLinkDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    input: TelegramBotBridgeLinkDto,
  ) {
    return this.bridge.link(input);
  }

  @Post('locale')
  @HttpCode(200)
  updateLocale(
    @Body(
      new ValidationPipe({
        expectedType: TelegramBotBridgeLocaleDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    input: TelegramBotBridgeLocaleDto,
  ) {
    return this.bridge.updateLocale(input);
  }
}
