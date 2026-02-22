/**
 * Demo data generators — realistic mock data for dashboard when DEMO_MODE=true.
 * Simulates a $50 account with 3 agents across all channels.
 */

/* ── Helpers ──────────────────────────────────────────────── */

/** ISO date string N days ago from "now" (stable per-call). */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** ISO date string for today at a given hour. */
function todayAt(hour: number, minOffset = 0): string {
  const d = new Date();
  d.setHours(hour, minOffset, 0, 0);
  return d.toISOString();
}

/** Date-only string (YYYY-MM-DD) N days ago. */
function dateOnly(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/* ── Dashboard Main (/admin/api/dashboard) ────────────────── */

export function getDemoDashboard() {
  return {
    agents: [
      {
        agent_id: "main-receptionist",
        display_name: "Main Receptionist",
        phone_number: "+1 (555) 234-5678",
        email_address: "reception@acme-demo.com",
        status: "active",
        blocked_channels: "[]",
      },
      {
        agent_id: "support-bot",
        display_name: "Support Bot",
        phone_number: "+1 (555) 234-5679",
        email_address: "support@acme-demo.com",
        status: "active",
        blocked_channels: "[]",
      },
      {
        agent_id: "sales-agent",
        display_name: "Sales Agent",
        phone_number: "+1 (555) 234-5680",
        email_address: "sales@acme-demo.com",
        status: "active",
        blocked_channels: "[]",
      },
    ],

    usage: {
      totalMessages: 847,
      todayActions: 28,
      totalCost: 49.72,
      spendToday: 3.85,
      spendThisMonth: 38.47,
      totalCalls: 73,
      todayCalls: 5,
      pendingVoicemails: 3,
      deliveryTotal: 847,
      deliverySuccess: 821,
      limits: {
        maxActionsDay: 500,
        maxSpendDay: 25.0,
        maxSpendMonth: 100.0,
      },
    },

    services: {
      database: { status: "ok", provider: "SQLite" },
      telephony: { status: "ok", provider: "Twilio" },
      email: { status: "ok", provider: "Resend" },
      whatsapp: { status: "ok", provider: "GreenAPI" },
      voice: { status: "ok", provider: "ElevenLabs" },
      assistant: { status: "ok", provider: "Anthropic" },
    },

    recentActivity: [
      { actionType: "inbound_call", channel: "voice", target: "+972502629999", status: "success", cost: 0.52, timestamp: todayAt(14, 45) },
      { actionType: "send_email", channel: "email", target: "sz@aidg.com", status: "delivered", cost: 0.001, timestamp: todayAt(14, 38) },
      { actionType: "inbound_call", channel: "voice", target: "+1 (555) 987-6543", status: "success", cost: 0.45, timestamp: todayAt(14, 32) },
      { actionType: "send_sms", channel: "sms", target: "+972502629999", status: "delivered", cost: 0.0075, timestamp: todayAt(14, 18) },
      { actionType: "send_email", channel: "email", target: "jane.doe@example.com", status: "delivered", cost: 0.001, timestamp: todayAt(13, 55) },
      { actionType: "outbound_call", channel: "voice", target: "+1 (555) 444-5566", status: "success", cost: 0.38, timestamp: todayAt(13, 40) },
      { actionType: "send_whatsapp", channel: "whatsapp", target: "+1 (555) 777-8899", status: "delivered", cost: 0.02, timestamp: todayAt(13, 12) },
      { actionType: "send_sms", channel: "sms", target: "+1 (555) 222-3344", status: "delivered", cost: 0.0075, timestamp: todayAt(12, 48) },
      { actionType: "inbound_call", channel: "voice", target: "+1 (555) 333-4455", status: "voicemail", cost: 0.12, timestamp: todayAt(12, 15) },
      { actionType: "send_email", channel: "email", target: "bob.smith@example.com", status: "delivered", cost: 0.001, timestamp: todayAt(11, 30) },
      { actionType: "send_sms", channel: "sms", target: "+1 (555) 666-7788", status: "delivered", cost: 0.0075, timestamp: todayAt(11, 5) },
      { actionType: "inbound_call", channel: "voice", target: "+1 (555) 999-0011", status: "success", cost: 0.52, timestamp: todayAt(10, 40) },
      { actionType: "send_whatsapp", channel: "whatsapp", target: "+1 (555) 123-4567", status: "delivered", cost: 0.02, timestamp: todayAt(10, 15) },
      { actionType: "transfer_call", channel: "voice", target: "+1 (555) 555-0100", status: "success", cost: 0.08, timestamp: todayAt(9, 50) },
      { actionType: "send_email", channel: "email", target: "alice@startup.io", status: "delivered", cost: 0.001, timestamp: todayAt(9, 22) },
      { actionType: "send_sms", channel: "sms", target: "+1 (555) 888-9900", status: "failed", cost: 0, timestamp: todayAt(9, 10) },
      { actionType: "inbound_call", channel: "voice", target: "+1 (555) 321-6540", status: "success", cost: 0.31, timestamp: daysAgo(1) },
    ],

    alerts: [
      { severity: "HIGH", message: "Brute-force lockout triggered for IP 203.0.113.42", timestamp: daysAgo(1) },
      { severity: "MEDIUM", message: "Daily spend at 78% of limit for agent sales-agent", timestamp: daysAgo(2) },
      { severity: "INFO", message: "Agent support-bot reconnected after 4m offline — 2 voicemails dispatched", timestamp: daysAgo(2) },
      { severity: "INFO", message: "Provider Twilio webhook signature verified successfully", timestamp: daysAgo(3) },
      { severity: "LOW", message: "Demo mode enabled — mock providers active", timestamp: daysAgo(5) },
      { severity: "INFO", message: "System started — 3 agents provisioned", timestamp: daysAgo(7) },
    ],
  };
}

/* ── Usage History (/admin/api/usage-history) ─────────────── */

export function getDemoUsageHistory() {
  // 14 days of messages by day and channel
  const messagesByDay: Array<{ day: string; channel: string; count: number }> = [];
  const channels = ["sms", "voice", "email", "whatsapp"];
  const baseCounts: Record<string, number[]> = {
    sms:      [18, 22, 15, 28, 31, 12, 8, 25, 19, 30, 27, 14, 33, 21],
    voice:    [ 5,  7,  4,  8,  6,  3, 2,  7,  5,  9,  6,  4,  8,  5],
    email:    [12, 15, 10, 18, 14,  8, 5, 16, 11, 20, 17,  9, 22, 13],
    whatsapp: [ 4,  6,  3,  7,  5,  2, 1,  5,  4,  8,  6,  3,  9,  5],
  };

  for (let i = 13; i >= 0; i--) {
    const day = dateOnly(i);
    const idx = 13 - i;
    for (const ch of channels) {
      messagesByDay.push({ day, channel: ch, count: baseCounts[ch][idx] });
    }
  }

  // Cost by channel (last 30 days)
  const costByChannel = [
    { channel: "voice",    total_cost: 22.35, count: 73 },
    { channel: "sms",      total_cost: 12.60, count: 420 },
    { channel: "email",    total_cost: 3.27,  count: 218 },
    { channel: "whatsapp", total_cost: 11.50, count: 136 },
  ];

  return { messagesByDay, costByChannel };
}

/* ── Top Contacts (/admin/api/top-contacts) ───────────────── */

export function getDemoTopContacts() {
  return {
    contacts: [
      { target_address: "+972502629999",     channel: "voice",    action_count: 31, total_cost: 12.80, last_activity: daysAgo(0) },
      { target_address: "sz@aidg.com",       channel: "email",    action_count: 22, total_cost: 0.022, last_activity: daysAgo(0) },
      { target_address: "+1 (555) 987-6543", channel: "voice",    action_count: 24, total_cost: 8.40,  last_activity: daysAgo(0) },
      { target_address: "+1 (555) 111-2233", channel: "sms",      action_count: 18, total_cost: 0.14,  last_activity: daysAgo(0) },
      { target_address: "jane.doe@example.com", channel: "email", action_count: 15, total_cost: 0.015, last_activity: daysAgo(0) },
      { target_address: "+1 (555) 777-8899", channel: "whatsapp", action_count: 12, total_cost: 2.40,  last_activity: daysAgo(1) },
      { target_address: "+1 (555) 444-5566", channel: "voice",    action_count: 11, total_cost: 5.28,  last_activity: daysAgo(0) },
      { target_address: "bob.smith@example.com", channel: "email", action_count: 9,  total_cost: 0.009, last_activity: daysAgo(1) },
      { target_address: "+1 (555) 222-3344", channel: "sms",      action_count: 8,  total_cost: 0.06,  last_activity: daysAgo(0) },
      { target_address: "+1 (555) 123-4567", channel: "whatsapp", action_count: 7,  total_cost: 1.40,  last_activity: daysAgo(1) },
      { target_address: "+1 (555) 333-4455", channel: "voice",    action_count: 6,  total_cost: 2.16,  last_activity: daysAgo(0) },
      { target_address: "alice@startup.io",  channel: "email",    action_count: 5,  total_cost: 0.005, last_activity: daysAgo(2) },
    ],
  };
}

/* ── Analytics (/admin/api/analytics) ─────────────────────── */

export function getDemoAnalytics() {
  // Delivery rate (30d) — 97% success
  const deliveryRate = { total: 847, success: 821, failed: 26 };

  // Channel distribution (30d)
  const channelDistribution = [
    { channel: "sms",      count: 420 },
    { channel: "email",    count: 218 },
    { channel: "whatsapp", count: 136 },
    { channel: "voice",    count: 73 },
  ];

  // Peak hours (last 30d)
  const peakHours = [
    { hour: 8,  count: 42 },
    { hour: 9,  count: 87 },
    { hour: 10, count: 112 },
    { hour: 11, count: 98 },
    { hour: 12, count: 64 },
    { hour: 13, count: 78 },
    { hour: 14, count: 105 },
    { hour: 15, count: 91 },
    { hour: 16, count: 73 },
    { hour: 17, count: 55 },
    { hour: 18, count: 28 },
    { hour: 19, count: 14 },
  ];

  // Cost trend (14d)
  const costTrend: Array<{ day: string; cost: number }> = [];
  const dailyCosts = [2.85, 3.42, 2.10, 4.18, 3.95, 1.72, 0.88, 3.65, 2.91, 4.52, 3.80, 2.05, 5.12, 3.85];
  for (let i = 13; i >= 0; i--) {
    costTrend.push({ day: dateOnly(i), cost: dailyCosts[13 - i] });
  }

  // Error rate (7d)
  const errorRate: Array<{ day: string; total: number; errors: number }> = [];
  const dailyTotals  = [62, 74, 58, 85, 71, 48, 79];
  const dailyErrors  = [ 2,  1,  3,  1,  2,  0,  1];
  for (let i = 6; i >= 0; i--) {
    errorRate.push({ day: dateOnly(i), total: dailyTotals[6 - i], errors: dailyErrors[6 - i] });
  }

  return { deliveryRate, channelDistribution, peakHours, costTrend, errorRate };
}
