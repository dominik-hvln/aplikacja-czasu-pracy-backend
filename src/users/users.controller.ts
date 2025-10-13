import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard) // Używamy obu strażników
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Post()
    @Roles(Role.Admin, Role.Manager)
    create(@Body() createUserDto: CreateUserDto, @Req() req) {
        // Nowy pracownik jest zawsze przypisany do firmy admina, który go tworzy
        const companyId = req.user.company_id;
        return this.usersService.create(createUserDto, companyId);
    }
}