import Stripe from "stripe";
import { ENV } from "../../config/env.js";

export const stripe = new Stripe(ENV.STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
});
