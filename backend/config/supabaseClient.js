const { createClient } = require('@supabase/supabase-js');

// Single shared Supabase client for the whole backend
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

module.exports = supabase;
