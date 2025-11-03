import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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
            provide: 'MAILER',
            useFactory: async (config: ConfigService) => {
                const host = config.get<string>('SMTP_HOST')!;
                const port = Number(config.get<string>('SMTP_PORT') ?? 587);
                // 465 = SSL od razu; 587/2525 = STARTTLS
                const secure = port === 465 || String(config.get('SMTP_SECURE')).toLowerCase() === 'true';

                const base = {
                    host,
                    port,
                    secure,
                    auth: config.get('SMTP_USER')
                        ? { user: config.get<string>('SMTP_USER')!, pass: config.get<string>('SMTP_PASS')! }
                        : undefined,
                    // żeby nie „wisieć” przy problemach sieciowych:
                    connectionTimeout: 10_000,
                    greetingTimeout: 10_000,
                    socketTimeout: 15_000,
                    // wymuś IPv4 – częsty powód timeoutów na nieosiągalnym IPv6
                    family: 4 as 4 | 6,
                    // STARTTLS na 587/2525
                    requireTLS: !secure,
                    tls: {
                        // jeśli Twój serwer ma poprawny cert, zostaw domyślnie;
                        // w razie debugowania własnego/self-signed możesz tymczasowo dodać:
                        // rejectUnauthorized: false,
                        minVersion: 'TLSv1.2',
                    },
                    // opcjonalnie: pool stabilizuje połączenie przy wielu wysyłkach
                    pool: true,
                    maxConnections: 2,
                    maxMessages: 50,
                } as const;

                // transporter główny
                let transporter = nodemailer.createTransport(base);

                // weryfikacja – zobaczysz w logach sukces/błąd
                try {
                    await transporter.verify();
                } catch (e) {
                    // fallback: jeśli 587/2525 nie działa, spróbuj 465+SSL
                    const msg = (e as Error).message || String(e);
                    console.warn('[MAILER] verify failed on', host, port, msg);
                    if (!secure) {
                        const fallback = { ...base, port: 465, secure: true };
                        const t2 = nodemailer.createTransport(fallback);
                        try {
                            await t2.verify();
                            console.warn('[MAILER] fallback to 465/SSL succeeded');
                            transporter = t2;
                        } catch (e2) {
                            console.warn('[MAILER] fallback verify failed:', (e2 as Error).message);
                        }
                    }
                }

                return transporter;
            },
            inject: [ConfigService],
        },
    ],
})
export class AuthModule {}
