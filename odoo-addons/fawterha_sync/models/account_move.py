import logging
import requests
from odoo import models

_logger = logging.getLogger(__name__)

# Odoo and the Fawterha backend run on the same droplet, so localhost is enough.
FAWTERHA_API_URL = "http://localhost:3000/external/invoices"
FAWTERHA_API_KEY = "fawterha_external_xy7p2k9q3rj8t4nv6m1a5wzcb0eharagft"


class AccountMove(models.Model):
    _inherit = "account.move"

    def action_post(self):
        """Override Odoo's invoice-posting flow to also push to Fawterha."""
        result = super().action_post()
        # Best-effort — never let a Fawterha sync failure block invoice posting in Odoo
        try:
            self._send_to_fawterha()
        except Exception as exc:
            _logger.exception("Fawterha sync hook failed: %s", exc)
        return result

    def _send_to_fawterha(self):
        """Send each posted customer invoice to the Fawterha backend."""
        for record in self:
            if record.state != "posted":
                continue
            if record.move_type not in ("out_invoice", "out_refund"):
                continue  # Skip vendor bills, only send customer invoices

            items = []
            for line in record.invoice_line_ids:
                if line.display_type:
                    continue  # Skip note/section lines
                items.append({
                    "name": line.name or "",
                    "quantity": float(line.quantity or 1),
                    "price_before_vat": float(line.price_subtotal or 0),
                    "vat_amount": float((line.price_total or 0) - (line.price_subtotal or 0)),
                    "price_with_vat": float(line.price_total or 0),
                })

            payload = {
                "external_invoice_id": f"ODOO-{record.id}",
                "partner_email": record.partner_id.email or "",
                "invoice_number": record.name or f"INV-{record.id}",
                "title": record.name or "Odoo Invoice",
                "merchant_name": record.company_id.name or "",
                "merchant_vat": record.company_id.vat or "",
                "issued_at": record.invoice_date.isoformat() + "T00:00:00Z" if record.invoice_date else None,
                "subtotal": float(record.amount_untaxed or 0),
                "vat_amount": float(record.amount_tax or 0),
                "total_price": float(record.amount_total or 0),
                "currency": record.currency_id.name,
                "payment_method": "card",
                "items": items,
            }

            try:
                response = requests.post(
                    FAWTERHA_API_URL,
                    json=payload,
                    headers={"X-API-Key": FAWTERHA_API_KEY},
                    timeout=10,
                )
                record.message_post(
                    body=f"Fawterha sync: {response.status_code} — {response.text[:300]}"
                )
                _logger.info("Fawterha sync %s: HTTP %s", record.name, response.status_code)
            except Exception as exc:
                record.message_post(body=f"Fawterha sync failed: {exc}")
                _logger.exception("Fawterha sync failed for %s", record.name)
