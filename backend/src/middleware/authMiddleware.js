import jwt from "jsonwebtoken";

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Missing or invalid Authorization header." });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ message: "Server misconfigured: missing JWT_SECRET." });
  }

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded; // { id, role, email, name }
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

