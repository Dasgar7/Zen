export default async function handler(req: any, res: any) {
  try {
    const code = req.query?.code;
    if (!code) {
      return res.status(400).send("No authorization code provided from GitHub");
    }

    const clientId = process.env.GITHUB_CLIENT_ID || "Ov23liA5FPrwR4cCmecj";
    const clientSecret = process.env.GITHUB_CLIENT_SECRET || "51ec4f1605883d8a3315aeef69c6459c55b90bf3";

    let redirectUri = process.env.GITHUB_REDIRECT_URI;
    if (!redirectUri) {
      const host = req.headers["x-forwarded-host"] || req.headers.host || "";
      const proto = req.headers["x-forwarded-proto"] || (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
      redirectUri = `${proto}://${host}/api/auth/github/callback`;
    }

    // 1. Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      console.error("GitHub OAuth token error:", tokenData);
      return res.status(400).send(`GitHub OAuth failed: ${tokenData.error_description || tokenData.error || "Unknown token error"}`);
    }

    const accessToken = tokenData.access_token;

    // 2. Fetch user profile
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "User-Agent": "Genex-App"
      }
    });

    const userData = await userResponse.json();

    // 3. Fetch user primary email
    let primaryEmail = userData.email;
    if (!primaryEmail) {
      try {
        const emailsResponse = await fetch("https://api.github.com/user/emails", {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "User-Agent": "Genex-App"
          }
        });
        const emailsData = await emailsResponse.json();
        if (Array.isArray(emailsData)) {
          const primaryObj = emailsData.find((e: any) => e.primary) || emailsData[0];
          if (primaryObj?.email) {
            primaryEmail = primaryObj.email;
          }
        }
      } catch (e) {
        console.warn("Could not fetch user emails:", e);
      }
    }

    const displayName = userData.name || userData.login || "GitHub User";
    const finalEmail = primaryEmail || `${userData.login}@github.com`;
    const avatarUrl = userData.avatar_url || "";

    // 4. Return HTML that posts message to opener or redirects
    res.setHeader("Content-Type", "text/html");
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GitHub Authentication Successful</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background-color: #ffffff;
              color: #000000;
            }
            .card {
              text-align: center;
              padding: 24px;
              border-radius: 16px;
              border: 1px solid #e4e4e7;
              box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Authentication Successful!</h2>
            <p>Authenticated as <strong>${displayName}</strong> (${finalEmail}).</p>
            <p style="font-size: 13px; color: #71717a;">Closing window...</p>
          </div>
          <script>
            const authData = {
              type: "GITHUB_AUTH_SUCCESS",
              user: {
                name: ${JSON.stringify(displayName)},
                email: ${JSON.stringify(finalEmail)},
                avatar: ${JSON.stringify(avatarUrl)}
              }
            };

            if (window.opener) {
              window.opener.postMessage(authData, "*");
              setTimeout(() => {
                window.close();
              }, 500);
            } else {
              window.location.href = "/?auth_success=1&name=" + encodeURIComponent(${JSON.stringify(displayName)}) + "&email=" + encodeURIComponent(${JSON.stringify(finalEmail)});
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("Error in GitHub OAuth callback:", err);
    return res.status(500).send("Authentication failed. " + (err?.message || ""));
  }
}
