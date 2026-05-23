require("dotenv").config();

const clientId = (process.env.CLIENT_ID || "").trim();

if (!clientId) {
  console.error("Missing CLIENT_ID.");
  process.exit(1);
}

const permissions = [
  1024,  // View Channels
  2048,  // Send Messages
  16384, // Embed Links
  65536  // Read Message History
].reduce((total, permission) => total + permission, 0);

const params = new URLSearchParams({
  client_id: clientId,
  permissions: String(permissions),
  scope: "bot applications.commands"
});

console.log(`https://discord.com/oauth2/authorize?${params.toString()}`);
