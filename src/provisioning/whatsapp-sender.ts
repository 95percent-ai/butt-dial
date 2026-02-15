/**
 * WhatsApp sender pool management.
 * Assigns / returns WhatsApp numbers from the shared pool.
 */

import type { IDBProvider } from "../providers/interfaces.js";
import { getProvider } from "../providers/factory.js";
import { logger } from "../lib/logger.js";

interface PoolRow {
  id: string;
  phone_number: string;
  sender_sid: string | null;
  status: string;
}

export function assignFromPool(
  db: IDBProvider,
  agentId: string
): { phoneNumber: string; senderSid: string | null } | null {
  const rows = db.query<PoolRow>(
    "SELECT id, phone_number, sender_sid, status FROM whatsapp_pool WHERE status = 'available' LIMIT 1"
  );

  if (rows.length === 0) {
    logger.warn("whatsapp_pool_empty", { agentId });
    return null;
  }

  const entry = rows[0];

  db.run(
    "UPDATE whatsapp_pool SET status = 'assigned', assigned_to_agent = ? WHERE id = ?",
    [agentId, entry.id]
  );

  logger.info("whatsapp_pool_assigned", {
    agentId,
    phoneNumber: entry.phone_number,
    poolEntryId: entry.id,
  });

  return { phoneNumber: entry.phone_number, senderSid: entry.sender_sid };
}

export function returnToPool(db: IDBProvider, agentId: string): boolean {
  const result = db.run(
    "UPDATE whatsapp_pool SET status = 'available', assigned_to_agent = NULL WHERE assigned_to_agent = ?",
    [agentId]
  );

  if (result.changes > 0) {
    logger.info("whatsapp_pool_returned", { agentId });
    return true;
  }

  logger.warn("whatsapp_pool_nothing_to_return", { agentId });
  return false;
}

export async function registerNewSender(
  phoneNumber: string,
  displayName: string
): Promise<{ senderId: string; status: string }> {
  const whatsapp = getProvider("whatsapp");
  const result = await whatsapp.registerSender(phoneNumber, displayName);

  logger.info("whatsapp_sender_registered", {
    phoneNumber,
    displayName,
    senderId: result.senderId,
    status: result.status,
  });

  return result;
}
