import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const env = dotenv.config().parsed;

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

export default supabase;
