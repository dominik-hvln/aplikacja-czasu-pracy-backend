import { Controller, Get, Post, Body, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { LocationQrCodesService } from './location-qr-codes.service';
import { CreateLocationQrCodeDto } from './dto/create-location-qr-code.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { ModuleGuard } from '../auth/module.guard';
import { RequiredModules } from '../auth/modules.decorator';

@Controller('location-qr-codes')
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
@Roles(Role.Admin, Role.Manager)
@RequiredModules('geolocation')
export class LocationQrCodesController {
    constructor(private readonly locationQrCodesService: LocationQrCodesService) { }

    @Post()
    create(@Body() createDto: CreateLocationQrCodeDto, @Req() req) {
        const companyId = req.user.company_id;
        return this.locationQrCodesService.create(createDto, companyId);
    }

    @Get()
    findAll(@Req() req) {
        const companyId = req.user.company_id;
        return this.locationQrCodesService.findAllForCompany(companyId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Req() req) {
        const companyId = req.user.company_id;
        return this.locationQrCodesService.remove(id, companyId);
    }
}