import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { GenerateScheduleDto, UpdateScheduleDto, UpdateSettingsDto, CreateShiftRequestDto, UpdateShiftRequestStatusDto, CreateScheduleDto } from './dto/schedule.dtos';
import { startOfMonth, endOfMonth, eachDayOfInterval, getDay, format, parseISO, subWeeks, subDays, isBefore, isAfter, parse } from 'date-fns';

@Injectable()
export class SchedulesService {
    constructor(private readonly supabaseService: SupabaseService) {}

    // --- Settings ---
    async getSettings(companyId: string, departmentId: string) {
        const supabase = this.supabaseService.getClient();
        
        let query = supabase.from('departments').select('schedule_settings').eq('id', departmentId).eq('company_id', companyId).single();
        const { data, error } = await query;

        // Optionally fallback to company settings if not found, but we will return default if not exist
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

    async updateSettings(companyId: string, departmentId: string, settings: UpdateSettingsDto) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase
            .from('departments')
            .update({ schedule_settings: settings })
            .eq('id', departmentId)
            .eq('company_id', companyId);

        if (error) throw new InternalServerErrorException(error.message);
        return { success: true };
    }

    // --- Schedules ---
    async getSchedules(context: { userId: string, role: string, companyId: string }, month?: number, year?: number, departmentId?: string) {
        const supabase = this.supabaseService.getClient();
        
        let selectQuery = `*, users!inner(id, first_name, last_name, email, department_id)`;
        let query = supabase
            .from('schedules')
            .select(selectQuery)
            .eq('company_id', context.companyId);

        if (departmentId) {
            query = query.eq('users.department_id', departmentId);
        }

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

    async createSchedule(companyId: string, createDto: CreateScheduleDto) {
        const supabase = this.supabaseService.getClient();
        const { error } = await supabase
            .from('schedules')
            .upsert({
                company_id: companyId,
                user_id: createDto.user_id,
                date: createDto.date,
                shift_name: createDto.shift_name,
                start_time: createDto.start_time,
                end_time: createDto.end_time,
                status: createDto.status || 'scheduled'
            }, { onConflict: 'user_id,date' });

        if (error) throw new InternalServerErrorException(error.message);
        return { success: true };
    }

    async generateSchedule(companyId: string, departmentId: string, month: number, year: number) {
        const supabase = this.supabaseService.getClient();
        const settings = await this.getSettings(companyId, departmentId);

        // Fetch all active users in the company for this department
        const { data: users, error: usersErr } = await supabase
            .from('users')
            .select('id, role')
            .eq('company_id', companyId)
            .eq('department_id', departmentId)
            .eq('role', 'employee'); // only employee roles get schedules generated

        if (usersErr) throw new InternalServerErrorException(usersErr.message);
        
        if (!users || users.length === 0) {
            throw new BadRequestException('Brak pracownikow w tym dziale do wygenerowania grafiku.');
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
        // Since shift_requests now have start_date and optionally end_date, overlap check is needed
        const { data: requests, error: reqErr } = await supabase
            .from('shift_requests')
            .select('*')
            .eq('company_id', companyId)
            .eq('status', 'approved')
            .lte('start_date', endStr)
            .gte('start_date', startStr); // basic overlap, we will check precisely in loop
            
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

        // Logic for rotating shifts per department
        const days = eachDayOfInterval({ start: startDate, end: endDate });
        const newSchedules: any[] = [];

        // Divide employees into groups based on max shifts available in the week to balance them
        // First gather all unique shifts in the settings
        const allShiftNames = new Set<string>();
        Object.values(settings).forEach((daySettings: any) => {
            if (daySettings.is_working_day && daySettings.shifts) {
                daySettings.shifts.forEach((s: any) => allShiftNames.add(s.name));
            }
        });
        const shiftNamesArray = Array.from(allShiftNames);
        const totalShiftsCount = Math.max(1, shiftNamesArray.length);

        // Assign users to initial group indices
        const userGroupIndices: Record<string, number> = {};
        users.forEach((user, idx) => {
            userGroupIndices[user.id] = idx % totalShiftsCount;
        });

        for (const user of users) {
             let currentGroupIdx = userGroupIndices[user.id];
             let currentUserShiftForWeek = lastShiftPerUser[user.id] || null;

             for (const day of days) {
                 const dow = getDay(day); // 0 = Sunday, 1 = Monday
                 const dayStr = String(dow);
                 const dateStr = format(day, 'yyyy-MM-dd');

                 const dailySettings = settings[dayStr];
                 if (!dailySettings || !dailySettings.is_working_day || !dailySettings.shifts || dailySettings.shifts.length === 0) {
                     continue; // Not a working day, skip
                 }

                 // Group rotation on Monday
                 if (dow === 1 && day.getDate() !== 1) {
                     currentGroupIdx = (currentGroupIdx + 1) % Math.max(1, dailySettings.shifts.length);
                 }

                 const shiftNames = dailySettings.shifts.map((s: any) => s.name);
                 
                 // If Monday or first day of month -> pick a shift for the week
                 if (dow === 1 || day.getDate() === 1 || !currentUserShiftForWeek) {
                     // Rotate by group index
                     if (shiftNames.length > 0) {
                        currentUserShiftForWeek = shiftNames[currentGroupIdx % shiftNames.length];
                     }
                 }

                 // Check if there is an approved request for this day (overlap check)
                 const userReq = requests?.find(r => {
                     if (r.user_id !== user.id) return false;
                     if (!r.end_date) return r.start_date === dateStr;
                     return dateStr >= r.start_date && dateStr <= r.end_date;
                 });
                 
                 let finalShiftName = currentUserShiftForWeek;
                 if (userReq && shiftNames.includes(userReq.requested_shift_name)) {
                     finalShiftName = userReq.requested_shift_name;
                 }

                 // Find shift details
                 const targetShift = dailySettings.shifts.find((s: any) => s.name === finalShiftName) || dailySettings.shifts[0];
                 
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
                start_date: payload.start_date,
                end_date: payload.end_date,
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
        
        // 1. Update status
        const { error, data: reqData } = await supabase
            .from('shift_requests')
            .update({ status })
            .eq('id', id)
            .eq('company_id', companyId)
            .select('*')
            .single();

        if (error || !reqData) throw new InternalServerErrorException(error?.message || 'Brak zgłoszenia');

        // 2. If approved, Auto-apply to schedules
        if (status === 'approved') {
            const startDate = parseISO(reqData.start_date);
            const endDate = reqData.end_date ? parseISO(reqData.end_date) : startDate;
            
            // Check absences first
            const { data: absences } = await supabase
                .from('absences')
                .select('*')
                .eq('user_id', reqData.user_id)
                .eq('status', 'approved')
                .lte('start_date', format(endDate, 'yyyy-MM-dd'))
                .gte('end_date', format(startDate, 'yyyy-MM-dd'));

            const daysToApply = eachDayOfInterval({ start: startDate, end: endDate });
            const user = await supabase.from('users').select('department_id').eq('id', reqData.user_id).single();
            const deptId = user.data?.department_id;
            
            if (deptId) {
                 const settings = await this.getSettings(companyId, deptId);
                 const newSchedules: any[] = [];
                 
                 for (const day of daysToApply) {
                     const dateStr = format(day, 'yyyy-MM-dd');
                     const dayStr = String(getDay(day));
                     const dailySettings = settings[dayStr];
                     
                     if (!dailySettings || !dailySettings.is_working_day || !dailySettings.shifts) continue;
                     
                     const targetShift = dailySettings.shifts.find((s: any) => s.name === reqData.requested_shift_name);
                     if (!targetShift) continue;

                     const userAbsent = absences?.find(a => dateStr >= a.start_date && dateStr <= a.end_date);
                     
                     newSchedules.push({
                         company_id: companyId,
                         user_id: reqData.user_id,
                         date: dateStr,
                         shift_name: targetShift.name,
                         start_time: targetShift.start_time,
                         end_time: targetShift.end_time,
                         status: userAbsent ? 'replacement_needed' : 'scheduled'
                     });
                 }
                 
                 if (newSchedules.length > 0) {
                     await supabase.from('schedules').upsert(newSchedules, { onConflict: 'user_id,date' });
                 }
            }
        }
        
        // 3. Create Notification
        await supabase.from('notifications').insert({
            company_id: companyId,
            user_id: reqData.user_id,
            title: `Dyspozycja grafiku: ${status === 'approved' ? 'Zatwierdzona' : 'Odrzucona'}`,
            message: `Twoja dyspozycja na zmianę "${reqData.requested_shift_name}" (${reqData.start_date}${reqData.end_date ? ` do ${reqData.end_date}` : ''}) została ${status === 'approved' ? 'zatwierdzona' : 'odrzucona'}.`,
            type: `shift_request_${status}`
        });

        return { success: true };
    }
}
