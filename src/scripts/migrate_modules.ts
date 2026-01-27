
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
    const { error } = await supabase.from('modules').select('is_active').limit(1);
    if (!error) {
        console.log('Column is_active already exists.');
        return;
    }

    // Since we cannot run DDL via client easily without sql function or direct connection, 
    // we will try to use a stored procedure if exists, or just log instructions.
    // BUT typically user has access to SQL editor. 
    // I will use a special trick: I will assume the user ran it or I will use the "run_command" with psql if available.

    // For now, I will create a migration file and ask user to run it, OR 
    // simply try to continue assuming I can't run DDL from here.

    console.log('Please run this SQL in Supabase Dashboard SQL Editor:');
    console.log('ALTER TABLE modules ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;');
}

runMigration();
