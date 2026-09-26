
const SUPABASE_URL = 'https://iseiqumfkcqynihehzfy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzZWlxdW1ma2NxeW5paGVoemZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MDA0OTgsImV4cCI6MjEwMjk3NjQ5OH0.TXQ3ATFAYZcuofUGpYzh1QdzggBIZGY1zmbFtCS23Mw';

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.supabase = supabaseClient;
