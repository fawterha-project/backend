import supabase from "../supabaseClient.js";

// Register user with Supabase Auth + users table
export const registerUser = async (first_name, last_name, email, password) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name,
        last_name,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  const { error: profileError } = await supabase.from("users").insert([
    {
      users_id: data.user.id,
      first_name,
      last_name,
      email,
    },
  ]);

  if (profileError) {
    return { error: profileError.message };
  }

  return {
    user: data.user,
  };
};

// Login user with Supabase Auth
export const loginUser = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  return {
    user: data.user,
    session: data.session,
  };
};