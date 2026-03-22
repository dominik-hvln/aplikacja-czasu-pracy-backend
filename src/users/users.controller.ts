import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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

    @Get()
    @Roles(Role.Admin, Role.Manager)
    findAll(@Req() req) {
        const companyId = req.user.company_id;
        return this.usersService.findAllForCompany(companyId);
    }

    @Patch('me/profile')
    // Każdy zalogowany może edytować swój profil (ograniczone pola w serwisie)
    updateSelf(@Body() updateUserDto: UpdateUserDto, @Req() req) {
        return this.usersService.updateSelfProfile(req.user.id, updateUserDto);
    }

    @Patch(':id')
    @Roles(Role.Admin, Role.Manager)
    update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Req() req) {
        const companyId = req.user.company_id;
        return this.usersService.update(id, updateUserDto, companyId);
    }

    @Delete(':id')
    @Roles(Role.Admin) // Tylko Admin może usuwać pracowników
    remove(@Param('id') id: string, @Req() req) {
        const companyId = req.user.company_id;
        return this.usersService.remove(id, companyId);
    }
}