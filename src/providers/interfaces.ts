/**
 * Provider interfaces — abstract contracts that all adapters implement.
 * Core code calls these interfaces, never vendor-specific APIs.
 */

export interface SendSmsParams {
  from: string;
  to: string;
  body: string;
  mediaUrl?: string;
}

export interface SendSmsResult {
  messageId: string;
  status: string;
  cost?: number;
}

export interface MakeCallParams {
  from: string;
  to: string;
  webhookUrl: string;
  statusCallbackUrl?: string;
}

export interface MakeCallResult {
  callSid: string;
  status: string;
}

export interface BuyNumberParams {
  country: string;
  capabilities: { voice: boolean; sms: boolean };
  areaCode?: string;
}

export interface BuyNumberResult {
  phoneNumber: string;
  sid: string;
}

export interface ITelephonyProvider {
  sendSms(params: SendSmsParams): Promise<SendSmsResult>;
  makeCall(params: MakeCallParams): Promise<MakeCallResult>;
  buyNumber(params: BuyNumberParams): Promise<BuyNumberResult>;
  releaseNumber(phoneNumber: string): Promise<void>;
  configureWebhooks(phoneNumber: string, webhooks: { voiceUrl?: string; smsUrl?: string }): Promise<void>;
  verifyWebhookSignature(headers: Record<string, string>, body: string, url: string): boolean;
}

export interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

export interface SendEmailResult {
  messageId: string;
  status: string;
  cost?: number;
}

export interface IEmailProvider {
  send(params: SendEmailParams): Promise<SendEmailResult>;
  verifyDomain(domain: string): Promise<{ records: Array<{ type: string; name: string; value: string }> }>;
}

export interface SendWhatsAppParams {
  from: string;
  to: string;
  body: string;
  mediaUrl?: string;
  templateId?: string;
  templateVars?: Record<string, string>;
}

export interface SendWhatsAppResult {
  messageId: string;
  status: string;
  cost?: number;
}

export interface IWhatsAppProvider {
  send(params: SendWhatsAppParams): Promise<SendWhatsAppResult>;
  registerSender(phoneNumber: string, displayName: string): Promise<{ senderId: string; status: string }>;
}

export interface TTSSynthesizeParams {
  text: string;
  voice?: string;
  outputFormat?: string;
}

export interface TTSSynthesizeResult {
  audioBuffer: Buffer;
  durationSeconds: number;
}

export interface ITTSProvider {
  synthesize(params: TTSSynthesizeParams): Promise<TTSSynthesizeResult>;
  listVoices(): Promise<Array<{ id: string; name: string; language: string }>>;
}

export interface ISTTProvider {
  transcribe(audioBuffer: Buffer, format?: string): Promise<{ text: string; confidence: number }>;
}

export interface IVoiceOrchestrator {
  getConnectionTwiml(params: {
    agentId: string;
    websocketUrl: string;
    ttsProvider?: string;
    voice?: string;
    greeting?: string;
    language?: string;
  }): string;
}

export interface IDBProvider {
  query<T>(sql: string, params?: unknown[]): T[];
  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  exec(sql: string): void;
  close(): void;
}

export interface IStorageProvider {
  upload(key: string, data: Buffer, contentType?: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}
