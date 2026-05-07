"""
Gmail connector — fetches urgent unread emails for proactive state awareness.

This module provides a lightweight snapshot (subject + sender + snippet) of
recent urgent unread emails. The result is injected into _live_state so the
polling agent can proactively alert the driver.

For full Gmail operations (search + send), see sally/tools.py (gmail_search, gmail_send).

Auth requirements:
    The Google OAuth2 refresh token must include the gmail.readonly scope.
    Use GMAIL_REFRESH_TOKEN if you have a separate token for Gmail, otherwise
    GOOGLE_REFRESH_TOKEN is used (must have been authorized with Gmail scope).
"""

import asyncio
import logging
import os

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

_TOKEN_URI    = "https://oauth2.googleapis.com/token"
_GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

# Searches for unread emails from the last 2 hours that look urgent.
_URGENT_QUERY = (
    "is:unread newer_than:2h "
    "(subject:urgent OR subject:urgente OR subject:importante OR subject:asap OR subject:crítico)"
)


def _get_credentials() -> Credentials:
    client_id     = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    refresh_token = os.getenv("GMAIL_REFRESH_TOKEN") or os.getenv("GOOGLE_REFRESH_TOKEN", "")
    if not all([client_id, client_secret, refresh_token]):
        raise NotImplementedError(
            "Gmail no configurado — establece GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET "
            "y GMAIL_REFRESH_TOKEN (con scope gmail.readonly)."
        )
    return Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=_TOKEN_URI,
        client_id=client_id,
        client_secret=client_secret,
        scopes=_GMAIL_SCOPES,
    )


def _fetch_snapshot() -> dict:
    service = build("gmail", "v1", credentials=_get_credentials(), cache_discovery=False)

    result   = service.users().messages().list(
        userId="me", q=_URGENT_QUERY, maxResults=3
    ).execute()
    messages = result.get("messages", [])

    urgent = []
    for msg in messages:
        detail = service.users().messages().get(
            userId="me",
            id=msg["id"],
            format="metadata",
            metadataHeaders=["Subject", "From"],
        ).execute()
        hdrs = {h["name"]: h["value"] for h in detail["payload"]["headers"]}
        urgent.append({
            "from":    hdrs.get("From",    "?"),
            "subject": hdrs.get("Subject", "?"),
            "snippet": detail.get("snippet", "")[:100],
        })

    return {"urgentEmails": urgent}


async def get_gmail_snapshot() -> dict:
    """Returns {"urgentEmails": [...]} for injection into the proactive state snapshot.

    Each entry: {"from": str, "subject": str, "snippet": str}.
    Empty list means no urgent unread emails in the last 2 hours.
    """
    return await asyncio.to_thread(_fetch_snapshot)
