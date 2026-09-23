// Read/write/delete access to files and directories in a connected GitHub repo,
// backed by GitHub's Contents API (https://docs.github.com/en/rest/repos/contents).
//
// Expects an "Authorization: Bearer <github_token>" header.
//
// GET    /api/github/contents?owner=X&repo=Y&path=Z[&ref=branch]
//        -> returns file content (decoded from base64) or directory listing
//
// PUT    /api/github/contents
//        body: { owner, repo, path, content, message, sha?, branch? }
//        -> creates a new file, or updates an existing one if `sha` is provided
//           (the current file's sha, required by GitHub to update/overwrite safely)
//
// DELETE /api/github/contents
//        body: { owner, repo, path, message, sha, branch? }
//        -> deletes a file (sha of the current file is required)

function getToken(req: any): string | null {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

async function githubFetch(token: string, url: string, init: any = {}) {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Zen-App",
      ...(init.headers || {}),
    },
  });
}

export default async function handler(req: any, res: any) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing GitHub access token" });
  }

  try {
    if (req.method === "GET") {
      const { owner, repo, path = "", ref } = req.query || {};
      if (!owner || !repo) {
        return res.status(400).json({ error: "owner and repo are required" });
      }
      const cleanPath = path && path.trim() ? `/${encodeURIComponent(path.trim()).replace(/%2F/g, "/")}` : "";
      const url = `https://api.github.com/repos/${owner}/${repo}/contents${cleanPath}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;

      const ghRes = await githubFetch(token, url);
      const data = await ghRes.json();

      if (!ghRes.ok) {
        return res.status(ghRes.status).json({ error: data.message || "GitHub request failed" });
      }

      // Directory listing (array response)
      if (Array.isArray(data)) {
        return res.status(200).json({
          type: "directory",
          entries: data.map((e: any) => ({
            name: e.name,
            path: e.path,
            type: e.type, // "file" | "dir"
            size: e.size,
            sha: e.sha,
          })),
        });
      }

      // Single file
      const decoded =
        data.encoding === "base64" && data.content
          ? Buffer.from(data.content, "base64").toString("utf-8")
          : data.content || "";

      return res.status(200).json({
        type: "file",
        path: data.path,
        sha: data.sha,
        size: data.size,
        content: decoded,
      });
    }

    if (req.method === "PUT") {
      const { owner, repo, path, content, message, sha, branch } = req.body || {};
      if (!owner || !repo || !path || content === undefined || !message) {
        return res
          .status(400)
          .json({ error: "owner, repo, path, content, and message are required" });
      }

      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(
        path
      ).replace(/%2F/g, "/")}`;

      const ghRes = await githubFetch(token, url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          content: Buffer.from(content, "utf-8").toString("base64"),
          sha: sha || undefined, // omit for new file creation, include to update/overwrite
          branch: branch || undefined,
        }),
      });

      const data = await ghRes.json();
      if (!ghRes.ok) {
        return res.status(ghRes.status).json({ error: data.message || "GitHub write failed" });
      }

      return res.status(200).json({
        sha: data.content?.sha,
        commitSha: data.commit?.sha,
        htmlUrl: data.content?.html_url,
      });
    }

    if (req.method === "DELETE") {
      const { owner, repo, path, message, sha, branch } = req.body || {};
      if (!owner || !repo || !path || !message || !sha) {
        return res
          .status(400)
          .json({ error: "owner, repo, path, message, and sha are required" });
      }

      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(
        path
      ).replace(/%2F/g, "/")}`;

      const ghRes = await githubFetch(token, url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sha, branch: branch || undefined }),
      });

      const data = await ghRes.json();
      if (!ghRes.ok) {
        return res.status(ghRes.status).json({ error: data.message || "GitHub delete failed" });
      }

      return res.status(200).json({ commitSha: data.commit?.sha });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("Error in GitHub contents handler:", err);
    return res.status(500).json({ error: "Unexpected error accessing repository contents" });
  }
}
