import jwt from "jsonwebtoken";

export function signToken(payload) {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  if (!secret) throw new Error("Missing JWT_SECRET in environment.");
  return jwt.sign(payload, secret, { expiresIn });
}

