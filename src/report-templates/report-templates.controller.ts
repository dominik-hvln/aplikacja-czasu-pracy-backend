import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ReportTemplatesService } from './report-templates.service';
import { CreateReportTemplateDto } from './dto/create-template.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard'; //
import { ModuleGuard } from '../auth/module.guard';
import { RequiredModules } from '../auth/modules.decorator';

@Controller('report-templates')
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
// Domyślnie: czytanie szablonów (do generowania raportów zaawansowanych) wymaga 'reports_advanced'.
@RequiredModules('reports_advanced')
export class ReportTemplatesController {
    constructor(private readonly reportTemplatesService: ReportTemplatesService) {}

    @Post()
    // Tworzenie/budowanie szablonów = konfigurator raportów (plan wyższy).
    @RequiredModules('report_configurator')
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