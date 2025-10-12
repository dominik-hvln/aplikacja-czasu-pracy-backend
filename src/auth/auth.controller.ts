import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth') // Wszystkie trasy w tym kontrolerze będą zaczynać się od /auth
export class AuthController {
    constructor(private readonly authService: AuthService) {}

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
    getProfile(@Req() req) {
        return req.user;
    }
}