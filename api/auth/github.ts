export default function handler(req: any, res: any) {
  const clientId = process.env.GITHUB_CLIENT_ID || "Ov23liA5FPrwR4cCmecj";
  
  let redirectUri = process.env.GITHUB_REDIRECT_URI;
  if (!redirectUri) {
    const host = req.headers["x-forwarded-host"] || req.headers.host || "";
    const proto = req.headers["x-forwarded-proto"] || (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
    redirectUri = `${proto}://${host}/api/auth/github/callback`;
  }

  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user,user:email`;
  return res.redirect(302, githubAuthUrl);
}
