"""Real Gmail SMTP, WhatsApp Webhook, Founder Collaboration Charter, and Live Supabase Policy Sync."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import smtplib
from datetime import UTC, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Annotated, Any

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.db.models import Policy, PolicyRevision
from app.db.policy_lifecycle_audit import (
    POLICY_LIFECYCLE_WRITE_LOCK,
    append_policy_lifecycle_event,
)
from app.schemas.policy import Condition, ConditionOperator, PolicyRule, Verdict

# Force-load .env from backend root so os.getenv() always sees SMTP_APP_PASSWORD
_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(dotenv_path=_ENV_PATH, override=True)

router = APIRouter(prefix="/integrations", tags=["real integrations"])

FOUNDER_NAME = os.getenv("FOUNDER_NAME", "Mohammed Fahad Ali")
FOUNDER_EMAIL = os.getenv("FOUNDER_EMAIL", "mdfahadali.in@gmail.com")
FOUNDER_PHONE = os.getenv("FOUNDER_PHONE", "+91 91216 13624")

_OTP_STORE: dict[str, tuple[str, float]] = {}


class OTPRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    channel: str = Field(pattern="^(gmail|phone)$")
    identifier: str = Field(min_length=3, max_length=200)
    full_name: str = Field(default="Executive Partner", max_length=200)
    company_name: str = Field(default="Enterprise Workspace", max_length=200)


class OTPVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    identifier: str = Field(min_length=3, max_length=200)
    otp_code: str = Field(min_length=4, max_length=10)


class WelcomeCharterRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    channel: str = Field(pattern="^(gmail|phone)$")
    identifier: str = Field(min_length=3, max_length=200)
    full_name: str = Field(min_length=2, max_length=200)
    company_name: str = Field(min_length=2, max_length=200)
    role_title: str = Field(default="Executive Partner", max_length=200)
    tenant_id: str = Field(min_length=3, max_length=120)
    sdk_key: str = Field(min_length=6, max_length=200)


class LiveAnnouncementRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    source_channel: str = Field(default="slack:#ops-policies", max_length=200)
    manager_identifier: str = Field(min_length=3, max_length=200)
    notify_via: str = Field(default="gmail", pattern="^(gmail|whatsapp)$")
    announcement_text: str = Field(min_length=5, max_length=4000)


def _sign_revision_token(revision_id: int, policy_key: str) -> str:
    secret = os.getenv("AEGIS_SIGNING_SECRET", "aegis-prod-hmac-secret-2026")
    msg = f"{revision_id}:{policy_key}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()[:32]


def _send_real_gmail(to_email: str, subject: str, html_body: str) -> tuple[bool, str]:
    """Sends a real HTML email via Gmail SMTP and returns (success, error_or_status)."""
    load_dotenv(dotenv_path=_ENV_PATH, override=True)
    smtp_user = os.getenv("SMTP_USER", FOUNDER_EMAIL).strip()
    smtp_pass = os.getenv("SMTP_APP_PASSWORD", "").strip().replace(" ", "")
    if not smtp_pass:
        return (
            False,
            "SMTP_APP_PASSWORD is missing in aegisbrain-backend/.env. Create a 16-letter Google App Password at myaccount.google.com/apppasswords",
        )
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{FOUNDER_NAME} · AegisBrain <{smtp_user}>"
        msg["Reply-To"] = FOUNDER_EMAIL
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=12) as server:
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [to_email], msg.as_string())
        return True, f"Delivered to {to_email} via Gmail SMTP"
    except Exception as exc:
        return False, f"Gmail SMTP error: {exc}"


def _send_real_whatsapp(to_phone: str, body_text: str) -> tuple[bool, str]:
    """Sends a real WhatsApp message via Twilio WhatsApp API if configured in .env."""
    load_dotenv(dotenv_path=_ENV_PATH, override=True)
    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_whatsapp = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886").strip()
    if not sid or not token:
        return False, "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set in .env"
    digits = re.sub(r"[^0-9+]", "", to_phone)
    if not digits.startswith("+"):
        digits = f"+91{digits}" if len(digits) == 10 else f"+{digits}"
    clean_to = f"whatsapp:{digits}"
    try:
        res = httpx.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            auth=(sid, token),
            data={"From": from_whatsapp, "To": clean_to, "Body": body_text},
            timeout=10.0,
        )
        if res.status_code in (200, 201):
            return True, f"Delivered to {digits} via Twilio WhatsApp"
        return False, f"Twilio status {res.status_code}: {res.text[:160]}"
    except Exception as exc:
        return False, f"Twilio error: {exc}"


def _build_welcome_charter_html(payload: WelcomeCharterRequest) -> str:
    now_str = datetime.now(UTC).strftime("%B %d, %Y · %H:%M UTC")
    masked_key = f"{payload.sdk_key[:16]}••••••••••••••••••••"
    return f"""
    <div style="font-family:'Segoe UI',Inter,Helvetica,Arial,sans-serif;background-color:#f2f6fd;padding:32px 16px;color:#0b1a33;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #d8e4fa;border-radius:28px;overflow:hidden;box-shadow:0 24px 60px rgba(43,84,240,0.12);">
        <div style="background:linear-gradient(135deg,#0b1a33 0%,#1e3a8a 60%,#2b54f0 100%);padding:32px;color:#ffffff;">
          <span style="display:inline-block;background:rgba(255,255,255,0.15);padding:5px 14px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">
            Official Governance &amp; Collaboration Charter
          </span>
          <h1 style="margin:16px 0 6px;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
            Welcome to the AegisBrain Family, {payload.full_name}
          </h1>
          <p style="margin:0;color:#dbeafe;font-size:14px;">
            Enterprise Policy Gateway provisioned for <strong>{payload.company_name}</strong>
          </p>
        </div>

        <div style="padding:32px;">
          <p style="font-size:15px;line-height:1.65;color:#1e293b;margin-top:0;">
            Dear <strong>{payload.full_name}</strong> ({payload.role_title}),
          </p>
          <p style="font-size:14.5px;line-height:1.65;color:#475569;">
            Thank you for collaborating with <strong>AegisBrain</strong>. Your organization’s isolated policy gateway,
            sub-millisecond AST rule engine, and tamper-evident SHA-256 audit ledger are now live on our Supabase
            PostgreSQL cluster.
          </p>

          <div style="background:#f5f9ff;border:1px solid #d8e4fa;border-radius:18px;padding:20px;margin:24px 0;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#2b54f0;margin-bottom:12px;">
              Executed Workspace &amp; Contract Summary
            </div>
            <table style="width:100%;font-size:13.5px;border-collapse:collapse;">
              <tr>
                <td style="padding:6px 0;color:#64748b;">Partner Organization:</td>
                <td style="padding:6px 0;font-weight:700;color:#0b1a33;text-align:right;">{payload.company_name}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Verified Decision-Maker:</td>
                <td style="padding:6px 0;font-weight:700;color:#0b1a33;text-align:right;">{payload.full_name} ({payload.identifier})</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Isolated Tenant ID:</td>
                <td style="padding:6px 0;font-family:monospace;font-weight:700;color:#2b54f0;text-align:right;">{payload.tenant_id}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Provisioned SDK Key:</td>
                <td style="padding:6px 0;font-family:monospace;color:#0b1a33;text-align:right;">{masked_key}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;">Timestamp:</td>
                <td style="padding:6px 0;color:#475569;text-align:right;">{now_str}</td>
              </tr>
            </table>
          </div>

          <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:14px;font-weight:700;color:#0b1a33;">{FOUNDER_NAME}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Founder &amp; Lead Architect, AegisBrain</p>
            <p style="margin:4px 0 0;font-size:12px;color:#2b54f0;">{FOUNDER_EMAIL} · {FOUNDER_PHONE}</p>
          </div>
        </div>
      </div>
    </div>
    """


def _build_welcome_charter_whatsapp(payload: WelcomeCharterRequest) -> str:
    return (
        f"🛡️ *WELCOME TO AEGISBRAIN — OFFICIAL COLLABORATION CHARTER*\n\n"
        f"Dear *{payload.full_name}* ({payload.role_title}),\n"
        f"Thank you for being part of *AegisBrain*. Your enterprise policy gateway for *{payload.company_name}* is now live.\n\n"
        f"📋 *Executed Contract Details:*\n"
        f"• *Organization:* {payload.company_name}\n"
        f"• *Tenant ID:* `{payload.tenant_id}`\n"
        f"• *Verified Manager:* {payload.identifier}\n"
        f"• *Runtime Protection:* Sub-millisecond AST Auto-Correction + SHA-256 Audit Chain\n\n"
        f"Warm regards,\n"
        f"*{FOUNDER_NAME}*\n"
        f"Founder, AegisBrain\n"
        f"📧 {FOUNDER_EMAIL} | 📞 {FOUNDER_PHONE}"
    )


def _compile_announcement_to_rule(text: str) -> tuple[dict[str, Any], str]:
    lower = text.lower()
    is_discount = any(w in lower for w in ("discount", "promo", "coupon", "%", "percent"))
    numbers = [
        float(m.replace(",", ""))
        for m in re.findall(r"\b\d+(?:,\d{3})*(?:\.\d+)?\b", text)
    ]
    threshold: int | float = (
        int(numbers[0])
        if numbers and numbers[0].is_integer()
        else (numbers[0] if numbers else (5 if is_discount else 5000))
    )

    if is_discount:
        policy_key = "promo_cap_v2"
        action = "discounts.apply"
        field_name = "discount_pct"
        effect = Verdict.DENY
        priority = 100
        plain_summary = f"Cap all promotional discounts at {threshold}% (Auto-correct any higher agent discount to {threshold}%)."
        reason = f"Discounts above {threshold}% are not allowed by active manager policy. Auto-correcting to {threshold}%."
    else:
        policy_key = "refund_cap_v1"
        action = "refunds.create"
        field_name = "amount_inr"
        effect = Verdict.HOLD
        priority = 100
        plain_summary = f"Hold any customer refund above ₹{threshold:,} for manager approval."
        reason = f"Refunds above ₹{threshold:,} require manager approval. The refund is held."

    rule = PolicyRule(
        policy_key=policy_key,
        action=action,
        effect=effect,
        priority=priority,
        conditions=[
            Condition(
                field=field_name,
                operator=ConditionOperator.GT,
                value=threshold,
            )
        ],
        summary=plain_summary[:240],
        reason=reason,
        version=1,
        status="active",
    )
    return rule.model_dump(mode="json"), plain_summary


def _stage_draft_in_supabase(
    session: Session,
    *,
    tenant_id: str,
    compiled: dict[str, Any],
    source_channel: str,
    source_text: str,
    authored_by: str,
) -> PolicyRevision:
    policy_key = str(compiled["policy_key"])
    with POLICY_LIFECYCLE_WRITE_LOCK:
        rev_max = (
            session.scalar(
                select(func.max(PolicyRevision.version)).where(
                    PolicyRevision.tenant_id == tenant_id,
                    PolicyRevision.policy_key == policy_key,
                )
            )
            or 0
        )
        pol_max = (
            session.scalar(
                select(Policy.version).where(
                    Policy.tenant_id == tenant_id,
                    Policy.policy_key == policy_key,
                )
            )
            or 0
        )
        next_version = max(rev_max, pol_max) + 1
        now = datetime.now(UTC)

        revision = PolicyRevision(
            tenant_id=tenant_id,
            policy_key=policy_key,
            action=str(compiled["action"]),
            effect=str(compiled["effect"]),
            priority=int(compiled["priority"]),
            conditions=list(compiled["conditions"]),
            summary=str(compiled["summary"]),
            reason=str(compiled["reason"]),
            status="draft",
            version=next_version,
            source_channel=source_channel,
            source_message_id=f"msg_{secrets.token_hex(4)}",
            source_text=source_text,
            authored_by=authored_by[:190],
            approved_by=None,
            locked_at=None,
            created_at=now,
            updated_at=now,
        )
        session.add(revision)
        session.flush()

        append_policy_lifecycle_event(
            session,
            tenant_id=tenant_id,
            event_type="real_channel_draft_staged",
            policy_key=policy_key,
            policy_version=next_version,
            actor_key_id=authored_by[:32],
            details={
                "source_channel": source_channel,
                "source_text_sha256": hashlib.sha256(source_text.encode("utf-8")).hexdigest(),
            },
        )
        session.commit()
        session.refresh(revision)
        return revision


def _lock_revision_into_supabase(
    session: Session,
    *,
    revision: PolicyRevision,
    approver_identity: str,
) -> Policy:
    with POLICY_LIFECYCLE_WRITE_LOCK:
        now = datetime.now(UTC)
        old_revs = session.scalars(
            select(PolicyRevision).where(
                PolicyRevision.tenant_id == revision.tenant_id,
                PolicyRevision.policy_key == revision.policy_key,
                PolicyRevision.status == "active",
            )
        ).all()
        for old in old_revs:
            old.status = "superseded"

        revision.status = "active"
        revision.approved_by = approver_identity[:190]
        revision.locked_at = now
        revision.updated_at = now

        current = session.scalar(
            select(Policy).where(
                Policy.tenant_id == revision.tenant_id,
                Policy.policy_key == revision.policy_key,
            )
        )
        if current is None:
            current = Policy(
                tenant_id=revision.tenant_id,
                policy_key=revision.policy_key,
                action=revision.action,
                effect=revision.effect,
                priority=revision.priority,
                conditions=revision.conditions,
                summary=revision.summary,
                reason=revision.reason,
                status="active",
                version=revision.version,
                source_channel=revision.source_channel,
                source_message_id=revision.source_message_id,
                authored_by=revision.authored_by,
                approved_by=approver_identity[:190],
                locked_at=now,
                is_demo_fixture=False,
                created_at=now,
            )
            session.add(current)
        else:
            current.action = revision.action
            current.effect = revision.effect
            current.priority = revision.priority
            current.conditions = revision.conditions
            current.summary = revision.summary
            current.reason = revision.reason
            current.status = "active"
            current.version = revision.version
            current.source_channel = revision.source_channel
            current.approved_by = approver_identity[:190]
            current.locked_at = now
            current.is_demo_fixture = False

        append_policy_lifecycle_event(
            session,
            tenant_id=revision.tenant_id,
            event_type="policy_locked_by_manager",
            policy_key=revision.policy_key,
            policy_version=revision.version,
            actor_key_id=approver_identity[:32],
            details={"revision_id": revision.id, "approved_by": approver_identity},
        )
        session.commit()
        session.refresh(current)
        return current


@router.post("/auth/send-otp")
def send_manager_otp(payload: OTPRequest) -> dict[str, Any]:
    """Generates a real server-side 6-digit OTP and dispatches it via Gmail SMTP or Twilio WhatsApp."""
    code = f"{secrets.randbelow(900000) + 100000}"
    expires = datetime.now(UTC).timestamp() + 300.0
    key = payload.identifier.strip().lower()
    _OTP_STORE[key] = (code, expires)

    if payload.channel == "gmail":
        html = f"""
        <div style="font-family:'Segoe UI',sans-serif;max-width:540px;margin:0 auto;padding:28px;border:1px solid #d8e4fa;border-radius:24px;background:#f4f8ff;">
          <span style="background:#2b54f0;color:#fff;padding:4px 12px;border-radius:99px;font-size:11px;font-weight:bold;">AEGISBRAIN EXECUTIVE PORTAL</span>
          <h2 style="color:#0b1a33;margin-top:14px;">Verify Your Manager Identity</h2>
          <p style="color:#475569;font-size:14.5px;line-height:1.5;">
            Hello <strong>{payload.full_name}</strong>, use the 6-digit verification passcode below to activate the
            AegisBrain Policy Gateway for <strong>{payload.company_name}</strong>:
          </p>
          <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#2b54f0;padding:18px;background:#ffffff;border:1px solid #d8e4fa;border-radius:16px;text-align:center;margin:20px 0;">
            {code}
          </div>
          <p style="font-size:12px;color:#64748b;margin:0;">
            Sent by {FOUNDER_NAME} ({FOUNDER_EMAIL} · {FOUNDER_PHONE})
          </p>
        </div>
        """
        delivered_live, detail_msg = _send_real_gmail(
            payload.identifier,
            f"[{code}] AegisBrain Verification Code for {payload.company_name}",
            html,
        )
    else:
        delivered_live, detail_msg = _send_real_whatsapp(
            payload.identifier,
            f"🛡️ *AegisBrain Executive Verification*\n\nHello *{payload.full_name}*, your 6-digit verification passcode for *{payload.company_name}* is:\n\n*{code}*\n\n— {FOUNDER_NAME} ({FOUNDER_PHONE})",
        )

    return {
        "status": "otp_dispatched",
        "channel": payload.channel,
        "identifier": payload.identifier,
        "delivered_via_live_provider": delivered_live,
        "provider_detail": detail_msg,
    }


@router.post("/auth/verify-otp")
def verify_manager_otp(payload: OTPVerifyRequest) -> dict[str, Any]:
    """Verifies the server-issued 6-digit OTP entered by the user."""
    key = payload.identifier.strip().lower()
    record = _OTP_STORE.get(key)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No OTP found for this address. Click 'Send Verification Code' first.",
        )
    code, expires = record
    if datetime.now(UTC).timestamp() > expires:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="OTP has expired. Request a new code.")
    if not hmac.compare_digest(code, payload.otp_code.strip()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect 6-digit passcode. Please check your Gmail/WhatsApp inbox and try again.",
        )
    del _OTP_STORE[key]
    return {"verified": True, "identifier": payload.identifier}


@router.post("/auth/send-welcome-charter")
def send_welcome_charter(payload: WelcomeCharterRequest) -> dict[str, Any]:
    """Automatically sends the Judge/Manager the customized Founder Collaboration & Contract Charter."""
    html_body = _build_welcome_charter_html(payload)
    wa_text = _build_welcome_charter_whatsapp(payload)

    if payload.channel == "gmail" or "@" in payload.identifier:
        sent_live, detail = _send_real_gmail(
            payload.identifier,
            f"Welcome to AegisBrain · Executed Governance Charter for {payload.company_name}",
            html_body,
        )
    else:
        sent_live, detail = _send_real_whatsapp(payload.identifier, wa_text)

    return {
        "status": "charter_dispatched",
        "sent_live": sent_live,
        "provider_detail": detail,
        "founder_name": FOUNDER_NAME,
        "founder_email": FOUNDER_EMAIL,
        "founder_phone": FOUNDER_PHONE,
        "whatsapp_text": wa_text,
    }


@router.post("/announce")
def ingest_and_notify_manager(
    payload: LiveAnnouncementRequest,
    session: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Stages a real PolicyRevision draft in Supabase and sends a Gmail/WhatsApp 1-click Approval Link."""
    compiled, plain_summary = _compile_announcement_to_rule(payload.announcement_text)
    revision = _stage_draft_in_supabase(
        session,
        tenant_id=settings.demo_tenant_id,
        compiled=compiled,
        source_channel=payload.source_channel,
        source_text=payload.announcement_text,
        authored_by=payload.manager_identifier,
    )

    sig = _sign_revision_token(revision.id, revision.policy_key)
    public_base = os.getenv("PUBLIC_GATEWAY_URL", "http://127.0.0.1:8000").rstrip("/")
    approval_url = f"{public_base}/v1/integrations/verify-link/{revision.id}?sig={sig}&by={payload.manager_identifier}"

    if payload.notify_via == "gmail" and "@" in payload.manager_identifier:
        html = f"""
        <div style="font-family:'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:28px;border:1px solid #d8e4fa;border-radius:24px;background:#f4f8ff;">
          <span style="background:#2b54f0;color:#fff;padding:4px 12px;border-radius:99px;font-size:11px;font-weight:bold;">POLICY CHANGE DETECTED</span>
          <h2 style="color:#0b1a33;margin-top:14px;">Approve new rule for your AI agents?</h2>
          <p style="color:#526585;font-size:14px;">Announcement grabbed from <strong>{payload.source_channel}</strong>:</p>
          <blockquote style="background:#fff;padding:14px;border-left:4px solid #2b54f0;border-radius:8px;color:#0b1a33;">"{payload.announcement_text}"</blockquote>
          <p style="color:#0b1a33;font-size:16px;font-weight:bold;">Compiled Rule: {plain_summary}</p>
          <a href="{approval_url}" style="display:inline-block;margin-top:14px;background:#2b54f0;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:99px;font-weight:bold;font-size:14px;">✓ Approve &amp; Sync to All AI Agents</a>
          <p style="font-size:12px;color:#64748b;margin-top:20px;">AegisBrain Gateway · {FOUNDER_NAME} ({FOUNDER_EMAIL})</p>
        </div>
        """
        external_sent, detail = _send_real_gmail(
            payload.manager_identifier,
            f"[Action Required] Approve Policy Change: {plain_summary}",
            html,
        )
    else:
        wa_body = (
            f"🛡️ *AegisBrain Policy Alert*\n\n"
            f"Detected in *{payload.source_channel}*:\n"
            f'"{payload.announcement_text}"\n\n'
            f"*Compiled Rule:* {plain_summary}\n\n"
            f"Tap below to approve & sync to all AI agents immediately:\n{approval_url}\n\n"
            f"— {FOUNDER_NAME} ({FOUNDER_PHONE})"
        )
        external_sent, detail = _send_real_whatsapp(payload.manager_identifier, wa_body)

    threshold_val = compiled["conditions"][0]["value"] if compiled.get("conditions") else 5

    return {
        "status": "staged_in_supabase",
        "revision_id": revision.id,
        "policy_key": revision.policy_key,
        "action": revision.action,
        "field": compiled["conditions"][0]["field"] if compiled.get("conditions") else "discount_pct",
        "threshold": threshold_val,
        "effect": revision.effect,
        "plain_summary": plain_summary,
        "approval_url": approval_url,
        "external_notification_sent": external_sent,
        "provider_detail": detail,
    }


@router.post("/approve/{revision_id}")
def approve_staged_revision_api(
    revision_id: int,
    session: Annotated[Session, Depends(get_db)],
    approver: Annotated[str, Query()] = "verified_manager",
) -> dict[str, Any]:
    revision = session.scalar(
        select(PolicyRevision).where(PolicyRevision.id == revision_id)
    )
    if revision is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy revision not found in Supabase.")
    if revision.status == "active":
        return {"status": "already_active", "policy_key": revision.policy_key, "version": revision.version}

    locked = _lock_revision_into_supabase(
        session,
        revision=revision,
        approver_identity=approver,
    )
    threshold_val = locked.conditions[0]["value"] if locked.conditions else 5
    field_name = locked.conditions[0]["field"] if locked.conditions else "discount_pct"

    return {
        "status": "locked_and_live",
        "policy_key": locked.policy_key,
        "version": locked.version,
        "action": locked.action,
        "field": field_name,
        "threshold": threshold_val,
        "effect": locked.effect,
        "summary": locked.summary,
        "reason": locked.reason,
    }


@router.get("/verify-link/{revision_id}", response_class=HTMLResponse)
def approve_via_email_or_whatsapp_link(
    revision_id: int,
    sig: Annotated[str, Query()],
    session: Annotated[Session, Depends(get_db)],
    by: Annotated[str, Query()] = "manager_link",
) -> HTMLResponse:
    revision = session.scalar(
        select(PolicyRevision).where(PolicyRevision.id == revision_id)
    )
    if revision is None:
        return HTMLResponse("<h3>Revision not found.</h3>", status_code=404)

    expected_sig = _sign_revision_token(revision.id, revision.policy_key)
    if not hmac.compare_digest(expected_sig, sig):
        return HTMLResponse("<h3>Invalid signature token.</h3>", status_code=403)

    if revision.status != "active":
        _lock_revision_into_supabase(session, revision=revision, approver_identity=by)

    html = f"""
    <!DOCTYPE html>
    <html>
      <head><title>Policy Approved · AegisBrain</title></head>
      <body style="font-family:'Segoe UI',sans-serif;background:#f2f6fd;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <div style="background:#fff;padding:40px;border-radius:28px;border:1px solid #d8e4fa;max-width:480px;text-align:center;box-shadow:0 24px 60px rgba(43,84,240,0.16);">
          <div style="width:56px;height:56px;border-radius:50%;background:#10b98120;color:#059669;display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;">✓</div>
          <h1 style="color:#0b1a33;font-size:24px;margin-top:16px;">Policy Locked &amp; Synced to All AI Agents</h1>
          <p style="color:#526585;font-size:15px;line-height:1.5;"><strong>{revision.summary}</strong> (v{revision.version}) is now live in Supabase PostgreSQL. Every connected AI agent is enforcing this rule in sub-millisecond time.</p>
          <p style="font-size:12px;color:#2b54f0;margin-top:20px;">AegisBrain · {FOUNDER_NAME} ({FOUNDER_EMAIL})</p>
        </div>
      </body>
    </html>
    """
    return HTMLResponse(content=html, status_code=200)