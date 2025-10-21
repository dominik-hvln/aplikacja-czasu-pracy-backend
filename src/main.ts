// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Upewnij się, że ValidationPipe ma opcję skipMissingProperties
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true, // Dodatkowe zabezpieczenie
        skipMissingProperties: false // Zostaw na false dla POST/PATCH
    }));

    // ✅ UPROSZCZONA I POPRAWIONA KONFIGURACJA CORS
    const whitelist = [
        'http://localhost:3000',   // Dla dewelopmentu webowego
        'https://localhost',         // Dla Android Capacitor
        'capacitor://localhost',     // Dla iOS Capacitor
        'https://kadromierz.vercel.app', // ✅ DODAJ SWÓJ ADRES VERCEL
    ];

    app.enableCors({
        origin: function (origin, callback) {
            // Zezwalaj na żądania bez 'origin' (np. z Postmana, testy serwer-serwer)
            // LUB jeśli origin jest na białej liście
            if (!origin || whitelist.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                console.error(`CORS Error: Origin ${origin} not allowed.`); // Loguj blokowane adresy
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', // ✅ Jawnie dodaj OPTIONS
        credentials: true,
    });

    await app.listen(process.env.PORT || 4000); // Użyj PORT z Render lub domyślny
}
bootstrap();