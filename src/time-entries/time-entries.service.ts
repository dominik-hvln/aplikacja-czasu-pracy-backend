import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

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
        const eventTime = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
        const gpsLocationString = location ? `(${location.longitude},${location.latitude})` : null;

        // Krok 1: Znajdź task (i jego projekt nadrzędny) na podstawie kodu QR.
        const { data: qrCode, error: qrError } = await supabase
            .from('qr_codes')
            .select('task:tasks(id, project_id)')
            .eq('code_value', qrCodeValue)
            .single();

        if (qrError || !qrCode || !Array.isArray(qrCode.task) || qrCode.task.length === 0) {
            throw new NotFoundException('Nie znaleziono zlecenia (taska) dla tego kodu QR.');
        }
        const task = qrCode.task[0];
        const taskId = task.id;
        const projectId = task.project_id;

        // Krok 2: Sprawdź, czy użytkownik ma już jakiś niezakończony wpis.
        const { data: lastEntry, error: lastEntryError } = await supabase
            .from('time_entries')
            .select('*')
            .eq('user_id', userId)
            .is('end_time', null) // Szukamy wpisu bez daty zakończenia
            .single();

        // Ignorujemy błąd, gdy po prostu nie znaleziono żadnego wpisu.
        if (lastEntryError && lastEntryError.code !== 'PGRST116') {
            throw new InternalServerErrorException(lastEntryError.message);
        }

        // Krok 3: Główna logika biznesowa
        if (lastEntry) {
            // SCENARIUSZ A: Użytkownik ma już aktywny wpis.

            // Najpierw zamykamy ten aktywny wpis.
            const { data: closedEntry, error: closeError } = await supabase
                .from('time_entries')
                .update({
                    end_time: eventTime,
                    end_gps_location: gpsLocationString
                })
                .eq('id', lastEntry.id)
                .select()
                .single();

            if (closeError) {
                throw new InternalServerErrorException(closeError.message);
            }

            // Sprawdzamy, czy zeskanowany kod dotyczy TEGO SAMEGO zadania.
            if (lastEntry.task_id === taskId) {
                // Jeśli tak, to jest to zwykłe "Zakończenie Pracy" (Clock-out).
                return { status: 'clock_out', entry: closedEntry };
            } else {
                // Jeśli nie, to jest to "Zmiana Zlecenia". Musimy od razu otworzyć nowy wpis.
                const { data: newEntry, error: insertError } = await supabase
                    .from('time_entries')
                    .insert({
                        user_id: userId,
                        project_id: projectId, // ID projektu nadrzędnego
                        task_id: taskId,       // ID nowego zadania
                        company_id: companyId,
                        start_time: eventTime,
                        start_gps_location: gpsLocationString,
                        is_offline_entry: !!timestamp,
                    })
                    .select()
                    .single();

                if (insertError) {
                    throw new InternalServerErrorException(insertError.message);
                }
                return { status: 'job_change', closedEntry: closedEntry, newEntry: newEntry };
            }
        } else {
            // SCENARIUSZ B: Użytkownik nie ma żadnego aktywnego wpisu.
            // To jest proste "Rozpoczęcie Pracy" (Clock-in).
            const { data: newEntry, error: insertError } = await supabase
                .from('time_entries')
                .insert({
                    user_id: userId,
                    project_id: projectId, // ID projektu nadrzędnego
                    task_id: taskId,       // ID nowego zadania
                    company_id: companyId,
                    start_time: eventTime,
                    start_gps_location: gpsLocationString,
                    is_offline_entry: !!timestamp,
                })
                .select()
                .single();

            if (insertError) {
                throw new InternalServerErrorException(insertError.message);
            }
            return { status: 'clock_in', entry: newEntry };
        }
    }
}