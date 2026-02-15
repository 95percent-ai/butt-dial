/**
 * Phone number provisioning helpers.
 * Wraps telephony provider methods with webhook URL construction.
 */

import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";

export async function searchAndBuyNumber(
  country: string,
  capabilities: { voice: boolean; sms: boolean },
  areaCode?: string
): Promise<{ phoneNumber: string; sid: string }> {
  const telephony = getProvider("telephony");
  const result = await telephony.buyNumber({ country, capabilities, areaCode });

  logger.info("provisioning_number_bought", {
    phoneNumber: result.phoneNumber,
    sid: result.sid,
    country,
  });

  return result;
}

export async function configureNumberWebhooks(
  phoneNumber: string,
  agentId: string,
  webhookBaseUrl: string
): Promise<void> {
  const telephony = getProvider("telephony");

  const smsUrl = `${webhookBaseUrl}/webhooks/${agentId}/sms`;
  const voiceUrl = `${webhookBaseUrl}/webhooks/${agentId}/voice`;

  await telephony.configureWebhooks(phoneNumber, { smsUrl, voiceUrl });

  logger.info("provisioning_webhooks_configured", {
    phoneNumber,
    agentId,
    smsUrl,
    voiceUrl,
  });
}

export async function releasePhoneNumber(phoneNumber: string): Promise<void> {
  const telephony = getProvider("telephony");
  await telephony.releaseNumber(phoneNumber);

  logger.info("provisioning_number_released", { phoneNumber });
}
