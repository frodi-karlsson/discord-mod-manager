import { DiscordModder } from "./discord-modder";

import dotenv from "dotenv";

dotenv.config();

function main() {
  const discordModder = new DiscordModder();
  discordModder.patch();
}

main();
