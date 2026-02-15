/**
 * Email identity provisioning helpers.
 * Generates email addresses and handles domain verification.
 */

import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";

export function generateEmailAddress(agentId: string, domain: string): string {
  const address = `${agentId}@${domain}`;
  logger.info("provisioning_email_generated", { agentId, address });
  return address;
}

export async function requestDomainVerification(
  domain: string
): Promise<{ records: Array<{ type: string; name: string; value: string }> }> {
  const email = getProvider("email");
  const result = await email.verifyDomain(domain);

  logger.info("provisioning_domain_verification_requested", {
    domain,
    recordCount: result.records.length,
  });

  return result;
}
