export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const userRole = req.user?.role;

    if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
      return next();
    }

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ message: "Forbidden: insufficient role." });
    }

    return next();
  };
}
