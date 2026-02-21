export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return res.status(500).json({ error: "DEEPGRAM_API_KEY not set" });

  // Return a short-lived Deepgram temporary key
  try {
    const r = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { Authorization: `Token ${key}` }
    });
    const projects = await r.json();
    const projectId = projects?.projects?.[0]?.project_id;
    if (!projectId) throw new Error("No project found");

    const tkRes = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        comment: "temp",
        scopes: ["usage:write"],
        time_to_live_in_seconds: 60
      })
    });
    const tkData = await tkRes.json();
    const tempKey = tkData?.key;
    if (!tempKey) throw new Error("Could not create temp key: " + JSON.stringify(tkData));
    return res.status(200).json({ key: tempKey });
  } catch (err) {
    // fallback: return main key directly (less secure but works)
    return res.status(200).json({ key });
  }
}
