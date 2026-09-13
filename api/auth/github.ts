export default function handler(req: any, res: any) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send("GitHub OAuth is not configured (missing GITHUB_CLIENT_ID env var).");
  }

  let redirectUri = process.env.GITHUB_REDIRECT_URI;
  if (!redirectUri) {
    const host = req.headers["x-forwarded-host"] || req.headers.host || "";
    const proto = req.headers["x-forwarded-proto"] || (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
    redirectUri = `${proto}://${host}/api/auth/github/callback`;
  }

  // "repo" scope grants full read/write control of the user's repositories
  // (required for Zen to browse, read, write, and delete files as an agent).
  const scope = "repo user user:email";
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
  return res.redirect(302, githubAuthUrl);
}