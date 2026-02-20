const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError, clamp } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "github",
  aliases: ["gh"],
  async execute(message, args) {
    const query = String((args || []).join(" ") || "").trim();
    if (!query) return replyError(message, "Uso: +github <owner/repo | parola chiave>");
    try {
      let repo = null;
      if (/^[^\s\/]+\/[^\s\/]+$/.test(query)) {
        repo = await fetchJson("https://api.github.com/repos/" + query);
      } else {
        const search = await fetchJson("https://api.github.com/search/repositories?q=" + encodeURIComponent(query) + "&sort=stars&order=desc&per_page=1");
        repo = search?.items?.[0] || null;
      }
      if (!repo) return replyError(message, "Repository non trovato.");
      return safeMessageReply(message, {
        embeds: [{
          color: 0x24292f,
          title: String(repo.full_name || "Repository"),
          url: repo.html_url,
          description: clamp(repo.description || "Nessuna descrizione."),
          fields: [
            { name: "Stars", value: String(repo.stargazers_count ?? 0), inline: true },
            { name: "Forks", value: String(repo.forks_count ?? 0), inline: true },
            { name: "Issues", value: String(repo.open_issues_count ?? 0), inline: true },
            { name: "Language", value: String(repo.language || "N/D"), inline: true },
          ],
          thumbnail: repo.owner?.avatar_url ? { url: repo.owner.avatar_url } : undefined,
        }],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Errore durante la ricerca su GitHub.");
    }
  },
};
