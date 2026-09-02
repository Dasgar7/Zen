import { manageSubscriptionHandler } from "../_lib/lemon.js";

export default async function handler(req: any, res: any) {
  return manageSubscriptionHandler(req, res);
}
