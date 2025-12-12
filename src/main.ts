// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            skipMissingProperties: false,
        })
    );

    const whitelist = new Set<string>([
        'http://localhost:3000',       // dev web
        'http://localhost',            // Android (Capacitor)
        'capacitor://localhost',       // iOS (Capacitor)
        'https://kadromierz.vercel.app',
    ]);

    app.enableCors({
        origin: (origin, cb) => {
            if (!origin || whitelist.has(origin)) return cb(null, true);
            console.error(`CORS blocked: ${origin}`);
            return cb(new Error('Not allowed by CORS'));
        },
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        credentials: true,
    });

    const http = app.getHttpAdapter().getInstance();
    http.get('/', (_req: any, res: any) => res.status(200).json({ ok: true }));
    http.get('/health', (_req: any, res: any) => res.status(200).json({ status: 'ok' }));

    const port = parseInt(process.env.PORT || '4000', 10);
    await app.listen(port, '0.0.0.0');
    console.log(`🚀 API up at http://0.0.0.0:${port} (NODE_ENV=${process.env.NODE_ENV || 'dev'})`);
}
bootstrap();
