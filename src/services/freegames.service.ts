import { Client } from "discord.js";
import { config } from "../config";

/*
  Provider-neutral hook. Add official/public APIs for the stores you want.
  Do not scrape or bypass access controls.
*/
export async function postFreeGame(client:Client, game:{store:string,title:string,url:string,endsAt?:string}) {
  if (!config.freeGamesChannelId) return;
}
