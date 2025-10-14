import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {UpdateTimeEntryDto} from "./dto/update-time-entry.dto";

@Injectable()
export class TimeEntriesService {
    constructor(private readonly supabaseService: SupabaseService) {}

    async handleScan(
        userId: string,
        companyId: string,
        qrCodeValue: string,
        location?: { latitude: number; longitude: number },
        timestamp?: string,
    ) {
        const supabase = this.supabaseService.getClient();

        try {
            const eventTime = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
            const gpsLocationString = location ? `(${location.longitude},${location.latitude})` : null;

            // ✅ KROK 1: Znajdź `task_id` na podstawie samego kodu QR.
            const { data: qrCodeData, error: qrError } = await supabase
                .from('qr_codes')
                .select('task_id')
                .eq('code_value', qrCodeValue)
                .single();

            if (qrError || !qrCodeData?.task_id) {
                throw new NotFoundException(`Nie znaleziono aktywnego zlecenia dla zeskanowanego kodu QR.`);
            }
            const taskId = qrCodeData.task_id;

            // ✅ KROK 2: Pobierz szczegóły taska, w tym `project_id`.
            const { data: taskData, error: taskError } = await supabase
                .from('tasks')
                .select('id, project_id')
                .eq('id', taskId)
                .single();

            if (taskError || !taskData?.project_id) {
                throw new NotFoundException(`Szczegóły zlecenia o ID ${taskId} nie mogły zostać odnalezione.`);
            }
            const projectId = taskData.project_id;

            // Krok 3: Sprawdź, czy użytkownik ma już jakiś niezakończony wpis.
            const { data: lastEntry, error: lastEntryError } = await supabase
                .from('time_entries')
                .select('*')
                .eq('user_id', userId)
                .is('end_time', null)
                .single();

            if (lastEntryError && lastEntryError.code !== 'PGRST116') {
                throw new InternalServerErrorException(lastEntryError.message);
            }

            // Krok 4: Główna logika biznesowa (pozostaje bez zmian, ale teraz jest bezpieczniejsza)
            if (lastEntry) {
                const { data: closedEntry, error: closeError } = await supabase
                    .from('time_entries')
                    .update({ end_time: eventTime, end_gps_location: gpsLocationString })
                    .eq('id', lastEntry.id)
                    .select()
                    .single();

                if (closeError) throw new InternalServerErrorException(closeError.message);

                if (lastEntry.task_id === taskId) {
                    return { status: 'clock_out', entry: closedEntry };
                } else {
                    const { data: newEntry, error: insertError } = await supabase
                        .from('time_entries')
                        .insert({
                            user_id: userId,
                            project_id: projectId,
                            task_id: taskId,
                            company_id: companyId,
                            start_time: eventTime,
                            start_gps_location: gpsLocationString,
                            is_offline_entry: !!timestamp,
                        })
                        .select()
                        .single();

                    if (insertError) throw new InternalServerErrorException(insertError.message);
                    return { status: 'job_change', closedEntry: closedEntry, newEntry: newEntry };
                }
            } else {
                const { data: newEntry, error: insertError } = await supabase
                    .from('time_entries')
                    .insert({
                        user_id: userId,
                        project_id: projectId,
                        task_id: taskId,
                        company_id: companyId,
                        start_time: eventTime,
                        start_gps_location: gpsLocationString,
                        is_offline_entry: !!timestamp,
                    })
                    .select()
                    .single();

                if (insertError) throw new InternalServerErrorException(insertError.message);
                return { status: 'clock_in', entry: newEntry };
            }
        } catch (error) {
            console.error('Błąd w handleScan:', error.message);
            throw error;
        }
    }

    async findAllForCompany(
        companyId: string,
        filters: { dateFrom?: string; dateTo?: string; userId?: string },
    ) {
        const supabase = this.supabaseService.getClient();
        let query = supabase
            .from('time_entries')
            .select(`
                id,
              start_time,
              end_time,
              was_edited, 
              user:users ( first_name, last_name ),
              project:projects ( name ),
              task:tasks ( name )
            `)
            .eq('company_id', companyId);

        if (filters.dateFrom) query = query.gte('start_time', filters.dateFrom);
        if (filters.dateTo) query = query.lte('start_time', filters.dateTo);
        if (filters.userId) query = query.eq('user_id', filters.userId);

        const { data, error } = await query.order('start_time', { ascending: false });

        if (error) {
            throw new InternalServerErrorException(error.message);
        }
        return data;
    }

    async update(
        entryId: string,
        companyId: string,
        updateTimeEntryDto: UpdateTimeEntryDto,
        editorId: string, // ID managera, który dokonuje zmiany
    ) {
        const supabase = this.supabaseService.getClient();

        // 1. Pobierz oryginalny wpis, aby zapisać go w audycie
        const { data: originalEntry, error: findError } = await supabase
            .from('time_entries')
            .select('*')
            .eq('id', entryId)
            .eq('company_id', companyId)
            .single();

        if (findError) throw new NotFoundException('Nie znaleziono wpisu.');

        // 2. Stwórz zapis w ścieżce audytowej
        const { error: auditError } = await supabase.from('audit_logs').insert({
            editor_user_id: editorId,
            target_time_entry_id: entryId,
            previous_values: originalEntry,
            new_values: updateTimeEntryDto,
            change_reason: 'Ręczna korekta przez managera.', // W przyszłości można to rozbudować
        });
        if (auditError) throw new InternalServerErrorException('Błąd podczas zapisu w ścieżce audytowej.');

        // 3. Zaktualizuj właściwy wpis czasu pracy
        const { data: updatedEntry, error: updateError } = await supabase
            .from('time_entries')
            .update({ ...updateTimeEntryDto, was_edited: true }) // Oznaczamy wpis jako edytowany
            .eq('id', entryId)
            .select()
            .single();

        if (updateError) throw new InternalServerErrorException(updateError.message);
        return updatedEntry;
    }

    async remove(entryId: string, companyId: string, editorId: string) {
        const supabase = this.supabaseService.getClient();

        // 1. Pobierz wpis, który ma być usunięty
        const { data: entryToDelete, error: findError } = await supabase
            .from('time_entries')
            .select('*')
            .eq('id', entryId)
            .eq('company_id', companyId)
            .single();

        if (findError) throw new NotFoundException('Nie znaleziono wpisu do usunięcia.');

        // 2. Stwórz zapis w audycie o usunięciu
        await supabase.from('audit_logs').insert({
            editor_user_id: editorId,
            target_time_entry_id: entryId,
            previous_values: entryToDelete,
            new_values: { status: 'DELETED' },
            change_reason: 'Usunięcie wpisu przez managera.',
        });

        // 3. Usuń wpis
        const { error: deleteError } = await supabase
            .from('time_entries')
            .delete()
            .eq('id', entryId);

        if (deleteError) throw new InternalServerErrorException(deleteError.message);

        return { message: 'Wpis został pomyślnie usunięty.' };
    }

    async getAuditLogs(entryId: string, companyId: string) {
        const supabase = this.supabaseService.getClient();
        // Musimy sprawdzić, czy ten wpis na pewno należy do firmy managera
        const { data: entry } = await supabase.from('time_entries').select('id').eq('id', entryId).eq('company_id', companyId).single();
        if (!entry) throw new NotFoundException('Nie znaleziono wpisu.');

        const { data, error } = await supabase
            .from('audit_logs')
            .select('*, editor:users (first_name, last_name)')
            .eq('target_time_entry_id', entryId)
            .order('created_at', { ascending: false });

        if (error) throw new InternalServerErrorException(error.message);
        return data;
    }
}