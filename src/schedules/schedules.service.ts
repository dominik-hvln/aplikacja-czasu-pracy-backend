import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { GenerateScheduleDto, UpdateScheduleDto, UpdateSettingsDto, CreateShiftRequestDto, UpdateShiftRequestStatusDto } from './dto/schedule.dtos';
import { startOfMonth, endOfMonth, eachDayOfInterval, getDay, format, parseISO, subWeeks, subDays } from 'date-fns';

@Injectable()
export class SchedulesService {
    constructor(private readonly supabaseService: SupabaseService) {}

    // --- Settings ---
    async getSettings(companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('companies')
            .select('schedule_settings')
            .eq('id', companyId)
            .single();

        if (error) throw new InternalServerErrorException(error.message);
        
        return data?.schedule_settings || {
            "1": { "is_working_day": true, "shifts": [] },
            "2": { "is_working_day": true, "shifts": [] },
            "3": { "is_working_day": true, "shifts": [] },
            "4": { "is_working_day": true, "shifts": [] },
            "5": { "is_working_day": true, "shifts": [] },
            "6": { "is_working_day": false, "shifts": [] },
            "0": { "is_working_day": false, "shifts": [] }
        };
    }

    async updateSettings(companyId: string, settings: UpdateSettingsDto) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase
            .from('companies')
            .update({ schedule_settings: settings })
            .eq('id', companyId);

        if (error) throw new InternalServerErrorException(error.message);
        return { success: true };
    }

    // --- Schedules ---
    async getSchedules(context: { userId: string, role: string, companyId: string }, month?: number, year?: number) {
        const supabase = this.supabaseService.getClient();
        let query = supabase
            .from('schedules')
            .select(`
                *,
                users!user_id (id, first_name, last_name, email)
            `)
            .eq('company_id', context.companyId);

        if (month && year) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = endOfMonth(startDate);
            
            // Format to YYYY-MM-DD for PostgreSQL
            const startStr = format(startDate, 'yyyy-MM-dd');
            const endStr = format(endDate, 'yyyy-MM-dd');

            query = query.gte('date', startStr).lte('date', endStr);
        }

        if (context.role !== 'admin' && context.role !== 'manager') {
            query = query.eq('user_id', context.userId);
        }

        const { data, error } = await query;
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async generateSchedule(companyId: string, month: number, year: number) {
        const supabase = this.supabaseService.getClient();
        const settings = await this.getSettings(companyId);

        // Fetch all active users in the company
        const { data: users, error: usersErr } = await supabase
            .from('users')
            .select('id, role')
            .eq('company_id', companyId)
            .eq('role', 'employee'); // only employee roles get schedules generated

        if (usersErr) throw new InternalServerErrorException(usersErr.message);
        
        if (!users || users.length === 0) {
            throw new BadRequestException('Brak pracownikow do wygenerowania grafiku.');
        }

        // Fetch approved absences for the period
        const startDate = new Date(year, month - 1, 1);
        const endDate = endOfMonth(startDate);
        const startStr = format(startDate, 'yyyy-MM-dd');
        const endStr = format(endDate, 'yyyy-MM-dd');

        const { data: absences, error: absErr } = await supabase
            .from('absences')
            .select('*')
            .eq('company_id', companyId)
            .eq('status', 'approved')
            // overlaps check
            .lte('start_date', endStr)
            .gte('end_date', startStr);

        if (absErr) throw new InternalServerErrorException(absErr.message);

        // Fetch approved shift requests
        const { data: requests, error: reqErr } = await supabase
            .from('shift_requests')
            .select('*')
            .eq('company_id', companyId)
            .eq('status', 'approved')
            .gte('date', startStr)
            .lte('date', endStr);
            
        if (reqErr) throw new InternalServerErrorException(reqErr.message);

        // Also fetch last week of previous month to know what shift they had previously
        const priorWeekStartStr = format(subDays(startDate, 7), 'yyyy-MM-dd');
        const { data: lastSchedules, error: lhErr } = await supabase
            .from('schedules')
            .select('*')
            .eq('company_id', companyId)
            .gte('date', priorWeekStartStr)
            .lt('date', startStr);

        const lastShiftPerUser: Record<string, string> = {}; // user_id -> shift_name
        if (lastSchedules) {
            for (const s of lastSchedules) {
                lastShiftPerUser[s.user_id] = s.shift_name;
            }
        }

        // Logic for rotating shifts
        const days = eachDayOfInterval({ start: startDate, end: endDate });
        const newSchedules: any[] = [];

        for (const user of users) {
             let currentUserShiftForWeek = lastShiftPerUser[user.id] || null;

             for (const day of days) {
                 const dow = getDay(day); // 0 = Sunday, 1 = Monday
                 const dayStr = String(dow);
                 const dateStr = format(day, 'yyyy-MM-dd');

                 const dailySettings = settings[dayStr];
                 if (!dailySettings || !dailySettings.is_working_day || !dailySettings.shifts || dailySettings.shifts.length === 0) {
                     continue; // Not a working day, skip
                 }

                 // If Monday (dow = 1) or first day of month -> pick a shift for the week
                 if (dow === 1 || day.getDate() === 1 || !currentUserShiftForWeek) {
                     // Check if there is an approved request for this day (assuming requests are per day or per week)
                     const userReq = requests?.find(r => r.user_id === user.id && r.date === dateStr);
                     if (userReq) {
                         currentUserShiftForWeek = userReq.requested_shift_name;
                     } else {
                         // Rotate: find index of last shift, pick next one
                         const shiftNames = dailySettings.shifts.map(s => s.name);
                         if (currentUserShiftForWeek && shiftNames.includes(currentUserShiftForWeek)) {
                             const idx = shiftNames.indexOf(currentUserShiftForWeek);
                             const nextIdx = (idx + 1) % shiftNames.length;
                             currentUserShiftForWeek = shiftNames[nextIdx];
                         } else {
                             // Random start or first shift
                             currentUserShiftForWeek = shiftNames[0];
                         }
                     }
                 }

                 // Find shift details
                 const targetShift = dailySettings.shifts.find(s => s.name === currentUserShiftForWeek) || dailySettings.shifts[0];
                 
                 // Check if user is absent
                 const userAbsent = absences?.find(a => 
                     a.user_id === user.id && 
                     dateStr >= a.start_date && dateStr <= a.end_date
                 );

                 newSchedules.push({
                     company_id: companyId,
                     user_id: user.id,
                     date: dateStr,
                     shift_name: targetShift.name,
                     start_time: targetShift.start_time,
                     end_time: targetShift.end_time,
                     status: userAbsent ? 'replacement_needed' : 'scheduled'
                 });
             }
        }

        // Upsert schedules: to avoid duplicating, we first delete existing for that month (or let upsert handle it if we have ON CONFLICT)
        // Since we have a UNIQUE(user_id, date) we can do an upsert
        if (newSchedules.length > 0) {
            const { error: insertErr } = await supabase
                .from('schedules')
                .upsert(newSchedules, { onConflict: 'user_id,date' });

            if (insertErr) throw new InternalServerErrorException(insertErr.message);
        }

        return { message: 'Grafik wygenerowany pomyślnie.', count: newSchedules.length };
    }

    async updateSchedule(id: string, companyId: string, updateDto: UpdateScheduleDto) {
        const supabase = this.supabaseService.getClient();
        
        let updateData: any = {
            shift_name: updateDto.shift_name,
            start_time: updateDto.start_time,
            end_time: updateDto.end_time
        }
        if (updateDto.status) updateData.status = updateDto.status;
        if (updateDto.user_id) updateData.user_id = updateDto.user_id; // changing employee (replacement)
        
        // if substituting an absent person, it changes the user_id for this record
        // if user_id changes, status should probably become 'scheduled' again
        if (updateDto.user_id) {
             updateData.status = 'scheduled';
        }

        const { error } = await supabase
            .from('schedules')
            .update(updateData)
            .eq('id', id)
            .eq('company_id', companyId);

        if (error) throw new InternalServerErrorException(error.message);
        return { success: true };
    }

    async deleteSchedule(id: string, companyId: string) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase
            .from('schedules')
            .delete()
            .eq('id', id)
            .eq('company_id', companyId);

        if (error) throw new InternalServerErrorException(error.message);
        return { success: true };
    }

    // --- Shift Requests ---
    async createShiftRequest(userId: string, companyId: string, payload: CreateShiftRequestDto) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase
            .from('shift_requests')
            .insert({
                company_id: companyId,
                user_id: userId,
                date: payload.date,
                requested_shift_name: payload.requested_shift_name,
                status: 'pending'
            });

        if (error) throw new InternalServerErrorException(error.message);
        return { success: true };
    }

    async getShiftRequests(context: { userId: string, role: string, companyId: string }) {
        const supabase = this.supabaseService.getClient();
        let query = supabase
            .from('shift_requests')
            .select('*, users!user_id(id, first_name, last_name, email)')
            .eq('company_id', context.companyId);

        if (context.role !== 'admin' && context.role !== 'manager') {
            query = query.eq('user_id', context.userId);
        }

        const { data, error } = await query;
        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }

    async updateShiftRequestStatus(id: string, companyId: string, status: 'approved' | 'rejected') {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase
            .from('shift_requests')
            .update({ status })
            .eq('id', id)
            .eq('company_id', companyId);

        if (error) throw new InternalServerErrorException(error.message);
        return { success: true };
    }
}
