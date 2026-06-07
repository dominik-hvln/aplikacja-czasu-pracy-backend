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
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data, error } = await supabase
        .from('location_qr_codes')
        .select('*')
        .limit(1);

    if (error) {
        console.log('Error:', error);
    } else {
        console.log('Columns in location_qr_codes:', data.length > 0 ? Object.keys(data[0]) : 'Table is empty');
    }
}

test().catch(console.error);
