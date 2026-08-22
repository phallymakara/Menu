from __future__ import annotations

from uuid import UUID

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.business import Business
from app.models.payment import Payment

logger = structlog.get_logger("app.services.telegram_service")


async def _resolve_telegram_config(
    session: AsyncSession,
    business_id: UUID,
    branch_id: UUID,
) -> tuple[str | None, str | None, bool]:
    """Resolves Telegram Bot Token, Chat ID, and enabled status for a branch/business."""
    branch_res = await session.execute(select(Branch).where(Branch.id == branch_id))
    branch = branch_res.scalar_one_or_none()

    biz_res = await session.execute(select(Business).where(Business.id == business_id))
    biz = biz_res.scalar_one_or_none()

    token = None
    chat_id = None
    enabled = True

    if branch:
        token = branch.telegram_bot_token
        chat_id = branch.telegram_chat_id
        enabled = branch.telegram_notifications_enabled

    if not token and biz:
        token = biz.telegram_bot_token
        chat_id = biz.telegram_chat_id
        enabled = biz.telegram_notifications_enabled

    return token, chat_id, enabled


async def send_payment_telegram_notification(
    session: AsyncSession,
    payment: Payment,
    branch_name: str,
    table_identifier: str | None = None,
    cashier_name: str | None = None,
) -> bool:
    """
    Sends a real-time payment notification to the store's configured Telegram staff group/channel.
    Supports both Cash and KHQR transactions. Non-blocking error handling.
    """
    try:
        bot_token, chat_id, enabled = await _resolve_telegram_config(
            session=session,
            business_id=payment.business_id,
            branch_id=payment.branch_id,
        )

        if not enabled or not bot_token or not chat_id:
            logger.debug(
                "Telegram notification skipped (not configured or disabled)",
                payment_number=payment.payment_number,
            )
            return False

        method_display = "💵 CASH" if payment.payment_method == "cash" else "🇰🇭 KHQR (Bakong)"
        table_text = table_identifier if table_identifier else "Takeaway / Direct POS"
        discount_text = f"${payment.discount_usd:.2f}"
        if payment.discount_reason:
            discount_text += f" ({payment.discount_reason})"

        time_str = payment.settled_at.strftime("%Y-%m-%d %H:%M:%S")

        message_html = (
            f"🔔 <b>PAYMENT RECEIVED!</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n"
            f"🏪 <b>Branch:</b> {branch_name}\n"
            f"🍽️ <b>Table / Order:</b> {table_text}\n"
            f"📄 <b>Invoice:</b> <code>#{payment.payment_number}</code>\n"
            f"💰 <b>Amount (USD):</b> <b>${payment.grand_total_usd:.2f}</b>\n"
            f"💵 <b>Amount (KHR):</b> <b>{payment.grand_total_khr:,} KHR</b>\n"
            f"💳 <b>Method:</b> {method_display}\n"
            f"🎟️ <b>Discount:</b> {discount_text}\n"
            f"👤 <b>Cashier:</b> {cashier_name or 'Staff'}\n"
            f"🕒 <b>Time:</b> {time_str}\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n"
            f"✅ <i>Settled successfully.</i>"
        )

        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message_html,
            "parse_mode": "HTML",
        }

        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                logger.info(
                    "Telegram payment notification sent successfully",
                    payment_number=payment.payment_number,
                    chat_id=chat_id,
                )
                return True
            else:
                logger.warning(
                    "Telegram API responded with error",
                    status_code=resp.status_code,
                    body=resp.text,
                    payment_number=payment.payment_number,
                )
                return False

    except Exception as exc:
        logger.error(
            "Failed to dispatch Telegram payment notification",
            error=str(exc),
            payment_number=payment.payment_number,
        )
        return False
