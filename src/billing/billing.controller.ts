import { Controller, Get, Patch, Post, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Role } from '../auth/roles.decorator';
import { BillingService } from './billing.service';
import { UpdateBillingProfileDto } from './dto/update-billing-profile.dto';

@Controller('billing')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class BillingController {
    constructor(private readonly billingService: BillingService) {}

    /** Profil rozliczeniowy firmy + flagi onboardingu. */
    @Get('profile')
    @Roles(Role.Admin, Role.Manager)
    async getProfile(@Req() req: any) {
        const company = await this.billingService.getBillingProfile(req.user.company_id);
        return {
            company,
            ...BillingService.computeFlags(company, req.user.role),
        };
    }

    /** Zapis danych firmy do faktur. */
    @Patch('profile')
    @Roles(Role.Admin, Role.Manager)
    async updateProfile(@Req() req: any, @Body() dto: UpdateBillingProfileDto) {
        if (!req.user.company_id) throw new BadRequestException('Brak przypisanej firmy');
        const company = await this.billingService.updateBillingProfile(req.user.company_id, dto);
        return {
            company,
            ...BillingService.computeFlags(company, req.user.role),
        };
    }

    /** Wybór płatności przelewem. */
    @Post('select-transfer')
    @Roles(Role.Admin, Role.Manager)
    async selectTransfer(@Req() req: any, @Body() body: { planId?: string }) {
        if (!req.user.company_id) throw new BadRequestException('Brak przypisanej firmy');
        const actor = {
            email: req.user.email,
            name: [req.user.first_name, req.user.last_name].filter(Boolean).join(' '),
        };
        return this.billingService.selectTransfer(req.user.company_id, body?.planId, actor);
    }

    /** Akceptacja regulaminu w imieniu firmy. */
    @Post('accept-terms')
    @Roles(Role.Admin, Role.Manager)
    async acceptTerms(@Req() req: any) {
        if (!req.user.company_id) throw new BadRequestException('Brak przypisanej firmy');
        return this.billingService.acceptTerms(req.user.company_id, req.user.id);
    }
}
