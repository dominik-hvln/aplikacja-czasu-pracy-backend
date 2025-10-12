import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private readonly configService: ConfigService,
        private readonly supabaseService: SupabaseService,
    ) {
        const secret = configService.get<string>('SUPABASE_JWT_SECRET');
        if (!secret) {
            throw new Error('JWT Secret not found in environment variables');
        }

        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: secret,
        });
    }

    // Ta metoda jest wywoływana, gdy token zostanie pomyślnie zwalidowany
    async validate(payload: any) {
        const supabase = this.supabaseService.getClient();

        // Pobieramy pełny profil użytkownika z naszej tabeli `users`
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', payload.sub) // `sub` to standardowe pole w JWT oznaczające ID użytkownika
            .single();

        if (error || !user) {
            throw new UnauthorizedException('Użytkownik nie znaleziony.');
        }

        // Zwrócony obiekt zostanie dołączony do obiektu `request` jako `req.user`
        return user;
    }
}