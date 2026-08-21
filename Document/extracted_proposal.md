អ៊ី​​ មីនុយ - E Menu

Project Type

Multi-tenant Software as a Service (SaaS)

Initial Market

Restaurants, cafés, drink shops, bakeries, and small food businesses

Expansion Market

shops, and multi-branch businesses

Primary Language

Khmer and English Support

Proposal Date

2 August 2026

Product Vision

Provide Cambodian restaurants and stores with an affordable, bilingual, cloud-based operating platform for ordering, sales, payments, staff, branches, reporting, and customer service — without requiring each customer to install or maintain its own server.

Table of Contents

Executive Summary

Background and Opportunity

Project Vision and Objectives

Target Market and Users

Proposed SaaS Product

Scope and Feature Catalogue

User Roles and Permissions

Core Business Workflows

Multi-tenant SaaS Architecture

Data, Security, and Privacy

Payments and KHQR

Technical Architecture and Technology Stack

Non-functional Requirements

Implementation Roadmap

Business and Subscription Model

Risks and Mitigation

Success Metrics and Acceptance Criteria

Deliverables

Assumptions and Exclusions

Conclusion and References

1. Executive Summary

This project is design and implement of a multi-tenant, SaaS platform for Cambodian restaurants, cafés and Store. The platform will allow many independent businesses to use one secure cloud system while keeping each tenant’s data, users, branches, orders, payments, products, and reports isolated.

2. Background and Opportunity

Many Cambodian restaurants and small shops still combine paper orders, static QR codes, messaging applications, spreadsheets, handwritten stock records, and separate delivery platforms. This creates duplicated work, ordering mistakes, slow payment confirmation, and limited business reporting.

The platform addresses these problems through a unified operating system delivered as a subscription service. Restaurants and stores do not need to purchase and maintain their own application infrastructure. They register, select a subscription, configure their business, add staff, and begin using the service through web and mobile-friendly interfaces.

A direct-ordering channel helps restaurants control their menu, customer experience, order history, and operational data.

A modular SaaS foundation allows the same platform to support restaurants and Store.

3. Project Vision and Objectives

3.1 Vision

To become an accessible digital operating platform for Cambodian food and store in Cambodia helping owners manage daily operations, accept digital and case payments, understand performance, and grow across branches.

3.2 Business Objectives

Provide a subscription-based product that can serve many restaurants and shops from one cloud platform.

Reduce ordering errors and service delays through connected customer, cashier, and kitchen workflows.

Support Cambodian payment behavior with cash, KHR, USD, and KHQR-compatible payment processes.

Enable business owners to monitor sales, orders, staff activity, branches, and operational performance.

Create reusable SaaS capabilities for tenant onboarding, subscriptions, permissions, billing, feature limits, and support.

3.3 Product Objectives

Deliver a responsive Khmer and English web experience.

Allow customer ordering without mandatory application installation or account registration.

Keep tenant data isolated and secure.

Support reliable real-time operational updates.

Provide configurable features and limits by subscription plan.

Maintain auditable records for orders, payments, refunds, staff actions, and subscription changes.

4. Target Market and Users

4.1 Initial Target Businesses

Target Segment

Examples

Restaurants

Khmer food, casual dining, barbecue, hotpot, hotel restaurants

Cafés

Coffee shops, tea shops, modern cafés

Drink Shops

Bubble tea, juice, dessert and beverage businesses

Bakeries

Bakery, pastry and pickup-order businesses

Food Stalls

Small structured food businesses needing simple POS and ordering

4.2 User Personas

Platform Administrator: Operates the SaaS, plans, tenants, subscriptions, support, and platform settings.

Business Owner: Controls branches, staff, products, menus, reports, payments, and subscription.

Branch Manager: Runs assigned branches and monitors local performance.

Cashier: Creates orders, receives payments, issues receipts, and handles approved cancellations.

Waiter: Manages tables, submits orders, serves customers, and responds to service requests.

Kitchen Staff: Receives preparation tickets, starts work, and marks items ready.

Inventory Staff: Maintains products, stock movement, purchasing, and supplier records.

Customer: Scans QR, browses menu, submits orders, pays, and tracks status.

5. SaaS Product

The platform will operate as one multi-tenant application. Each subscribing business receives an isolated organization workspace containing its own branches, users, settings, payment configuration, operational modules, subscription, and business data.

5.1 Product Modules

SaaS Platform Administration

Tenant and Business Onboarding

Subscription, Billing, and Entitlements

Identity, Staff, Roles, and Permissions

Restaurant and Branch Management

Menu and Catalogue Management

Table and QR Management

Customer Ordering

Order and Point-of-Sale Operations

Kitchen Display and Preparation Workflow

Payments, KHQR, Receipts, and Reconciliation

Customer, Promotion, and Feedback Management

Reporting and Analytics

Notifications and Support

Retail POS and Inventory Expansion Module

6. Scope and Complete Feature Catalogue

The following tables define the proposed feature groups, major features, sub-features, and recommended implementation phase. “MVP” means required for the first commercial restaurant release. “Phase 2” and “Later” represent controlled expansion after core stability.

Feature Group

Feature

Sub-features / Requirements

Phase

SaaS Administration

Tenant management

Create, view, activate, suspend, reactivate, and close tenant accounts; tenant status history; internal notes; search and filtering.

MVP

SaaS Administration

Platform dashboard

Active tenants, trial tenants, subscription status, branch count, order volume, failed payments, support workload, and service health indicators.

MVP

SaaS Administration

Plan management

Create plans; monthly/annual period; pricing; plan visibility; plan status; feature matrix; branch, user, storage, and usage limits.

MVP

SaaS Administration

Feature flags

Enable features globally, per plan, per tenant, or for pilot customers; staged rollout; emergency disable.

MVP

SaaS Administration

Tenant support tools

Tenant lookup, account status, configuration overview, audit history, safe troubleshooting, and restricted support impersonation with logging.

Phase 2

SaaS Administration

Announcements

Create maintenance notices, product announcements, targeted tenant messages, and effective dates.

Phase 2

Onboarding

Owner registration

Email or phone registration, verification, password setup, consent, and account recovery.

MVP

Onboarding

Business creation

Business Khmer/English name, type, logo, contact information, address, and industry selection.

MVP

Onboarding

First branch setup

Branch name, location, phone, time zone, operating hours, default language, currency, and receipt settings.

MVP

Onboarding

Guided setup checklist

Add menu, configure tables, add staff, configure payment, test order, generate QR, and launch readiness status.

MVP

Onboarding

Data import

CSV import for menu items, products, categories, prices, and initial stock; validation and error report.

Phase 2

Subscriptions

Free trial

Configurable trial length, start/end date, trial reminders, trial feature access, and conversion to paid plan.

MVP

Subscriptions

Subscription lifecycle

Trialing, active, past due, grace period, suspended, cancelled, and expired states.

MVP

Subscriptions

Plan selection and upgrade

Compare plans, select plan, upgrade, downgrade, renewal date, prorating policy, and effective-date handling.

MVP

Subscriptions

Entitlements

Feature permissions and numerical limits for branches, staff, orders, storage, integrations, and reports.

MVP

Subscriptions

Invoice records

Invoice number, billing period, line items, status, amount, currency, payment reference, and downloadable receipt.

MVP

Subscriptions

Manual billing support

Record bank transfer or offline payment, platform approval, payment evidence, renewal, and internal audit trail.

MVP

Subscriptions

Automated billing integration

Payment provider integration, recurring billing, webhook processing, retry rules, and payment-failure handling.

Later

Identity & Access

Authentication

Secure login, logout, session expiry, refresh, password reset, and optional OTP/passwordless login.

MVP

Identity & Access

Organization memberships

A user may belong to one or more organizations with explicit membership and status.

MVP

Identity & Access

Role-based permissions

Owner, manager, cashier, waiter, kitchen, inventory, menu editor, report viewer, and custom permissions.

MVP

Identity & Access

Branch assignments

Restrict staff to selected branches and allow temporary or multi-branch assignment.

MVP

Identity & Access

Staff invitations

Invite by phone/email, expiration, resend, revoke, accept, and onboarding instructions.

MVP

Identity & Access

Staff status

Active, invited, suspended, terminated, and archived; prevent access while preserving historical activity.

MVP

Identity & Access

Audit logging

Track login, permission, staff, order, payment, menu, subscription, refund, and support actions.

MVP

Business Management

Business profile

Khmer/English name, logo, description, contacts, legal/trading details, social links, and public page settings.

MVP

Business Management

Branch management

Create, edit, archive branches; branch contact details, address, map coordinates, and operational settings.

MVP

Business Management

Operating hours

Regular hours, split shifts, holidays, temporary closure, and special opening hours.

MVP

Business Management

Currency settings

Base currency, accepted currencies, KHR/USD display, exchange rate, rounding policy, and historical rate snapshots.

MVP

Business Management

Tax and service charge

Configurable tax, service charge, inclusive/exclusive pricing, rounding, and branch-level overrides.

MVP

Business Management

Receipt settings

Business identity, branch, footer, language, logo, payment method, and receipt numbering.

MVP

Menu Management

Menus

Create multiple menus; dine-in, takeaway, delivery, breakfast, lunch, seasonal, and branch-specific menus.

MVP

Menu Management

Categories

Khmer/English category names, display order, image, availability, and parent-child categories.

MVP

Menu Management

Menu items

Khmer/English names and descriptions, image, SKU, base price, preparation time, tax class, and display order.

MVP

Menu Management

Availability

Available, sold out, hidden, scheduled availability, branch availability, and temporary disable.

MVP

Menu Management

Modifier groups

Required/optional, single/multiple selection, minimum/maximum selections, display order, and group-level rules.

MVP

Menu Management

Modifier options

Option name, Khmer/English label, additional price, availability, and default selection.

MVP

Menu Management

Dietary and allergen information

Vegetarian, vegan, halal indicator, spicy level, allergens, ingredient notes, and restaurant disclaimer.

Phase 2

Menu Management

Menu scheduling

Effective date, day/time windows, event menu, seasonal menu, and automatic activation.

Phase 2

Menu Management

Bulk management

Bulk price update, bulk availability, duplicate menu, copy between branches, and import/export.

Phase 2

Table & QR

Restaurant areas

Ground floor, first floor, outdoor, VIP, counter, and custom area ordering.

MVP

Table & QR

Table management

Table code, display name, capacity, area, status, active flag, and merge/split support.

MVP

Table & QR

QR generation

Unique secure QR per table, downloadable print format, regeneration, versioning, and deactivation.

MVP

Table & QR

Dining sessions

Open session, assign table, guest count, session token, ordering rounds, bill state, and close session.

MVP

Table & QR

Table status

Available, seated, ordering, preparing, serving, bill requested, payment pending, cleaning, and reserved.

MVP

Table & QR

Table transfer

Move an open session and active orders to another table with audit history.

Phase 2

Table & QR

Table merge

Combine bills or tables for groups while preserving order ownership and payment history.

Phase 2

Customer Ordering

Public menu access

Open through restaurant link or table QR without mandatory login or application installation.

MVP

Customer Ordering

Language selection

Khmer-first interface with English option; remember customer choice on the device.

MVP

Customer Ordering

Browse and search

Categories, popular items, search, filters, unavailable item handling, and item details.

MVP

Customer Ordering

Item configuration

Select modifiers, quantities, special notes, validation, and computed price.

MVP

Customer Ordering

Cart

Add, edit, remove, quantity update, subtotal, discount, tax, service charge, and final total.

MVP

Customer Ordering

Order submission

Idempotent submission, active-session validation, acknowledgement, and restaurant acceptance policy.

MVP

Customer Ordering

Order tracking

Received, accepted, preparing, ready, served/picked up, completed, rejected, or cancelled.

MVP

Customer Ordering

Additional order rounds

Add more items to the same dining session while maintaining one combined bill.

MVP

Customer Ordering

Service requests

Call staff, request water, request cleaning, request bill, and optional custom requests.

MVP

Customer Ordering

Guest information

Optional customer name and phone for pickup/delivery; consent and privacy notice.

MVP

Customer Ordering

Takeaway ordering

Pickup time, order notes, customer contact, prepayment/pay-at-pickup, and status tracking.

Phase 2

Customer Ordering

Direct delivery

Delivery address, zone validation, fee calculation, own-driver assignment, and delivery status.

Later

Order & POS

Order dashboard

Real-time list, filters, branch/table/order type, status, age, amount, payment state, and source.

MVP

Order & POS

Staff-created order

Create dine-in or takeaway orders for customers who do not order through QR.

MVP

Order & POS

Order acceptance

Manual or automatic acceptance rule, reject reason, notification, and audit entry.

MVP

Order & POS

Order editing

Add permitted items, change quantities before preparation, notes, controlled cancellation, and reason capture.

MVP

Order & POS

Order status workflow

Received, accepted, preparing, ready, served, completed, cancelled, and rejected transitions.

MVP

Order & POS

Discounts

Authorized item/order discount, percentage/fixed amount, reason, approval threshold, and audit history.

Phase 2

Order & POS

Split bill

Split by item, person, percentage, or amount; multiple payment records and remaining balance.

Phase 2

Order & POS

Receipt printing

Browser/thermal receipt output, print retry, duplicate marking, and receipt history.

MVP

Order & POS

Offline resilience

Cache active screen, connection status, safe retry, idempotency, and no false success confirmation.

Phase 2

Kitchen

Kitchen display

Large readable ticket cards, branch/station filters, real-time update, and sound/visual alert.

MVP

Kitchen

Preparation stations

Kitchen, coffee bar, drink bar, dessert, barbecue, or custom stations.

MVP

Kitchen

Ticket routing

Route each ordered item to the correct station and group by order/table.

MVP

Kitchen

Preparation actions

Accept/start, pause where allowed, mark item ready, mark ticket ready, and return to preparing.

MVP

Kitchen

Ticket detail

Order/table number, elapsed time, item quantity, modifiers, notes, order type, and priority.

MVP

Kitchen

Ready notification

Notify cashier/waiter when item or full order is ready.

MVP

Kitchen

Performance timing

Received-to-start, preparation duration, ready-to-served, delayed ticket indicator, and averages.

Phase 2

Payments

Cash payment

Record amount tendered, currency, exchange rate, change, cashier, time, and receipt.

MVP

Payments

KHQR configuration

Tenant-specific merchant/payment account configuration and encrypted provider credentials.

MVP

Payments

Dynamic KHQR attempt

Create order-specific amount and currency, payment attempt, QR payload/image, reference, and expiry.

MVP

Payments

Payment status checking

Pending, succeeded, failed, expired, cancelled; automatic and manual refresh with safe retry.

MVP

Payments

Payment verification

Match amount, currency, order, reference/MD5 or provider transaction identifier before confirming.

MVP

Payments

Payment history

Attempts, successful transactions, failures, expiry, manual overrides, and staff identity.

MVP

Payments

Partial and split payment

Multiple payment methods and partial amounts against one bill.

Phase 2

Payments

Refunds

Full/partial refund request, approval, reason, provider response, balance, and audit history.

Phase 2

Payments

Reconciliation

Compare orders, payment records, provider/bank records, unresolved differences, and daily close.

Phase 2

Payments

Receipt and proof

Digital receipt, printable receipt, payment reference, QR result, and customer access token.

MVP

Customers & Loyalty

Customer directory

Optional profile, name, phone, email, preferred language, consent, visits, and order history.

Phase 2

Customers & Loyalty

Feedback

Rating, comments, service category, order link, branch, response, and issue status.

Phase 2

Customers & Loyalty

Promotions

Date range, branch/menu/item scope, percentage/fixed/bundle rules, usage limits, and activation.

Phase 2

Customers & Loyalty

Coupons

Code, validity, minimum order, customer restriction, usage limit, and redemption audit.

Later

Customers & Loyalty

Loyalty points

Earning, redemption, balance, expiry, tier, reward catalogue, and adjustment log.

Later

Reporting

Sales summary

Gross sales, net sales, discounts, tax, service charge, refunds, and order count.

MVP

Reporting

Payment report

Cash, KHQR, other methods, currency, success/failure, and cashier reconciliation.

MVP

Reporting

Order report

Order type, source, status, cancellations, average value, and peak periods.

MVP

Reporting

Product/menu report

Best sellers, low sellers, category contribution, quantity, and item revenue.

MVP

Reporting

Branch comparison

Sales, order count, average order value, preparation time, and payment mix by branch.

Phase 2

Reporting

Staff activity

Orders created, payments confirmed, discounts, cancellations, refunds, and shifts where integrated.

Phase 2

Reporting

Operational performance

Acceptance time, preparation time, delayed orders, table turnover, and service request response.

Phase 2

Reporting

Export

CSV and PDF export with tenant, branch, date range, and user permission checks.

Phase 2

Notifications

Real-time operational events

New order, accepted order, kitchen ready, payment success, payment failure, and service request.

MVP

Notifications

Owner alerts

Trial expiry, subscription payment, branch issue, failed integration, low stock, and daily summary.

Phase 2

Notifications

Channels

In-app first; later email, Telegram, SMS, or push notifications based on configuration.

Phase 2

Support

Help center

Getting started, menu setup, QR printing, payment troubleshooting, staff roles, and FAQs.

Phase 2

Support

Support tickets

Create ticket, category, priority, status, attachments, comments, assignment, and resolution.

Phase 2

Retail Expansion

Retail catalogue

Products, variants, categories, brands, barcode, SKU, images, cost, price, and tax.

Later

Retail Expansion

Retail POS

Barcode scan, cart, discounts, cash/KHQR, receipt, returns, and suspended sale.

Later

Retail Expansion

Inventory

Stock by branch, stock movement, adjustment, transfer, damaged stock, and stocktake.

Later

Retail Expansion

Purchasing

Suppliers, purchase order, goods receiving, purchase cost, and payable tracking.

Later

Retail Expansion

Customer credit

Credit account, balance, transaction ledger, due date, partial payment, and reminder.

Later

Retail Expansion

Inventory alerts

Reorder level, low stock, out of stock, expiring stock, and owner notification.

Later

AI Expansion

AI customer assistant

Answer menu/product questions using verified business data; tool-based stock, price, order, and escalation.

Later

AI Expansion

AI owner assistant

Daily summary, trend explanation, slow items, unusual cancellation/payment patterns, and recommendations.

Later

AI Expansion

AI content assistant

Khmer/English description drafting, translation assistance, promotion copy, and human approval.

Later

7. User Roles and Permissions

Role

Main Responsibilities

Platform Administrator

Manage tenants, plans, subscriptions, platform configuration, support, and analytics.

Platform Support

View permitted tenant configuration and provide logged troubleshooting without unrestricted data access.

Business Owner

Full organization access including branches, users, menus/products, reports, payments, and subscription.

Branch Manager

Manage assigned branch operations, staff, menu availability, orders, and local reports.

Cashier

Create orders, receive authorized payments, issue receipts, and perform allowed corrections.

Waiter

Open tables, create and update orders, respond to service requests, and mark service completion.

Kitchen Staff

View assigned kitchen tickets and update preparation status.

Menu Editor

Manage menus, categories, items, prices, modifiers, and availability without payment access.

Inventory Staff

Manage stock, purchasing, suppliers, and inventory reports in the retail module.

Report Viewer

Read-only access to permitted reports and exports.

8. Core Business Workflows

8.1 Tenant Onboarding Workflow

Owner registers and verifies account.

Owner creates organization and business profile.

Owner creates the first branch and operating settings.

Owner selects a trial or subscription plan.

Owner adds menu items, tables, staff, and payment configuration.

Owner performs a test order and launches the branch.

8.2 Dine-in QR Ordering Workflow

Staff opens a dining session for the table.

Customer scans the secure table QR.

Customer browses the Khmer/English menu and selects modifiers.

Customer submits an order to the active dining session.

Restaurant accepts the order and routes items to preparation stations.

Kitchen prepares and marks items ready.

Staff serves the order; customer may add more items.

Customer requests the bill and pays by cash or KHQR.

Payment is verified, receipt is issued, and the dining session is closed.

8.3 Subscription Workflow

Tenant begins trial or active subscription.

Entitlements and limits are applied.

Renewal reminders are sent before the billing date.

Payment is recorded or provider confirmation is received.

Failed payment moves the subscription through past-due and grace-period rules.

Suspension restricts new operational actions without immediately deleting data.

Reactivation restores access after successful payment or administrator approval.

9. Multi-tenant SaaS Architecture

The model is a shared application and shared PostgreSQL database with tenant-owned tables containing organization_id. Application-level tenant guards and PostgreSQL Row-Level Security should be used together. This model is cost-effective for an MVP while preserving a path toward dedicated databases for enterprise tenants.

9.1 Tenant Hierarchy

Tenant Structure

Platform → Organization/Tenant → Business → Branch → Staff, Menu/Products, Tables, Orders, Payments, Reports, and Settings

9.2 Tenant Isolation Rules

Every tenant-owned row includes organization_id.

Most operational rows also include branch_id.

Tenant context is derived from the authenticated membership, public business slug, custom domain, or secure session token.

The API must never trust an arbitrary organization_id supplied by the client.

Object-storage paths and access policies must also be tenant-scoped.

Automated tests must prove that Tenant A cannot read or modify Tenant B data.

9.3 Deployment Strategy

Modular monolith backend for the first production version.

Separate customer, business operations, kitchen, and platform administration frontends or route groups.

PostgreSQL as the authoritative source of truth.

Redis for cache, rate limiting, real-time fan-out, and background-job coordination.

Object storage for menu images, logos, receipts, exports, and attachments.

Background worker for notifications, reports, reconciliation, imports, and integration retries.

10. Data, Security, and Privacy

Role- and permission-based authorization

Tenant and branch isolation

PostgreSQL Row-Level Security

Strong password hashing and secure sessions

Encrypted payment and integration credentials

HTTPS for all production traffic

Rate limiting and abuse prevention

Input validation and safe file-upload rules

Audit logs for sensitive actions

Idempotency for order and payment commands

Backup, restore, and disaster-recovery testing

Secure support access and impersonation controls

Data retention, export, and deletion procedures

Monitoring, error tracking, and incident response

The product should display clear business identity, prices, charges, payment state, refund/cancellation information, privacy notice, and complaint/support channels. Final production practices should be reviewed against applicable Cambodian consumer-protection, e-commerce, tax, payment, and data obligations.

11. Payments and KHQR

Each restaurant or shop should normally receive customer payments into its own merchant or bank account. The SaaS platform should store tenant-specific configuration securely and record payment confirmation against the correct order. A syntactically valid KHQR payload alone is not equivalent to full production merchant onboarding or settlement integration.

11.1 Payment Requirements

Cash payments in KHR or USD

Dynamic order-specific KHQR payment attempt

Secure server-side credential use

Pending, succeeded, failed, expired, cancelled, and refunded states

Amount, currency, order, and transaction-reference verification

Duplicate-confirmation prevention

Manual override only with permission and audit trail

Daily payment reconciliation

Historical exchange-rate snapshot on each order/payment

12. Technical Architecture and Technology Stack

Layer

Recommendation

Frontend

React + TypeScript + Vite; Tailwind CSS; TanStack Query; React Router; i18n; PWA capabilities

Backend

Python; FastAPI; Pydantic; SQLAlchemy 2; Alembic; REST API; WebSocket or Server-Sent Events

Database

PostgreSQL with tenant keys, indexes, constraints, Row-Level Security, backups, and monitoring

Cache & Jobs

Redis and a background-worker mechanism

Storage

S3-compatible or Azure Blob object storage

Payments

Tenant-specific KHQR/bank/payment-provider integrations

Observability

Structured logs, metrics, tracing, uptime monitoring, and error tracking

Deployment

Containerized services, managed database, CI/CD, separate dev/staging/production environments

13. Non-functional Requirements

Quality Area

Requirement

Availability

Operational service target should be defined for paid plans; planned maintenance must be communicated.

Performance

Public menu should load quickly on common Cambodian mobile networks; critical API operations should have measured latency targets.

Scalability

Scale application instances horizontally without losing tenant context or real-time events.

Reliability

Orders and payments use database transactions, idempotency, retry rules, and durable event/outbox patterns.

Localization

Khmer and English content, Unicode normalization, Khmer font testing, receipt testing, and understandable error messages.

Accessibility

Readable contrast, scalable text, keyboard support for admin screens, proper labels, and table headers.

Compatibility

Responsive support for current mobile browsers, tablets, desktops, kitchen displays, and common receipt-printer workflows.

Maintainability

Modular architecture, automated tests, migrations, typed interfaces, code quality checks, and documented APIs.

Security

Tenant isolation, least privilege, encryption, auditability, secure secrets, and vulnerability management.

Data Quality

Constraints, validation, immutable price snapshots, historical exchange rates, and reconciliation controls.

14. Implementation Roadmap

Phase

Scope

Phase 0 – Discovery and UX

Validate target businesses; map restaurant workflows; define product naming, plans, legal/payment assumptions, and UI prototypes.

Phase 1 – SaaS Foundation

Tenant model, authentication, organization membership, roles, subscriptions, entitlements, business and branch setup, audit logging.

Phase 2 – Restaurant Catalogue

Menus, categories, items, modifiers, images, availability, business hours, currencies, taxes, and service charges.

Phase 3 – Table and Ordering

Areas, tables, secure QR, dining sessions, customer PWA, cart, order submission, staff order dashboard, real-time updates.

Phase 4 – Kitchen and Receipts

Preparation stations, kitchen tickets, status workflow, ready notifications, cashier workflow, cash payment, receipt output.

Phase 5 – KHQR and Production Hardening

Merchant configuration, dynamic payment attempts, verification, reconciliation foundation, security testing, monitoring, backup/restore.

Phase 6 – Commercial Release

Tenant admin, trial conversion, support process, onboarding materials, usage analytics, customer pilots, pricing validation.

Phase 7 – Expansion

Promotions, customer profiles, advanced reports, loyalty, takeaway/direct delivery, then retail POS and inventory.

15. Business and Subscription Model

Plan

Target

Indicative Features

Starter

Small café or food stall

1 branch; limited staff; menu/POS; cash and payment recording; basic reports

Standard

Restaurant or café

QR ordering; kitchen display; more staff; KHQR integration; branch reports

Growth

Growing multi-branch business

Multiple branches; centralized menu; advanced reports; promotions; priority support

Enterprise

Chains, hotels, or special customers

Custom limits; integrations; custom domain; SLA; onboarding; optional dedicated database

15.1 Optional Revenue Streams

Initial business setup and menu import

QR stand and receipt template design

Hardware installation and printer support

Staff training and on-site onboarding

Custom domain

Premium reports

Payment integration support

Custom integrations

Priority support and service-level agreement

AI assistant add-on after core data becomes reliable

16. Risks and Mitigation

Risk

Mitigation

Tenant data exposure

Use mandatory tenant context, Row-Level Security, code review, and automated isolation tests.

Payment marked successful incorrectly

Verify provider transaction data, amount, currency, reference, and prevent duplicate confirmation.

Poor restaurant adoption

Use simple Khmer-first UX, guided onboarding, staff training, and pilot with a narrow restaurant segment.

Unstable internet

Use resilient UI, retries, idempotency, cached menu/cart, connection status, and clear confirmation states.

Scope becomes too large

Release restaurant MVP first; control Phase 2, retail, delivery, loyalty, and AI through explicit roadmap gates.

Complex hardware support

Start with browser-based operation and validated printer options; document supported devices.

Incorrect reports

Use immutable order-item prices, transaction ledgers, reconciliation, and tested metric definitions.

Subscription disputes

Make plan limits, renewal dates, grace period, invoices, and suspension rules transparent.

Regulatory or contractual gaps

Complete legal, tax, payment-provider, consumer-protection, and privacy review before public launch.

Support workload

Build onboarding checklist, help center, tenant diagnostics, logs, and clear escalation process.

17. Success Metrics and Acceptance Criteria

17.1 Product Metrics

Active tenants and active branches

Trial-to-paid conversion

Monthly tenant retention

Order submission success rate

Payment confirmation success rate

Average order acceptance and preparation time

QR orders versus staff-entered orders

Daily active business users

Support tickets per active tenant

System availability and critical error rate

17.2 MVP Acceptance Criteria

Two test tenants cannot access each other’s data through API, UI, downloads, tokens, or storage paths.

A restaurant owner can register, create a business and branch, configure a menu and tables, invite staff, and launch.

A customer can scan a table QR, place an order, and track status without installing an application.

Cashier and kitchen screens receive near-real-time order updates.

Kitchen staff can process tickets and notify front-of-house when ready.

Cash and KHQR payment records are connected to the correct order and tenant.

The system produces correct daily sales and payment summaries.

Subscription entitlements correctly restrict features and numerical limits.

All sensitive actions produce an audit trail.

Backup and restore, monitoring, and production support procedures are tested.

18. Project Deliverables

Business requirements and final scope

UX flows and responsive interface designs

SaaS platform administration portal

Restaurant owner and staff portal

Customer QR-ordering PWA

Kitchen display interface

Backend API and modular business services

PostgreSQL schema and Alembic migrations

Tenant isolation and security controls

Subscription and entitlement system

Cash and KHQR payment module

Reports and exports

Automated tests and test reports

Deployment configuration and CI/CD

Monitoring, backup, and recovery procedures

Technical documentation

User and onboarding documentation

Pilot rollout and acceptance report

19. Assumptions and Exclusions

19.1 Assumptions

The first release focuses on restaurants and cafés.

The platform is cloud-hosted and accessed through supported browsers.

Each tenant provides correct business, tax, pricing, menu, and merchant information.

KHQR production integration depends on the applicable merchant/payment-provider onboarding and credentials.

The product supports Khmer and English, with Khmer-first operational UX.

Retail features reuse the SaaS core but are implemented after restaurant product validation.

19.2 Excluded from Initial MVP

Nationwide delivery marketplace and driver network

Full accounting and payroll

Advanced ingredient recipe costing and procurement

Complex franchise management

Customer native mobile application

Offline local-server appliance

Advanced loyalty and marketing automation

AI forecasting and autonomous decision-making

Custom enterprise integrations not required by pilot tenants

20. Conclusion

The proposed Khmer Business SaaS Platform is commercially practical because it solves immediate operational problems while creating a reusable software foundation. The strongest strategy is to deliver a secure restaurant-focused MVP first, prove adoption with real businesses, and then expand into retail, loyalty, delivery, and AI modules.

References

National Bank of Cambodia – Bakong and KHQR information

National Bank of Cambodia – KHQR SDK documentation

National Bank of Cambodia – Cambodia–India cross-border QR payment launch, 2 June 2026

Cambodia Consumer Protection, Competition and Fraud Repression Directorate-General – Laws

PostgreSQL 18 Documentation – Row Security Policies

End of Proposal