const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '.env')));
for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function test() {
    const projectId = 'c684b86c-f8f2-40c5-b29b-6e708d439d38';
    console.log('Testing QR Code generation for project:', projectId);

    const { data: existingCode, error: findError } = await supabase
        .from('qr_codes')
        .select('*')
        .eq('project_id', projectId)
        .single();

    console.log('find result:', { existingCode, findError });

    if (!existingCode) {
        console.log('Inserting new code...');
        const { data, error } = await supabase
            .from('qr_codes')
            .insert({ project_id: projectId })
            .select('code_value')
            .single();

        console.log('insert result:', { data, error });
    }
}

test().catch(console.error);
