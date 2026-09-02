import { webhookHandler } from "../_lib/lemon.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  return webhookHandler(req, res);
}
