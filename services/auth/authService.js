const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

function sha256(input) {
  return crypto.createHash("sha256").update(String(input || ""), "utf8").digest("hex");
}

function newRefreshTokenValue() {
  return crypto.randomBytes(48).toString("base64url");
}

function createAuthService({ User, RefreshToken }) {
  const accessTtl = process.env.ACCESS_TOKEN_TTL || "7d";
  const refreshDays = Number(process.env.REFRESH_TOKEN_DAYS || 30);

  function issueAccessToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: accessTtl });
  }

  async function issueRefreshToken({ user, ip = "", userAgent = "" }) {
    const value = newRefreshTokenValue();
    const tokenHash = sha256(value);
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    await new RefreshToken({
      userId: user._id,
      companyId: user.companyId || null,
      tokenHash,
      expiresAt,
      ip: String(ip || "").slice(0, 120),
      userAgent: String(userAgent || "").slice(0, 300)
    }).save();

    return { value, tokenHash, expiresAt };
  }

  async function register({ username, password, email }) {
    if (!username || !password) throw Object.assign(new Error("Användarnamn/lösenord krävs"), { status: 400 });
    if (await User.findOne({ username })) throw Object.assign(new Error("Upptaget användarnamn"), { status: 400 });

    const user = await new User({
      username,
      email: email || "",
      password: await bcrypt.hash(password, 10),
      role: "user"
    }).save();

    return user;
  }

  async function login({ username, password }) {
    const user = await User.findOne({ username });
    if (!user) throw Object.assign(new Error("Fel inloggningsuppgifter"), { status: 400 });
    const match = await bcrypt.compare(password, user.password);
    if (!match) throw Object.assign(new Error("Fel inloggningsuppgifter"), { status: 400 });
    return user;
  }

  async function refresh({ refreshToken, ip = "", userAgent = "" }) {
    if (!refreshToken) throw Object.assign(new Error("Saknar refreshToken"), { status: 400 });
    const tokenHash = sha256(refreshToken);
    const tokenDoc = await RefreshToken.findOne({ tokenHash });
    if (!tokenDoc) throw Object.assign(new Error("Ogiltig refreshToken"), { status: 401 });
    if (tokenDoc.revokedAt) throw Object.assign(new Error("Revoked refreshToken"), { status: 401 });
    if (tokenDoc.expiresAt && tokenDoc.expiresAt.getTime() < Date.now()) throw Object.assign(new Error("Expired refreshToken"), { status: 401 });

    const user = await User.findById(tokenDoc.userId);
    if (!user) throw Object.assign(new Error("Ogiltig användare"), { status: 401 });

    const accessToken = issueAccessToken(user._id);
    const rotated = await issueRefreshToken({ user, ip, userAgent });
    tokenDoc.revokedAt = new Date();
    tokenDoc.replacedByTokenHash = rotated.tokenHash;
    await tokenDoc.save();

    return { user, accessToken, refreshToken: rotated.value, refreshExpiresAt: rotated.expiresAt };
  }

  async function logout({ refreshToken }) {
    if (!refreshToken) return;
    const tokenHash = sha256(refreshToken);
    const tokenDoc = await RefreshToken.findOne({ tokenHash });
    if (!tokenDoc) return;
    if (!tokenDoc.revokedAt) {
      tokenDoc.revokedAt = new Date();
      await tokenDoc.save();
    }
  }

  return { issueAccessToken, issueRefreshToken, register, login, refresh, logout };
}

module.exports = { createAuthService };
