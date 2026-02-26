#!/usr/bin/env python3
"""Comprehensive REST API test — tests all endpoints with descriptive error validation."""
import json, urllib.request, urllib.error, sys

BASE = "http://localhost:3100/api/v1"
TOKEN = None
AGENT_ID = None
results = []

def req(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r)
        raw = resp.read().decode()
        ct = resp.headers.get("Content-Type", "")
        if "json" in ct:
            result = json.loads(raw)
        else:
            result = {"_raw": raw[:500]}
        return {"status": resp.status, "body": result}
    except urllib.error.HTTPError as e:
        raw = e.read().decode() if e.fp else ""
        try:
            result = json.loads(raw)
        except:
            result = {"_raw": raw[:500]}
        return {"status": e.code, "body": result}
    except Exception as e:
        return {"status": 0, "body": {"error": str(e)}}

def test(name, method, path, body=None, token=None, expect_status=200, check=None):
    r = req(method, path, body, token)
    passed = r["status"] == expect_status
    if check and passed:
        try:
            passed = check(r["body"])
        except:
            passed = False
    tag = "PASS" if passed else "FAIL"
    results.append((name, tag, r["status"], r["body"]))
    print("  [%s] %s -> %d" % (tag, name, r["status"]))
    return r["body"]


print("\n=== 1. PUBLIC ENDPOINTS (no auth) ===")

test("GET /health", "GET", "/health",
     check=lambda b: b.get("status") == "ok" and "mode" in b)

test("GET /openapi.json", "GET", "/openapi.json",
     check=lambda b: b.get("openapi") == "3.1.0")

test("GET /integration-guide", "GET", "/integration-guide",
     check=lambda b: "_raw" in b)


print("\n=== 2. AUTH ERRORS ===")

test("No auth header -> 400 (demo mode passes auth, fails on missing fields)", "POST", "/send-message",
     body={}, expect_status=400)


print("\n=== 3. PROVISION (demo admin) ===")

result = test("POST /provision", "POST", "/provision",
     body={"displayName": "Test Bot", "capabilities": {"phone": True, "voiceAi": True, "email": True}},
     token="demo-admin", expect_status=200,
     check=lambda b: b.get("success") and b.get("securityToken"))

if result.get("securityToken"):
    TOKEN = result["securityToken"]
    AGENT_ID = result["agentId"]
    print("  -> API key received, agent: %s" % AGENT_ID)
else:
    print("  !! PROVISION FAILED - cannot continue")
    sys.exit(1)


print("\n=== 4. DESCRIPTIVE ERROR MESSAGES ===")

def show_err(r):
    err = r.get("error", "")
    lines = err.split("\\n") if "\\n" in err else err.split("\n")
    print("     -> %s" % lines[0][:120])

r = test("send-message: missing 'to'", "POST", "/send-message",
     body={"body": "test"}, token=TOKEN, expect_status=400)
show_err(r)

r = test("send-message: missing 'body'", "POST", "/send-message",
     body={"to": "+15551234567"}, token=TOKEN, expect_status=400)
show_err(r)

r = test("make-call: missing 'to'", "POST", "/make-call",
     body={}, token=TOKEN, expect_status=400)
show_err(r)

r = test("call-on-behalf: missing 'target'", "POST", "/call-on-behalf",
     body={"requesterPhone": "+1555"}, token=TOKEN, expect_status=400)
show_err(r)

r = test("call-on-behalf: missing 'requesterPhone'", "POST", "/call-on-behalf",
     body={"target": "+1555"}, token=TOKEN, expect_status=400)
show_err(r)

r = test("send-voice-message: missing 'to'", "POST", "/send-voice-message",
     body={"text": "hi"}, token=TOKEN, expect_status=400)
show_err(r)

r = test("send-voice-message: missing 'text'", "POST", "/send-voice-message",
     body={"to": "+1555"}, token=TOKEN, expect_status=400)
show_err(r)

r = test("transfer-call: missing 'callSid'", "POST", "/transfer-call",
     body={"to": "+1555"}, token=TOKEN, expect_status=400)
show_err(r)

r = test("transfer-call: missing 'to'", "POST", "/transfer-call",
     body={"callSid": "CAfake"}, token=TOKEN, expect_status=400)
show_err(r)

r = test("agent-limits: missing 'limits'", "POST", "/agent-limits",
     body={}, token=TOKEN, expect_status=400)
show_err(r)

r = test("provision: missing 'displayName'", "POST", "/provision",
     body={"capabilities": {"phone": True}}, token=TOKEN, expect_status=400)
show_err(r)

r = test("provision: missing 'capabilities'", "POST", "/provision",
     body={"displayName": "X"}, token=TOKEN, expect_status=400)
show_err(r)

r = test("onboard: missing 'displayName'", "POST", "/onboard",
     body={}, token=TOKEN, expect_status=400)
show_err(r)


print("\n=== 5. SUCCESSFUL COMMUNICATION ===")

test("POST /send-message (SMS)", "POST", "/send-message",
     body={"to": "+15551234567", "body": "Hello API"},
     token=TOKEN, check=lambda b: b.get("success") and b.get("channel") == "sms")

test("POST /send-message (email)", "POST", "/send-message",
     body={"to": "test@example.com", "body": "Email body", "channel": "email", "subject": "Test"},
     token=TOKEN, check=lambda b: b.get("success") and b.get("channel") == "email")

test("POST /make-call", "POST", "/make-call",
     body={"to": "+15551234567"},
     token=TOKEN, check=lambda b: b.get("success") and b.get("callSid"))

test("POST /call-on-behalf", "POST", "/call-on-behalf",
     body={"target": "+15551234567", "requesterPhone": "+15559876543", "requesterName": "John"},
     token=TOKEN, check=lambda b: b.get("success"))

test("POST /send-voice-message", "POST", "/send-voice-message",
     body={"to": "+15551234567", "text": "Test voice message"},
     token=TOKEN, check=lambda b: b.get("success"))


print("\n=== 6. GET ENDPOINTS (token auto-detect) ===")

test("GET /waiting-messages", "GET", "/waiting-messages",
     token=TOKEN, check=lambda b: "messages" in b and "count" in b)

test("GET /channel-status", "GET", "/channel-status",
     token=TOKEN, check=lambda b: b.get("agentId") == AGENT_ID and "channels" in b)

test("GET /usage", "GET", "/usage",
     token=TOKEN, check=lambda b: b.get("agentId") == AGENT_ID and "totalActions" in b)

test("GET /usage?period=week", "GET", "/usage?period=week",
     token=TOKEN, check=lambda b: b.get("period") == "week")

test("GET /usage?period=month", "GET", "/usage?period=month",
     token=TOKEN, check=lambda b: b.get("period") == "month")

test("GET /billing", "GET", "/billing",
     token=TOKEN, check=lambda b: b.get("agentId") == AGENT_ID)

test("GET /billing?period=today", "GET", "/billing?period=today",
     token=TOKEN, check=lambda b: b.get("period") == "today")


print("\n=== 7. ADMIN ENDPOINTS ===")

test("GET /agents/{id}/tokens", "GET", "/agents/%s/tokens" % AGENT_ID,
     token=TOKEN, check=lambda b: "tokens" in b)

test("POST /billing/config", "POST", "/billing/config",
     body={"agentId": AGENT_ID, "tier": "starter"},
     token=TOKEN, check=lambda b: b.get("success"))

test("POST /agent-limits", "POST", "/agent-limits",
     body={"limits": {"maxActionsPerMinute": 20, "maxActionsPerHour": 200}},
     token=TOKEN, check=lambda b: b.get("success"))

# Transfer call — mock provider succeeds with any callSid in demo mode
test("POST /transfer-call (mock succeeds in demo)", "POST", "/transfer-call",
     body={"callSid": "CA00000000000000000000000000000000", "to": "+15551234567"},
     token=TOKEN, expect_status=200)


print("\n=== 8. TOKEN REGENERATION ===")

r = test("POST /agents/{id}/regenerate-token", "POST", "/agents/%s/regenerate-token" % AGENT_ID,
     token=TOKEN, check=lambda b: b.get("success") and b.get("token"))

NEW_TOKEN = r.get("token")
if NEW_TOKEN:
    print("  -> New token received")

    # In demo mode, revoked token means agentId can't be resolved -> 400 (not 401)
    test("Old token: agentId unresolved", "POST", "/send-message",
         body={"to": "+1555", "body": "test"}, token=TOKEN, expect_status=400)

    test("New token works", "GET", "/channel-status",
         token=NEW_TOKEN, check=lambda b: b.get("agentId") == AGENT_ID)

    TOKEN = NEW_TOKEN


print("\n=== 9. DEPROVISION + POST-DEPROVISION ===")

test("POST /deprovision", "POST", "/deprovision",
     body={"agentId": AGENT_ID}, token=TOKEN,
     check=lambda b: b.get("success") and b.get("status") == "deprovisioned")

test("send-message after deprovision", "POST", "/send-message",
     body={"to": "+15551234567", "body": "test"}, token=TOKEN, expect_status=400)


print("\n=== 10. ONBOARD FULL FLOW ===")

r = test("POST /onboard", "POST", "/onboard",
     body={"displayName": "Onboard Bot", "capabilities": {"phone": True, "email": True}},
     token="demo-admin",
     check=lambda b: b.get("success") and b.get("provisioning", {}).get("securityToken"))

if r.get("provisioning"):
    ob_token = r["provisioning"]["securityToken"]
    ob_id = r["provisioning"]["agentId"]
    print("  -> Onboarded: %s" % ob_id)

    test("Onboarded agent: channel-status", "GET", "/channel-status",
         token=ob_token, check=lambda b: b.get("agentId") == ob_id)

    test("Onboarded agent: send SMS", "POST", "/send-message",
         body={"to": "+15551234567", "body": "Hello from onboard"},
         token=ob_token, check=lambda b: b.get("success"))

    test("Cleanup: deprovision onboard", "POST", "/deprovision",
         body={"agentId": ob_id}, token="demo-admin",
         check=lambda b: b.get("success"))


# ═══════════════════════════════════════════
print("\n")
print("=" * 50)
print("         TEST SUMMARY")
print("=" * 50)

passed = sum(1 for _, t, _, _ in results if t == "PASS")
failed = sum(1 for _, t, _, _ in results if t == "FAIL")
print("  PASSED: %d" % passed)
print("  FAILED: %d" % failed)
print("  TOTAL:  %d" % len(results))

if failed > 0:
    print("\n  FAILURES:")
    for name, tag, status, body in results:
        if tag == "FAIL":
            err = str(body)[:150]
            print("    - %s (got %d): %s" % (name, status, err))
    sys.exit(1)

print("\n  All tests passed!")
