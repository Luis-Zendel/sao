"""
Telegram notification service.
Sends operational alert messages to a configured Telegram chat.
"""

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def get_bot_config() -> tuple[str | None, str | None]:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    return token, chat_id


async def send_message(
    text: str,
    parse_mode: str = "HTML",
    chat_id_override: str | None = None,
) -> dict[str, Any]:
    """Send a message to the configured Telegram chat (or chat_id_override)."""
    token, configured_chat_id = get_bot_config()

    chat_id = chat_id_override or configured_chat_id

    if not token or not chat_id:
        logger.warning("Telegram not configured (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing)")
        return {"ok": False, "error": "Telegram not configured", "simulated": True}

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload)
            result = resp.json()

        if result.get("ok"):
            logger.info(f"Telegram message sent: message_id={result['result']['message_id']}")
        else:
            logger.error(f"Telegram API error: {result}")

        return result

    except Exception as e:
        logger.error(f"Failed to send Telegram message: {e}")
        return {"ok": False, "error": str(e)}


async def detect_chat_id(token: str | None = None) -> dict[str, Any]:
    """
    Robustly detect available chat IDs for a bot token.

    Steps:
    1. Validate token via getMe (also gets the bot @username).
    2. Delete any existing webhook so getUpdates polling works.
    3. Call getUpdates with a large limit to catch all pending messages.
    4. Return chats found + bot info so the user can open the chat directly.
    """
    t = token or os.getenv("TELEGRAM_BOT_TOKEN")
    if not t:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not set"}

    base = f"https://api.telegram.org/bot{t}"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # 1. Validate token and get bot username
            me_resp = await client.get(f"{base}/getMe")
            me = me_resp.json()
            if not me.get("ok"):
                return {
                    "ok": False,
                    "error": f"Token inválido — {me.get('description', 'error desconocido')}",
                }
            bot_username = me["result"].get("username", "")
            bot_name     = me["result"].get("first_name", "Bot")

            # 2. Delete webhook so getUpdates works (no-op if no webhook was set)
            await client.post(f"{base}/deleteWebhook", json={"drop_pending_updates": False})

            # 3. Fetch up to 100 recent updates
            updates_resp = await client.get(
                f"{base}/getUpdates",
                params={"limit": 100, "timeout": 0, "allowed_updates": ["message", "channel_post"]},
            )
            data = updates_resp.json()

        if not data.get("ok"):
            return {"ok": False, "error": data.get("description", "Error al obtener updates")}

        chats: list[dict] = []
        seen: set[int] = set()

        for update in data.get("result", []):
            for key in ("message", "channel_post", "edited_message"):
                msg = update.get(key)
                if not msg:
                    continue
                chat = msg.get("chat", {})
                cid  = chat.get("id")
                if cid and cid not in seen:
                    seen.add(cid)
                    chats.append({
                        "chat_id":  cid,
                        "type":     chat.get("type", "private"),
                        "title":    (
                            chat.get("title")
                            or chat.get("first_name")
                            or chat.get("username")
                            or f"Chat {cid}"
                        ),
                        "username": chat.get("username"),
                    })

        return {
            "ok":           True,
            "chats":        chats,
            "total":        len(chats),
            "bot_username": bot_username,
            "bot_name":     bot_name,
            "bot_url":      f"https://t.me/{bot_username}" if bot_username else None,
        }

    except Exception as e:
        return {"ok": False, "error": str(e)}


async def test_connection() -> dict[str, Any]:
    """Test bot connectivity and return bot info."""
    token, chat_id = get_bot_config()

    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not set"}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"https://api.telegram.org/bot{token}/getMe")
            bot_info = resp.json()

        if bot_info.get("ok"):
            return {
                "ok": True,
                "bot_name": bot_info["result"]["first_name"],
                "bot_username": bot_info["result"]["username"],
                "chat_id_configured": chat_id is not None,
            }
        return {"ok": False, "error": bot_info.get("description", "Unknown error")}
    except Exception as e:
        return {"ok": False, "error": str(e)}
