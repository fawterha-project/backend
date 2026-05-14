import jwt from "jsonwebtoken";
import supabase from "../supabaseClient.js";

const JWT_SECRET = process.env.JWT_SECRET;

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const { data: savedToken, error } = await supabase
      .from("auth_tokens")
      .select("auth_tokens_id, is_revoked")
      .eq("token", token)
      .eq("user_id", decoded.users_id)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!savedToken || savedToken.is_revoked) {
      return res.status(401).json({ message: "Token is revoked or invalid" });
    }

    req.user = {
      users_id: decoded.users_id,
      email: decoded.email,
      token,
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}