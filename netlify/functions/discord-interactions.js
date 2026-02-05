// netlify/functions/discord-interactions.js

const crypto = require("crypto");

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  };
}

// Verify Discord signature (required)
function verifyDiscordRequest(rawBody, signature, timestamp, publicKey) {
  const message = Buffer.from(timestamp + rawBody);
  const sig = Buffer.from(signature, "hex");
  const pub = Buffer.from(publicKey, "hex");
  return crypto.verify(null, message, { key: pub, format: "der", type: "spki" }, sig);
}

async function discordApi(path, method = "GET", body) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Missing DISCORD_BOT_TOKEN");

  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(`Discord API ${method} ${path} failed: ${res.status} ${text}`);
  }
  return data;
}

function disableAllButtons(components = []) {
  // components: [{type:1, components:[{type:2,...}]}]
  return (components || []).map((row) => ({
    ...row,
    components: (row.components || []).map((btn) => ({
      ...btn,
      disabled: true,
    })),
  }));
}

function alreadyClaimed(message) {
  const content = (message?.content || "").toLowerCase();
  if (content.includes("claimed by")) return true;

  // also check embeds footer marker
  const footer = message?.embeds?.[0]?.footer?.text || "";
  if (footer.toLowerCase().includes("claimed by")) return true;

  return false;
}

exports.handler = async (event) => {
  try {
    const publicKey = process.env.DISCORD_PUBLIC_KEY;
    if (!publicKey) return json(500, { error: "Missing DISCORD_PUBLIC_KEY" });

    const sig =
      event.headers["x-signature-ed25519"] || event.headers["X-Signature-Ed25519"];
    const ts =
      event.headers["x-signature-timestamp"] || event.headers["X-Signature-Timestamp"];

    if (!sig || !ts) return json(401, { error: "Missing Discord signature headers" });

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body || "";

    const ok = verifyDiscordRequest(rawBody, sig, ts, publicKey);
    if (!ok) return json(401, { error: "Bad request signature" });

    const interaction = JSON.parse(rawBody);

    // PING (Discord verifies endpoint)
    if (interaction.type === 1) {
      return json(200, { type: 1 });
    }

    // Button click
    if (interaction.type === 3) {
      const customId = interaction.data?.custom_id || "";
      const userId = interaction.member?.user?.id || interaction.user?.id;
      const username =
        interaction.member?.user?.username ||
        interaction.user?.username ||
        "Unknown";

      const channelId = interaction.channel_id;
      const messageId = interaction.message?.id;

      const logChannelId = process.env.LOG_CHANNEL_ID;

      if (!channelId || !messageId) {
        return json(200, {
          type: 4,
          data: { content: "Missing message context.", flags: 64 },
        });
      }

      const isClaim = customId.startsWith("claim:");
      const isLog = customId.startsWith("log:");
      const orderId = customId.split(":")[1] || "UNKNOWN";

      // If someone clicks after already claimed (race protection)
      if (alreadyClaimed(interaction.message)) {
        return json(200, {
          type: 4,
          data: { content: "Too late — this job is already claimed.", flags: 64 },
        });
      }

      // LOG button: just log, don’t lock
      if (isLog) {
        if (logChannelId) {
          await discordApi(`/channels/${logChannelId}/messages`, "POST", {
            content: `📝 **JOB LOGGED** • Order **${orderId}** by <@${userId}> (${username})`,
          });
        }

        return json(200, {
          type: 4,
          data: { content: "Logged ✅", flags: 64 },
        });
      }

      // CLAIM button: lock + log
      if (isClaim) {
        // Edit original message to show claimed + disable buttons
        const updatedContent =
          (interaction.message?.content || "") + `\n🔒 **Claimed by:** <@${userId}>`;

        const updatedEmbeds = (interaction.message?.embeds || []).map((e, idx) => {
          if (idx !== 0) return e;
          const footerText = e.footer?.text ? e.footer.text : "First come first serve.";
          return {
            ...e,
            footer: { text: `Claimed by ${username}` },
          };
        });

        const updatedComponents = disableAllButtons(interaction.message?.components || []);

        await discordApi(`/channels/${channelId}/messages/${messageId}`, "PATCH", {
          content: updatedContent,
          embeds: updatedEmbeds,
          components: updatedComponents,
        });

        if (logChannelId) {
          await discordApi(`/channels/${logChannelId}/messages`, "POST", {
            content: `✅ **JOB CLAIMED** • Order **${orderId}** by <@${userId}> (${username})`,
          });
        }

        return json(200, {
          type: 4,
          data: { content: `Locked ✅ You claimed **${orderId}**.`, flags: 64 },
        });
      }

      return json(200, {
        type: 4,
        data: { content: "Unknown button.", flags: 64 },
      });
    }

    // Anything else
    return json(200, { type: 4, data: { content: "Unhandled interaction.", flags: 64 } });
  } catch (err) {
    console.error("discord-interactions error:", err);
    return json(500, { error: err.message || "Server error" });
  }
};
