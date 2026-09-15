export default async function handler(req: any, res: any) {
  try {
    const code = req.query?.code;
    if (!code) {
      return res.status(400).send("No authorization code provided from GitHub");
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).send("GitHub OAuth is not configured (missing GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET env vars).");
    }

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
              },
              // Access token for authenticated GitHub API calls (repo listing, file read/write, etc).
              // Never logged or shown to the user directly.
              githubToken: ${JSON.stringify(accessToken)}
            };

            // Directly persist token and user details to localStorage in the same origin
            try {
              localStorage.setItem("zen_github_token", ${JSON.stringify(accessToken)});
              localStorage.setItem("zen_is_logged_in", "true");
              localStorage.setItem("zen_user_name", ${JSON.stringify(displayName)});
              localStorage.setItem("zen_user_email", ${JSON.stringify(finalEmail)});
            } catch (e) {}

            if (window.opener) {
              try {
                window.opener.postMessage(authData, "*");
              } catch (e) {}
              setTimeout(() => {
                window.close();
              }, 500);
            } else {
              // Same-window fallback: token can't safely go in a URL, so stash it in
              // sessionStorage for the app to pick up once, then strip it from history.
              try {
                sessionStorage.setItem("zen_github_token_pending", ${JSON.stringify(accessToken)});
              } catch (e) {}
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