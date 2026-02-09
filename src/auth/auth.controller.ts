import { Controller, Post, Body, Get, UseGuards, Req, Query, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

@Controller('auth') // Wszystkie trasy w tym kontrolerze będą zaczynać się od /auth
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register') // Trasa POST /auth/register
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Post('login')
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Get('me')
    @UseGuards(AuthGuard('jwt'))
    async getProfile(@Req() req) {
        // req.user from JwtStrategy doesn't have modules, so we fetch full profile
        return this.authService.getUserProfile(req.user.id);
    }
    @Get('resend-test')
    resendTest(@Query('to') to: string) {
        if (!to) throw new BadRequestException('Missing ?to=email');
        // Wygeneruje magic link i wyśle mejla przez Resend (z auth.service.ts)
        return this.authService.resendVerification(to);
    }
    @Post('forgot')
    forgot(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto);
    }
    @Post('password/reset')
    reset(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto);
    }
}