const express = require("express");
const { createAuthService } = require("../services/auth/authService");

function createAuthRoutes({ User, RefreshToken }) {
  const router = express.Router();
  const authService = createAuthService({ User, RefreshToken });

  router.post("/register", async (req, res, next) => {
    try {
      const { username, password, email } = req.body || {};
      const user = await authService.register({ username, password, email });
      const token = authService.issueAccessToken(user._id);
      res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
    } catch (e) {
      next(e);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      const user = await authService.login({ username, password });
      const token = authService.issueAccessToken(user._id);

      const { value: refreshToken } = await authService.issueRefreshToken({
        user,
        ip: req.ip,
        userAgent: req.header("user-agent") || ""
      });

      res.json({ token, refreshToken, user: { id: user._id, username: user.username, role: user.role } });
    } catch (e) {
      next(e);
    }
  });

  router.post("/refresh", async (req, res, next) => {
    try {
      const { refreshToken } = req.body || {};
      const r = await authService.refresh({
        refreshToken,
        ip: req.ip,
        userAgent: req.header("user-agent") || ""
      });
      res.json({
        token: r.accessToken,
        refreshToken: r.refreshToken,
        user: { id: r.user._id, username: r.user.username, role: r.user.role }
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/logout", async (req, res, next) => {
    try {
      const { refreshToken } = req.body || {};
      await authService.logout({ refreshToken });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

module.exports = { createAuthRoutes };
