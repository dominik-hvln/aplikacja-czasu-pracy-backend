import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export const MAILER = 'MAILER';

@Module({
    imports: [
        SupabaseModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
        ConfigModule,

        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get<string>('SUPABASE_JWT_SECRET'),
                signOptions: { expiresIn: '1h' },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        JwtStrategy,
        {
            provide: MAILER,
            useFactory: async (config: ConfigService) => {
                const transporter = nodemailer.createTransport({
                    host: config.get<string>('SMTP_HOST'),
                    port: Number(config.get<string>('SMTP_PORT') ?? 587),
                    secure: config.get<string>('SMTP_SECURE') === 'true',
                    auth: config.get<string>('SMTP_USER')
                        ? {
                            user: config.get<string>('SMTP_USER'),
                            pass: config.get<string>('SMTP_PASS'),
                        }
                        : undefined,
                });

                // Opcjonalnie: zweryfikuj transport przy starcie (nie blokuje startu)
                try {
                    await transporter.verify();
                } catch (e) {
                    console.warn('[MAILER] verify() failed:', (e as Error)?.message);
                }
                return transporter;
            },
            inject: [ConfigService],
        },
    ],
})
export class AuthModule {}
