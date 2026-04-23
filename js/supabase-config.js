/**
 * Supabase Configuration and Client Initialization
 * Replace the placeholders with your actual Supabase URL and Anon Key.
 */

// These should be replaced with your actual Supabase project details
const SUPABASE_URL = 'https://jnwpnohdlavbgwjvupvc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impud3Bub2hkbGF2Ymd3anZ1cHZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MDU4MzcsImV4cCI6MjA5MjE4MTgzN30.WhYEfsmQDcOKUIRjC6wIljO-IXZtzBGbHMqbY983uRs';

// Initialize the Supabase client
// Note: This requires the Supabase CDN to be included in your HTML files:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export to window object for global access
window.supabase = supabaseClient;
