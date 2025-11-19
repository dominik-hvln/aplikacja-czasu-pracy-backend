import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ReportTemplatesService } from './report-templates.service';
import { CreateReportTemplateDto } from './dto/create-template.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard'; //

@Controller('report-templates')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ReportTemplatesController {
    constructor(private readonly reportTemplatesService: ReportTemplatesService) {}

    @Post()
    create(@Body() createDto: CreateReportTemplateDto) {
        return this.reportTemplatesService.create(createDto);
    }

    @Get('company/:companyId') // W przyszłości weźmiemy companyId z tokena usera dla bezpieczeństwa
    findAll(@Param('companyId') companyId: string) {
        return this.reportTemplatesService.findAllByCompany(companyId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.reportTemplatesService.findOne(id);
    }
}