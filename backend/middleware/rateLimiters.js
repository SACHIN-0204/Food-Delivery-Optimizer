import rateLimit from "express-rate-limit";

/**
 * Applied globally. Generous enough for normal use (including a partner app
 * pinging location every few seconds), but caps abuse/scraping.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please slow down and try again shortly." },
});

/**
 * Much stricter, applied only to login/register. These are the endpoints
 * that matter most for brute-force/credential-stuffing protection — a normal
 * user will never hit this limit, but a password-guessing script will.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many auth attempts from this IP, please try again later." },
});

/**
 * Slightly stricter than general, for the optimizer trigger endpoints —
 * these do real work (geo queries + external API calls), so they're worth
 * protecting separately from simple reads.
 */
export const optimizerLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many assignment requests, please slow down." },
});
