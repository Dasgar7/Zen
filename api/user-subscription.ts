import { userSubscriptionHandler } from "./_lib/lemon.js";

export default async function handler(req: any, res: any) {
  return userSubscriptionHandler(req, res);
}
