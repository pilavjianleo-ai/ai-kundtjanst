const jwt = require("jsonwebtoken");

function createAuthMiddleware({ User }) {
  const authenticate = async (req, res, next) => {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Ingen token" });
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");
      if (!user) throw new Error("User not found");
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: "Ogiltig token" });
    }
  };

  const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(403).json({ error: "Ej behörig" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Ej behörig" });
    next();
  };

  const requireAgent = requireRole("agent", "admin");
  const requireAdmin = requireRole("admin");

  return { authenticate, requireRole, requireAgent, requireAdmin };
}

module.exports = { createAuthMiddleware };
