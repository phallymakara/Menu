"""create khqr payment attempts and bakong payment evidence

Every dynamic KHQR is now recorded as a ``khqr_payment_attempts`` row holding the
amount, currency, full KHQR payload, its MD5 (the key Bakong's
``check_transaction_by_md5`` uses), the expiry, and the verification outcome. A
KHQR bill can only be settled from an attempt Bakong confirmed as paid, or by an
audited manual confirmation.

``payments`` gains the evidence for KHQR settlements: the Bakong transaction hash
(unique, so one Bakong transaction cannot settle two bills) and a manual
confirmation flag with its reason.

The attempt status is stored as VARCHAR (non-native enum), so no PostgreSQL
enum type is created or dropped.

Revision ID: 4d518f52e5ce
Revises: 3cfb7fbc9aad
Create Date: 2026-10-05 23:32:52.661869

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4d518f52e5ce"
down_revision: str | Sequence[str] | None = "3cfb7fbc9aad"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create khqr_payment_attempts and add KHQR evidence columns to payments."""
    op.add_column(
        "payments",
        sa.Column(
            "bakong_reference",
            sa.String(length=128),
            nullable=True,
            comment="Bakong transaction hash that confirmed this KHQR payment",
        ),
    )
    op.add_column(
        "payments",
        sa.Column(
            "is_manually_confirmed",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
            comment="True when a manager confirmed a KHQR payment without Bakong",
        ),
    )
    op.add_column(
        "payments",
        sa.Column("manual_confirmation_reason", sa.String(length=500), nullable=True),
    )
    op.create_unique_constraint(
        op.f("uq_payments_bakong_reference"), "payments", ["bakong_reference"]
    )

    op.create_table(
        "khqr_payment_attempts",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("table_session_id", sa.Uuid(), nullable=True),
        sa.Column("order_id", sa.Uuid(), nullable=True),
        sa.Column(
            "amount",
            sa.Numeric(precision=12, scale=2),
            nullable=False,
            comment="Amount encoded in the KHQR, in the attempt currency",
        ),
        sa.Column(
            "currency",
            sa.String(length=3),
            nullable=False,
            comment="ISO 4217 alpha code of the KHQR amount (USD or KHR)",
        ),
        sa.Column(
            "qr_payload",
            sa.Text(),
            nullable=False,
            comment="Full EMVCo KHQR string shown to the customer",
        ),
        sa.Column(
            "md5",
            sa.String(length=32),
            nullable=False,
            comment="Lowercase hex MD5 of the KHQR string, as Bakong indexes it",
        ),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "succeeded",
                "failed",
                "expired",
                "cancelled",
                name="khqr_payment_attempt_status",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "bakong_reference",
            sa.String(length=128),
            nullable=True,
            comment="Bakong transaction hash reported for this KHQR",
        ),
        sa.Column(
            "verified_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="When Bakong confirmed that the payment was received",
        ),
        sa.Column("failure_reason", sa.String(length=100), nullable=True),
        sa.Column(
            "payment_id",
            sa.Uuid(),
            nullable=True,
            comment="Payment created when this attempt settled the bill",
        ),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "table_session_id IS NULL OR order_id IS NULL",
            name=op.f("ck_khqr_payment_attempts_single_target"),
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_khqr_payment_attempts_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name=op.f("fk_khqr_payment_attempts_business_id_businesses"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["branch_id"],
            ["branches.id"],
            name=op.f("fk_khqr_payment_attempts_branch_id_branches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["table_session_id"],
            ["table_sessions.id"],
            name=op.f("fk_khqr_payment_attempts_table_session_id_table_sessions"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_khqr_payment_attempts_order_id_orders"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["payment_id"],
            ["payments.id"],
            name=op.f("fk_khqr_payment_attempts_payment_id_payments"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_khqr_payment_attempts_created_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_khqr_payment_attempts")),
        sa.UniqueConstraint("md5", name=op.f("uq_khqr_payment_attempts_md5")),
        sa.UniqueConstraint(
            "payment_id", name=op.f("uq_khqr_payment_attempts_payment_id")
        ),
    )
    for column in (
        "organization_id",
        "business_id",
        "branch_id",
        "table_session_id",
        "order_id",
        "status",
    ):
        op.create_index(
            op.f(f"ix_khqr_payment_attempts_{column}"),
            "khqr_payment_attempts",
            [column],
        )


def downgrade() -> None:
    """Drop khqr_payment_attempts and the KHQR evidence columns on payments."""
    op.drop_table("khqr_payment_attempts")

    op.drop_constraint(op.f("uq_payments_bakong_reference"), "payments", type_="unique")
    op.drop_column("payments", "manual_confirmation_reason")
    op.drop_column("payments", "is_manually_confirmed")
    op.drop_column("payments", "bakong_reference")
