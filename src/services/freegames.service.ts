import { Client } from "discord.js";
import { config } from "../config";
import { alert } from "./alert.service";

/*
  Provider-neutral hook. Add official/public APIs for the stores you want.
  Do not scrape or bypass access controls.
*/
export async function postFreeGame(client:Client, game:{store:string,title:string,url:string,endsAt?:string}) {
  if (!config.freeGamesChannelId) return;
  await alert(client,"🎁 Free Game Alert",`**${game.title}** is free on **${game.store}**.\n${game.url}${game.endsAt ? `\nEnds: ${game.endsAt}` : ""}`);
}
