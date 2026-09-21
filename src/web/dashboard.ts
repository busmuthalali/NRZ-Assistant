import express from "express";
import { config } from "../config";

export function startDashboard() {
  const app=express();
  app.get("/health",(_,res)=>res.json({ok:true,service:"gaming-discord-bot",time:new Date().toISOString()}));
  app.get("/",(_,res)=>res.send("<h1>Gaming Discord Bot</h1><p>Dashboard API online.</p>"));
  app.listen(config.port,()=>console.log(`Dashboard listening on ${config.port}`));
}
