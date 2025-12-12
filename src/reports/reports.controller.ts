import { Controller, Get, Post, Body, Param, UseGuards, Request, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';

@Controller('reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) { }

    @Post()
    create(@Request() req, @Body() createReportDto: CreateReportDto) {
        // ID usera bierzemy z tokena JWT dla bezpieczeństwa
        const userId = req.user.sub || req.user.id;
        return this.reportsService.create(userId, createReportDto);
    }

    @Get('company/:companyId')
    findAll(@Param('companyId') companyId: string) {
        return this.reportsService.findAllByCompany(companyId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.reportsService.findOne(id);
    }

    @Get(':id/pdf')
    async downloadPdf(@Param('id') id: string, @Res() res: Response) {
        const { buffer, filename } = await this.reportsService.generatePdf(id);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': buffer.length,
        });

        res.send(buffer);
    }
}