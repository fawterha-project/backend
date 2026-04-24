// TODO (RAND): Implement registerUser with Supabase Auth
export const registerUser = async (first_name, last_name, email, password) => {
  return { user: { first_name, last_name, email } };
};

// TODO (RAND): Implement loginUser with Supabase Auth
export const loginUser = async (email, password) => {
  return { user: { email } };
};
