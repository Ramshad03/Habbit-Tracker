import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://izwetimwxwxmnwaisybw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2V0aW13eHd4bW53YWlzeWJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NjQ1OTUsImV4cCI6MjA4OTE0MDU5NX0.kJ5g-lE4nDLLdV9DVCNusrbLZ4jyegbaFAzDUPLGgI4';

export const supabase = createClient(supabaseUrl, supabaseKey);    