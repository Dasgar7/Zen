// Lists the authenticated user's GitHub repositories.
// Expects an "Authorization: Bearer <github_token>" header from the frontend
// (the token obtained from the OAuth callback, scope: repo).

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing GitHub access token" });
  }

  try {
    const perPage = 100;
    const response = await fetch(
      `https://api.github.com/user/repos?sort=updated&per_page=${perPage}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "Zen-App",
        },
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errData.message || "Failed to fetch repositories from GitHub",
      });
    }

    const repos = await response.json();
    const simplified = (Array.isArray(repos) ? repos : []).map((r: any) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner?.login,
      private: r.private,
      defaultBranch: r.default_branch,
      updatedAt: r.updated_at,
      description: r.description || "",
    }));

    return res.status(200).json({ repos: simplified });
  } catch (err: any) {
    console.error("Error fetching GitHub repos:", err);
    return res.status(500).json({ error: "Unexpected error fetching repositories" });
  }
}