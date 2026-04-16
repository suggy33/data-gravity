/**
 * generate_churn.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Retention & Churn Model Dataset Generator
 *
 * Produces two verticals, each with a dedicated churn model table that surfaces
 * pre-computed features a data-science team can use directly in:
 *   • Binary churn classifiers (Logistic Regression, XGBoost, LightGBM)
 *   • Survival / time-to-churn models (Cox PH, Kaplan-Meier)
 *   • Propensity-to-retain scoring for CRM suppression/inclusion lists
 *
 * NEW TABLES
 *   retail_customer_churn_features.json   — one row per retail customer
 *   fintech_user_churn_features.json      — one row per fintech user
 *
 * EXISTING TABLES are also regenerated with additional churn-signal fields
 * embedded so everything cross-joins cleanly on customer_id / user_id.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { faker } from "@faker-js/faker";
import fs from "fs";
import path from "path";

const OUTPUT_DIR = "./output";
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// ── Volume knobs ──────────────────────────────────────────────────────────────
const RETAIL_CUSTOMERS = 5000;
const RETAIL_PRODUCTS = 500;
const RETAIL_ORDERS = 20000;
const RETAIL_REVIEWS = 10000;
const FINTECH_USERS = 5000;
const FINTECH_ACCOUNTS = 8000;
const FINTECH_TRANSACTIONS = 50000;
const FINTECH_LOANS = 2000;
const FINTECH_CARDS = 6000;

// ── Observation / label window ────────────────────────────────────────────────
// We treat 2024-01-01 as the "snapshot date".
// A customer is labelled churned=1 if they had zero activity in the
// subsequent 90-day prediction window (up to 2024-03-31).
const SNAPSHOT_DATE = new Date("2024-01-01");
const CHURN_WINDOW_DAYS = 90; // prediction horizon
const OBSERVATION_DAYS = 365; // lookback used to build features

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max, dp = 2) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(dp));
const randomDate = (start, end) =>
  faker.date.between({ from: start, to: end }).toISOString().split("T")[0];
const daysBetween = (a, b) =>
  Math.round((new Date(b) - new Date(a)) / 86400000);
const writeJSON = (filename, data) => {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(
    `  ✔  ${filename.padEnd(48)} ${data.length.toLocaleString()} records`,
  );
};

const CSV_OUTPUT_DIR = "./output/csv";
if (!fs.existsSync(CSV_OUTPUT_DIR))
  fs.mkdirSync(CSV_OUTPUT_DIR, { recursive: true });

const flattenObject = (obj, prefix = "") => {
  let flattened = {};
  for (let key in obj) {
    if (obj[key] === null || obj[key] === undefined) {
      flattened[prefix ? `${prefix}.${key}` : key] = "";
    } else if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
      flattened = {
        ...flattened,
        ...flattenObject(obj[key], prefix ? `${prefix}.${key}` : key),
      };
    } else if (Array.isArray(obj[key])) {
      flattened[prefix ? `${prefix}.${key}` : key] = JSON.stringify(obj[key]);
    } else {
      flattened[prefix ? `${prefix}.${key}` : key] = obj[key];
    }
  }
  return flattened;
};

const escapeCSV = (value) => {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const writeCSV = (filename, data) => {
  if (data.length === 0) return;
  const flattened = data.map((row) => flattenObject(row));
  const headers = Object.keys(flattened[0]);
  const csvContent = [
    headers.map(escapeCSV).join(","),
    ...flattened.map((row) => headers.map((h) => escapeCSV(row[h])).join(",")),
  ].join("\n");

  const filepath = path.join(CSV_OUTPUT_DIR, filename.replace(".json", ".csv"));
  fs.writeFileSync(filepath, csvContent);
  console.log(
    `  ✔  ${filename.replace(".json", ".csv").padEnd(48)} ${data.length.toLocaleString()} records`,
  );
};

// Weighted churn probability — customers who haven't been active recently are
// biased toward churned=1 so the label isn't trivially imbalanced.
const computeChurnLabel = (daysSinceLastActivity, baseChurnRate = 0.25) => {
  // Sigmoid on recency: the older the last touch, the higher the churn prob
  const recencyWeight =
    1 / (1 + Math.exp(-0.02 * (daysSinceLastActivity - 60)));
  const p = baseChurnRate + (1 - baseChurnRate) * recencyWeight * 0.6;
  return Math.random() < p ? 1 : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// ██████╗ ███████╗████████╗ █████╗ ██╗██╗
// ─────────────────────────────────────────────────────────────────────────────

const RETAIL_CATEGORIES = [
  "Electronics",
  "Clothing",
  "Home & Garden",
  "Sports & Outdoors",
  "Beauty & Health",
  "Toys & Games",
  "Books",
  "Automotive",
  "Grocery",
  "Furniture",
  "Jewellery",
  "Office Supplies",
];
const RETAIL_CHANNELS = ["Online", "In-Store", "Mobile App", "Phone Order"];
const RETAIL_STATUSES = [
  "Pending",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
  "Returned",
];
const PAYMENT_METHODS = [
  "Credit Card",
  "Debit Card",
  "PayPal",
  "Buy Now Pay Later",
  "Gift Card",
  "Bank Transfer",
];
const LOYALTY_TIERS = ["Bronze", "Silver", "Gold", "Platinum"];
const CONTACT_PREFERENCES = ["Email", "SMS", "Push", "None"];
const CHURN_REASONS = [
  "Price sensitivity",
  "Poor customer service",
  "Switched to competitor",
  "Product quality issue",
  "Delivery problems",
  "Lack of relevant products",
  "No specific reason",
  "Financial hardship",
];

function generateRetailCustomers(n) {
  return Array.from({ length: n }, (_, i) => {
    const registeredDate = randomDate("2015-01-01", "2023-12-31");
    const lastPurchaseDate = randomDate("2022-01-01", "2024-12-31");
    const daysSincePurchase = daysBetween(lastPurchaseDate, "2024-01-01");

    // ── Original fields ──
    const base = {
      customer_id: `CUST-${String(i + 1).padStart(6, "0")}`,
      first_name: faker.person.firstName(),
      last_name: faker.person.lastName(),
      email: faker.internet.email().toLowerCase(),
      phone: faker.phone.number(),
      gender: randomElement([
        "Male",
        "Female",
        "Non-binary",
        "Prefer not to say",
      ]),
      date_of_birth: randomDate("1950-01-01", "2005-12-31"),
      address: {
        street: faker.location.streetAddress(),
        suburb: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        postcode: faker.location.zipCode("####"),
        country: "Australia",
      },
      loyalty_tier: randomElement(LOYALTY_TIERS),
      loyalty_points: randomInt(0, 50000),
      registered_date: registeredDate,
      email_subscribed: faker.datatype.boolean(0.7),
      sms_subscribed: faker.datatype.boolean(0.4),
      preferred_channel: randomElement(RETAIL_CHANNELS),
      lifetime_spend: randomFloat(50, 25000),
      total_orders: randomInt(1, 150),
      average_order_value: randomFloat(25, 500),
      last_purchase_date: lastPurchaseDate,
      customer_segment: randomElement([
        "New",
        "Active",
        "At-Risk",
        "Lapsed",
        "VIP",
      ]),
      acquisition_source: randomElement([
        "Google Ads",
        "Facebook",
        "Organic",
        "Referral",
        "Email",
        "TV Ad",
        "Influencer",
      ]),
      nps_score: randomElement([
        null,
        ...Array.from({ length: 11 }, (_, i) => i),
      ]),
    };

    // ── Churn-model additions ──
    const tenure_days = daysBetween(registeredDate, "2024-01-01");
    const orders_last_30d = randomInt(0, 5);
    const orders_last_90d = orders_last_30d + randomInt(0, 8);
    const orders_last_365d = orders_last_90d + randomInt(0, 30);
    const spend_last_30d = randomFloat(0, 800);
    const spend_last_90d = spend_last_30d + randomFloat(0, 2000);
    const spend_last_365d = spend_last_90d + randomFloat(0, 8000);
    const churned = computeChurnLabel(daysSincePurchase);

    return {
      ...base,

      // ── Recency / Frequency / Monetary (RFM) ──
      days_since_last_purchase: daysSincePurchase,
      days_since_last_login: randomInt(0, 365),
      orders_last_30d,
      orders_last_90d,
      orders_last_365d,
      spend_last_30d,
      spend_last_90d,
      spend_last_365d,
      avg_order_value_last_90d:
        orders_last_90d > 0
          ? parseFloat((spend_last_90d / orders_last_90d).toFixed(2))
          : 0,

      // ── Trend signals ──
      spend_trend_30_vs_90:
        spend_last_90d > 0
          ? parseFloat((spend_last_30d / (spend_last_90d / 3)).toFixed(3))
          : null,
      order_freq_trend_90_vs_365:
        orders_last_365d > 0
          ? parseFloat((orders_last_90d / (orders_last_365d / 4)).toFixed(3))
          : null,
      avg_days_between_orders: randomFloat(5, 180),
      inter_purchase_variance: randomFloat(0, 60), // std dev of gap days

      // ── Engagement / channel ──
      email_open_rate_90d: randomFloat(0, 1),
      email_click_rate_90d: randomFloat(0, 0.4),
      sms_click_rate_90d: randomFloat(0, 0.5),
      push_open_rate_90d: randomFloat(0, 0.6),
      app_sessions_last_30d: randomInt(0, 60),
      app_sessions_last_90d: randomInt(0, 200),
      web_sessions_last_30d: randomInt(0, 40),
      days_active_last_90d: randomInt(0, 90),
      contact_preference: randomElement(CONTACT_PREFERENCES),
      unsubscribed_email_date: faker.datatype.boolean(0.15)
        ? randomDate("2022-01-01", "2024-01-01")
        : null,

      // ── Service / satisfaction signals ──
      support_tickets_12m: randomInt(0, 10),
      open_support_tickets: randomInt(0, 3),
      avg_ticket_resolution_days: randomFloat(0.5, 14),
      returns_last_12m: randomInt(0, 8),
      returns_rate: randomFloat(0, 0.4),
      last_nps_date: faker.datatype.boolean(0.5)
        ? randomDate("2023-01-01", "2024-01-01")
        : null,
      csat_score: randomElement([null, 1, 2, 3, 4, 5]),
      complaints_12m: randomInt(0, 5),

      // ── Loyalty / product breadth ──
      tenure_days,
      distinct_categories_purchased: randomInt(1, 12),
      distinct_brands_purchased: randomInt(1, 30),
      loyalty_points_redeemed_12m: randomInt(0, 20000),
      loyalty_points_earned_12m: randomInt(0, 30000),
      loyalty_tier_change_direction: randomElement([
        "Upgraded",
        "Downgraded",
        "No Change",
      ]),
      has_wishlist: faker.datatype.boolean(0.4),
      wishlist_item_count: randomInt(0, 50),
      promo_redemption_rate: randomFloat(0, 1),
      promo_sensitivity: randomElement(["High", "Medium", "Low"]), // how often they only buy on promo
      subscription_active: faker.datatype.boolean(0.2), // e.g. subscription box

      // ── Competitive risk ──
      price_comparison_events_30d: randomInt(0, 20), // tracked via session behaviour
      competitor_coupon_used: faker.datatype.boolean(0.1),
      competitor_brand_in_basket: faker.datatype.boolean(0.15),

      // ── Label & metadata ──
      churn_label: churned, // 1 = churned, 0 = retained
      churn_reason: churned === 1 ? randomElement(CHURN_REASONS) : null,
      churn_date: churned === 1 ? randomDate("2024-01-01", "2024-03-31") : null,
      predicted_churn_prob: parseFloat(randomFloat(0, 1).toFixed(4)), // placeholder for model output slot
      churn_risk_segment: randomElement(["Low", "Medium", "High", "Critical"]),
      retention_offer_eligible: faker.datatype.boolean(0.35),
      retention_offer_type: faker.datatype.boolean(0.35)
        ? randomElement([
            "Discount",
            "Free Shipping",
            "Loyalty Bonus",
            "Early Access",
            "Win-Back Email",
          ])
        : null,
      days_to_churn_estimate: randomInt(0, 180), // survival model output slot
      clv_12m_estimate: randomFloat(0, 3000),
      clv_lifetime_estimate: randomFloat(0, 20000),
      model_snapshot_date: "2024-01-01",
      observation_window_days: OBSERVATION_DAYS,
      prediction_window_days: CHURN_WINDOW_DAYS,
    };
  });
}

function generateRetailProducts(n) {
  return Array.from({ length: n }, (_, i) => {
    const category = randomElement(RETAIL_CATEGORIES);
    const cost = randomFloat(5, 500);
    const margin = randomFloat(0.2, 0.7);
    const price = parseFloat((cost * (1 + margin)).toFixed(2));
    return {
      product_id: `PROD-${String(i + 1).padStart(5, "0")}`,
      sku: faker.string.alphanumeric(10).toUpperCase(),
      name: `${faker.commerce.productAdjective()} ${faker.commerce.product()}`,
      category,
      subcategory: faker.commerce.department(),
      brand: faker.company.name(),
      description: faker.commerce.productDescription(),
      price,
      cost,
      margin_pct: parseFloat((margin * 100).toFixed(1)),
      currency: "AUD",
      stock_quantity: randomInt(0, 5000),
      reorder_level: randomInt(10, 200),
      weight_kg: randomFloat(0.1, 20),
      is_active: faker.datatype.boolean(0.85),
      is_featured: faker.datatype.boolean(0.1),
      avg_rating: randomFloat(1, 5),
      review_count: randomInt(0, 2000),
      date_added: randomDate("2018-01-01", "2024-06-01"),
      supplier: faker.company.name(),
      barcode: faker.string.numeric(13),
      tags: Array.from({ length: randomInt(1, 5) }, () =>
        faker.commerce.productAdjective(),
      ),
      // churn-relevant product signals
      churn_associated_return_rate: randomFloat(0, 0.3), // % of buyers who returned this product
      repeat_purchase_rate: randomFloat(0, 0.8), // % of buyers who reordered
    };
  });
}

function generateRetailOrders(n, customerIds, productIds) {
  return Array.from({ length: n }, (_, i) => {
    const itemCount = randomInt(1, 8);
    const items = Array.from({ length: itemCount }, () => {
      const qty = randomInt(1, 5);
      const unitPrice = randomFloat(10, 500);
      return {
        product_id: randomElement(productIds),
        quantity: qty,
        unit_price: unitPrice,
        discount_pct: randomElement([0, 0, 0, 5, 10, 15, 20, 25]),
        line_total: parseFloat((qty * unitPrice).toFixed(2)),
      };
    });
    const subtotal = parseFloat(
      items.reduce((s, it) => s + it.line_total, 0).toFixed(2),
    );
    const shipping = randomFloat(0, 15);
    const discount = parseFloat((subtotal * randomFloat(0, 0.15)).toFixed(2));
    const tax = parseFloat(((subtotal - discount + shipping) * 0.1).toFixed(2));
    const order_date = randomDate("2020-01-01", "2024-12-31");
    return {
      order_id: `ORD-${String(i + 1).padStart(7, "0")}`,
      customer_id: randomElement(customerIds),
      order_date,
      channel: randomElement(RETAIL_CHANNELS),
      status: randomElement(RETAIL_STATUSES),
      items,
      item_count: itemCount,
      subtotal,
      shipping_cost: shipping,
      discount_amount: discount,
      tax,
      total_amount: parseFloat(
        (subtotal - discount + shipping + tax).toFixed(2),
      ),
      payment_method: randomElement(PAYMENT_METHODS),
      payment_status: randomElement(["Paid", "Pending", "Refunded", "Failed"]),
      shipping_address: {
        street: faker.location.streetAddress(),
        suburb: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        postcode: faker.location.zipCode("####"),
      },
      estimated_delivery: randomDate(order_date, "2025-03-31"),
      courier: randomElement([
        "AusPost",
        "StarTrack",
        "DHL",
        "TNT",
        "Toll",
        "Sendle",
      ]),
      tracking_number: faker.string.alphanumeric(16).toUpperCase(),
      promo_code: faker.datatype.boolean(0.2)
        ? faker.string.alphanumeric(8).toUpperCase()
        : null,
      notes: faker.datatype.boolean(0.1) ? faker.lorem.sentence() : null,
      // churn-model additions on order
      is_first_order: faker.datatype.boolean(0.08),
      days_since_prev_order: randomElement([
        null,
        ...Array.from({ length: 180 }, (_, i) => i + 1),
      ]),
      used_loyalty_redemption: faker.datatype.boolean(0.2),
      order_satisfaction_score: randomElement([null, 1, 2, 3, 4, 5]),
      delivery_on_time: randomElement([null, true, true, true, false]),
      post_purchase_survey_opened: faker.datatype.boolean(0.3),
    };
  });
}

function generateRetailReviews(n, customerIds, productIds) {
  return Array.from({ length: n }, (_, i) => ({
    review_id: `REV-${String(i + 1).padStart(7, "0")}`,
    product_id: randomElement(productIds),
    customer_id: randomElement(customerIds),
    rating: randomInt(1, 5),
    title: faker.lorem.sentence({ min: 3, max: 8 }),
    body: faker.lorem.paragraph(),
    verified_purchase: faker.datatype.boolean(0.8),
    helpful_votes: randomInt(0, 200),
    date_submitted: randomDate("2020-01-01", "2024-12-31"),
    sentiment: randomElement(["Positive", "Neutral", "Negative"]),
    flagged: faker.datatype.boolean(0.02),
    // churn signal
    days_after_purchase: randomInt(1, 60),
    churn_risk_indicator: faker.datatype.boolean(0.1), // low rating + key churn language detected
  }));
}

// ── Standalone churn feature table for retail ─────────────────────────────────
// This is the single join-ready feature set for model training — it mirrors the
// fields on customers but is denormalised and can be generated independently
// when the source tables are too large to hydrate per-row.
function generateRetailChurnFeatures(customers) {
  return customers.map((c) => ({
    customer_id: c.customer_id,
    model_snapshot_date: c.model_snapshot_date,
    // identity / demo
    tenure_days: c.tenure_days,
    age_years: c.date_of_birth
      ? Math.floor(daysBetween(c.date_of_birth, "2024-01-01") / 365)
      : null,
    gender: c.gender,
    loyalty_tier: c.loyalty_tier,
    acquisition_source: c.acquisition_source,
    // recency
    days_since_last_purchase: c.days_since_last_purchase,
    days_since_last_login: c.days_since_last_login,
    // frequency
    orders_last_30d: c.orders_last_30d,
    orders_last_90d: c.orders_last_90d,
    orders_last_365d: c.orders_last_365d,
    avg_days_between_orders: c.avg_days_between_orders,
    inter_purchase_variance: c.inter_purchase_variance,
    // monetary
    spend_last_30d: c.spend_last_30d,
    spend_last_90d: c.spend_last_90d,
    spend_last_365d: c.spend_last_365d,
    lifetime_spend: c.lifetime_spend,
    avg_order_value_last_90d: c.avg_order_value_last_90d,
    // trend
    spend_trend_30_vs_90: c.spend_trend_30_vs_90,
    order_freq_trend_90_vs_365: c.order_freq_trend_90_vs_365,
    // engagement
    email_open_rate_90d: c.email_open_rate_90d,
    email_click_rate_90d: c.email_click_rate_90d,
    app_sessions_last_30d: c.app_sessions_last_30d,
    days_active_last_90d: c.days_active_last_90d,
    email_subscribed: c.email_subscribed ? 1 : 0,
    sms_subscribed: c.sms_subscribed ? 1 : 0,
    unsubscribed_email: c.unsubscribed_email_date ? 1 : 0,
    // service
    support_tickets_12m: c.support_tickets_12m,
    open_support_tickets: c.open_support_tickets,
    returns_rate: c.returns_rate,
    complaints_12m: c.complaints_12m,
    nps_score: c.nps_score,
    csat_score: c.csat_score,
    // product breadth
    distinct_categories_purchased: c.distinct_categories_purchased,
    subscription_active: c.subscription_active ? 1 : 0,
    loyalty_tier_change_direction: c.loyalty_tier_change_direction,
    promo_sensitivity: c.promo_sensitivity,
    // competitive
    price_comparison_events_30d: c.price_comparison_events_30d,
    // label & outputs
    churn_label: c.churn_label,
    churn_risk_segment: c.churn_risk_segment,
    days_to_churn_estimate: c.days_to_churn_estimate,
    clv_12m_estimate: c.clv_12m_estimate,
    observation_window_days: c.observation_window_days,
    prediction_window_days: c.prediction_window_days,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// ███████╗██╗███╗   ██╗████████╗███████╗ ██████╗██╗  ██╗
// ─────────────────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = [
  "Everyday Savings",
  "High Interest Savings",
  "Term Deposit",
  "Transaction",
  "Offset",
  "Business Cheque",
];
const TRANSACTION_TYPES = [
  "Purchase",
  "Transfer In",
  "Transfer Out",
  "Direct Debit",
  "BPay",
  "ATM Withdrawal",
  "Interest Credit",
  "Fee Debit",
  "Payroll Credit",
  "Refund",
  "International Transfer",
];
const MERCHANT_CATEGORIES = [
  "Supermarkets",
  "Fuel",
  "Restaurants",
  "Retail",
  "Utilities",
  "Healthcare",
  "Entertainment",
  "Travel",
  "Education",
  "Insurance",
  "Telecommunications",
  "Government",
];
const LOAN_TYPES = [
  "Personal Loan",
  "Home Loan",
  "Car Loan",
  "Business Loan",
  "Line of Credit",
];
const LOAN_STATUSES = [
  "Active",
  "Closed",
  "In Arrears",
  "Default",
  "Pending Approval",
];
const CARD_TYPES = [
  "Visa Debit",
  "Visa Credit",
  "Mastercard Debit",
  "Mastercard Credit",
];
const KYC_STATUSES = ["Verified", "Pending", "Failed", "Expired"];
const RISK_RATINGS = ["Low", "Medium", "High", "Very High"];
const FINTECH_CHURN_REASONS = [
  "Switched to competitor bank",
  "Better interest rate elsewhere",
  "Fee dissatisfaction",
  "App/UX issues",
  "Customer service failure",
  "Loan declined",
  "Relocated overseas",
  "Financial hardship",
  "Consolidated accounts",
  "No specific reason",
];

function generateFintechUsers(n) {
  return Array.from({ length: n }, (_, i) => {
    const registrationDate = randomDate("2015-01-01", "2023-12-31");
    const lastLoginDate = randomDate("2022-01-01", "2024-12-31");
    const daysSinceLogin = daysBetween(lastLoginDate, "2024-01-01");
    const tenure_days = daysBetween(registrationDate, "2024-01-01");
    const churned = computeChurnLabel(daysSinceLogin, 0.2);

    return {
      user_id: `USR-${String(i + 1).padStart(6, "0")}`,
      first_name: faker.person.firstName(),
      last_name: faker.person.lastName(),
      email: faker.internet.email().toLowerCase(),
      phone: faker.phone.number(),
      gender: randomElement([
        "Male",
        "Female",
        "Non-binary",
        "Prefer not to say",
      ]),
      date_of_birth: randomDate("1950-01-01", "2004-12-31"),
      tax_file_number_hash: faker.string.hexadecimal({ length: 64 }),
      address: {
        street: faker.location.streetAddress(),
        suburb: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        postcode: faker.location.zipCode("####"),
        country: "Australia",
      },
      occupation: faker.person.jobTitle(),
      employer: faker.company.name(),
      employment_status: randomElement([
        "Full-Time",
        "Part-Time",
        "Self-Employed",
        "Unemployed",
        "Retired",
        "Student",
      ]),
      annual_income: randomInt(0, 350000),
      kyc_status: randomElement(KYC_STATUSES),
      kyc_verified_date: randomDate("2018-01-01", "2024-12-31"),
      risk_rating: randomElement(RISK_RATINGS),
      credit_score: randomInt(300, 850),
      registration_date: registrationDate,
      last_login_date: lastLoginDate,
      is_active: faker.datatype.boolean(0.88),
      two_fa_enabled: faker.datatype.boolean(0.65),
      notification_prefs: {
        email: faker.datatype.boolean(0.9),
        sms: faker.datatype.boolean(0.6),
        push: faker.datatype.boolean(0.7),
      },
      referred_by: faker.datatype.boolean(0.15)
        ? `USR-${String(randomInt(1, n)).padStart(6, "0")}`
        : null,
      acquisition_channel: randomElement([
        "Organic",
        "Google Ads",
        "Facebook",
        "Referral",
        "App Store",
        "Partner",
        "TV",
      ]),

      // ── Churn model additions ──

      // Recency / engagement
      tenure_days,
      days_since_last_login: daysSinceLogin,
      days_since_last_transaction: randomInt(0, 365),
      days_since_last_app_open: randomInt(0, 365),
      login_count_last_30d: randomInt(0, 60),
      login_count_last_90d: randomInt(0, 180),
      app_sessions_last_30d: randomInt(0, 90),
      app_sessions_last_90d: randomInt(0, 270),
      web_sessions_last_30d: randomInt(0, 30),
      days_active_last_90d: randomInt(0, 90),
      avg_session_duration_mins: randomFloat(1, 25),

      // Product depth / stickiness
      active_product_count: randomInt(1, 8), // no. of active products held
      has_savings_account: faker.datatype.boolean(0.7),
      has_transaction_account: faker.datatype.boolean(0.8),
      has_term_deposit: faker.datatype.boolean(0.2),
      has_home_loan: faker.datatype.boolean(0.25),
      has_personal_loan: faker.datatype.boolean(0.15),
      has_credit_card: faker.datatype.boolean(0.45),
      has_offset_account: faker.datatype.boolean(0.1),
      total_deposit_balance: randomFloat(0, 500000),
      total_loan_balance: randomFloat(0, 1500000),
      net_position: randomFloat(-500000, 500000),
      balance_trend_30d: randomFloat(-50000, 50000), // change in total balance
      balance_trend_90d: randomFloat(-100000, 100000),
      external_transfer_ratio: randomFloat(0, 1), // % of debits going out of bank
      salary_credited_flag: faker.datatype.boolean(0.65), // payroll deposited here

      // Fee & rate sensitivity
      monthly_fees_paid_avg: randomFloat(0, 30),
      fee_waiver_active: faker.datatype.boolean(0.3),
      rate_comparison_events_30d: randomInt(0, 10), // in-app rate comparison clicks
      competitor_rate_inquiry_flag: faker.datatype.boolean(0.12),
      rate_change_notification_opened: faker.datatype.boolean(0.4),

      // Support / friction
      support_contacts_90d: randomInt(0, 8),
      open_disputes: randomInt(0, 2),
      failed_transactions_30d: randomInt(0, 10),
      declined_card_events_30d: randomInt(0, 5),
      password_resets_90d: randomInt(0, 3),
      app_crash_events_30d: randomInt(0, 5),
      complaint_lodged_12m: faker.datatype.boolean(0.1),
      complaint_resolved: faker.datatype.boolean(0.8),

      // Lifecycle events (strong churn predictors)
      address_change_last_90d: faker.datatype.boolean(0.05),
      income_drop_flag: faker.datatype.boolean(0.08), // detected via payroll credits
      large_external_transfer_flag: faker.datatype.boolean(0.07), // >$10k moved out
      term_deposit_matured_not_renewed: faker.datatype.boolean(0.12),
      loan_repayment_completed_flag: faker.datatype.boolean(0.1), // loan paid off — risk of leaving
      account_closure_inquiry_flag: faker.datatype.boolean(0.04),

      // Satisfaction
      nps_score: randomElement([
        null,
        ...Array.from({ length: 11 }, (_, i) => i),
      ]),
      last_nps_date: faker.datatype.boolean(0.5)
        ? randomDate("2023-01-01", "2024-01-01")
        : null,
      csat_score: randomElement([null, 1, 2, 3, 4, 5]),
      in_app_rating: randomElement([null, 1, 2, 3, 4, 5]),

      // Label
      churn_label: churned,
      churn_reason: churned === 1 ? randomElement(FINTECH_CHURN_REASONS) : null,
      churn_date: churned === 1 ? randomDate("2024-01-01", "2024-03-31") : null,
      predicted_churn_prob: parseFloat(randomFloat(0, 1).toFixed(4)),
      churn_risk_segment: randomElement(["Low", "Medium", "High", "Critical"]),
      retention_offer_eligible: faker.datatype.boolean(0.3),
      retention_offer_type: faker.datatype.boolean(0.3)
        ? randomElement([
            "Rate Bonus",
            "Fee Waiver",
            "Cash Back",
            "Relationship Call",
            "Product Bundle",
          ])
        : null,
      days_to_churn_estimate: randomInt(0, 180),
      clv_12m_estimate: randomFloat(0, 5000),
      clv_lifetime_estimate: randomFloat(0, 50000),
      model_snapshot_date: "2024-01-01",
      observation_window_days: OBSERVATION_DAYS,
      prediction_window_days: CHURN_WINDOW_DAYS,
    };
  });
}

function generateFintechAccounts(n, userIds) {
  return Array.from({ length: n }, (_, i) => {
    const type = randomElement(ACCOUNT_TYPES);
    const balance = randomFloat(0, 500000);
    const openDate = randomDate("2015-01-01", "2024-06-01");
    return {
      account_id: `ACC-${String(i + 1).padStart(7, "0")}`,
      user_id: randomElement(userIds),
      account_number: faker.finance.accountNumber(10),
      bsb: `${randomInt(100, 999)}-${randomInt(100, 999)}`,
      account_type: type,
      account_name: `${faker.person.lastName()} ${type}`,
      currency: "AUD",
      balance,
      available_balance: parseFloat((balance * randomFloat(0.9, 1)).toFixed(2)),
      interest_rate: randomFloat(0.01, 5.5),
      interest_rate_type: randomElement(["Fixed", "Variable"]),
      open_date: openDate,
      maturity_date:
        type === "Term Deposit" ? randomDate(openDate, "2027-12-31") : null,
      term_months:
        type === "Term Deposit" ? randomElement([3, 6, 12, 24, 36]) : null,
      status: randomElement(["Active", "Dormant", "Closed", "Frozen"]),
      overdraft_limit: randomElement([0, 0, 0, 500, 1000, 2000]),
      joint_account: faker.datatype.boolean(0.1),
      direct_debit_enabled: faker.datatype.boolean(0.6),
      last_transaction_date: randomDate("2024-01-01", "2024-12-31"),
      // churn additions
      days_since_last_transaction: randomInt(0, 365),
      balance_30d_ago: parseFloat((balance * randomFloat(0.8, 1.2)).toFixed(2)),
      balance_change_30d: randomFloat(-50000, 50000),
      debit_count_30d: randomInt(0, 60),
      credit_count_30d: randomInt(0, 20),
      dormancy_risk: randomElement(["None", "Low", "Medium", "High"]),
      auto_renewal_enabled:
        type === "Term Deposit" ? faker.datatype.boolean(0.5) : null,
    };
  });
}

function generateFintechTransactions(n, accountIds) {
  return Array.from({ length: n }, (_, i) => {
    const type = randomElement(TRANSACTION_TYPES);
    const amount = randomFloat(0.5, 15000);
    const isCredit = [
      "Transfer In",
      "Interest Credit",
      "Payroll Credit",
      "Refund",
    ].includes(type);
    return {
      transaction_id: `TXN-${String(i + 1).padStart(8, "0")}`,
      account_id: randomElement(accountIds),
      transaction_date: randomDate("2020-01-01", "2024-12-31"),
      value_date: randomDate("2020-01-01", "2024-12-31"),
      type,
      direction: isCredit ? "Credit" : "Debit",
      amount,
      currency: "AUD",
      running_balance: randomFloat(0, 500000),
      description: faker.finance.transactionDescription(),
      merchant_name: ["Purchase", "Refund"].includes(type)
        ? faker.company.name()
        : null,
      merchant_category: ["Purchase", "Refund"].includes(type)
        ? randomElement(MERCHANT_CATEGORIES)
        : null,
      merchant_abn: faker.datatype.boolean(0.5)
        ? faker.string.numeric(11)
        : null,
      channel: randomElement([
        "Online Banking",
        "Mobile App",
        "Branch",
        "ATM",
        "POS",
        "Direct Debit",
        "BPAY",
      ]),
      status: randomElement(["Completed", "Pending", "Failed", "Reversed"]),
      reference: faker.string.alphanumeric(12).toUpperCase(),
      is_international: faker.datatype.boolean(0.05),
      exchange_rate: faker.datatype.boolean(0.05)
        ? randomFloat(0.5, 2.5)
        : null,
      fee: faker.datatype.boolean(0.15) ? randomFloat(0.5, 35) : 0,
      fraud_flag: faker.datatype.boolean(0.008),
      fraud_score: randomFloat(0, 1),
      latitude: faker.datatype.boolean(0.5)
        ? parseFloat(faker.location.latitude({ min: -44, max: -10 }).toString())
        : null,
      longitude: faker.datatype.boolean(0.5)
        ? parseFloat(
            faker.location.longitude({ min: 112, max: 154 }).toString(),
          )
        : null,
      // churn signals
      is_competitor_transfer: faker.datatype.boolean(0.05), // transfer out to a known competitor BSB
      large_outflow_flag: amount > 10000 && !isCredit,
      days_since_prev_txn: randomElement([
        null,
        ...Array.from({ length: 60 }, (_, i) => i + 1),
      ]),
    };
  });
}

function generateFintechLoans(n, userIds) {
  return Array.from({ length: n }, (_, i) => {
    const type = randomElement(LOAN_TYPES);
    const principal = randomFloat(1000, 1500000);
    const rate = randomFloat(2.5, 18);
    const termMonths = randomElement([12, 24, 36, 48, 60, 120, 240, 300, 360]);
    const originationDate = randomDate("2015-01-01", "2024-06-01");
    return {
      loan_id: `LN-${String(i + 1).padStart(6, "0")}`,
      user_id: randomElement(userIds),
      loan_type: type,
      status: randomElement(LOAN_STATUSES),
      principal_amount: principal,
      outstanding_balance: randomFloat(0, principal),
      interest_rate: rate,
      rate_type: randomElement(["Fixed", "Variable", "Split"]),
      term_months: termMonths,
      monthly_repayment: parseFloat(
        (
          (principal * (rate / 1200)) /
          (1 - Math.pow(1 + rate / 1200, -termMonths))
        ).toFixed(2),
      ),
      origination_date: originationDate,
      maturity_date: randomDate(originationDate, "2040-12-31"),
      purpose:
        type === "Personal Loan"
          ? randomElement([
              "Debt Consolidation",
              "Home Renovation",
              "Vehicle",
              "Holiday",
              "Medical",
              "Other",
            ])
          : type,
      collateral: ["Home Loan", "Car Loan"].includes(type)
        ? randomElement(["Property", "Vehicle"])
        : null,
      collateral_value: ["Home Loan", "Car Loan"].includes(type)
        ? randomFloat(50000, 2000000)
        : null,
      lvr_pct: type === "Home Loan" ? randomFloat(20, 95) : null,
      arrears_days: randomElement([0, 0, 0, 0, 15, 30, 60, 90]),
      missed_payments: randomInt(0, 5),
      credit_score_at_origination: randomInt(400, 850),
      approved_by: randomElement([
        "Auto-Approval",
        "Analyst",
        "Senior Credit Officer",
      ]),
      broker_id: faker.datatype.boolean(0.3)
        ? `BRK-${faker.string.alphanumeric(6).toUpperCase()}`
        : null,
      // churn additions
      months_remaining: randomInt(0, 360),
      early_repayment_flag: faker.datatype.boolean(0.08),
      refinance_inquiry_flag: faker.datatype.boolean(0.1),
      hardship_arrangement_active: faker.datatype.boolean(0.05),
      offset_utilisation_pct: type === "Home Loan" ? randomFloat(0, 100) : null,
    };
  });
}

function generateFintechCards(n, userIds, accountIds) {
  return Array.from({ length: n }, (_, i) => {
    const issueDate = randomDate("2018-01-01", "2024-06-01");
    return {
      card_id: `CARD-${String(i + 1).padStart(6, "0")}`,
      user_id: randomElement(userIds),
      account_id: randomElement(accountIds),
      card_type: randomElement(CARD_TYPES),
      card_number_masked: `**** **** **** ${faker.string.numeric(4)}`,
      card_holder_name: faker.person.fullName().toUpperCase(),
      issue_date: issueDate,
      expiry_date: randomDate(issueDate, "2030-12-31"),
      status: randomElement([
        "Active",
        "Blocked",
        "Expired",
        "Cancelled",
        "Lost",
        "Stolen",
      ]),
      credit_limit: randomElement([
        null,
        1000,
        2000,
        5000,
        10000,
        15000,
        20000,
        30000,
      ]),
      current_balance: randomFloat(0, 25000),
      available_credit: randomFloat(0, 30000),
      daily_limit: randomElement([500, 1000, 2000, 5000]),
      contactless_enabled: faker.datatype.boolean(0.9),
      online_enabled: faker.datatype.boolean(0.95),
      international_enabled: faker.datatype.boolean(0.4),
      pin_retries: randomInt(0, 3),
      rewards_program: randomElement([
        null,
        "CashBack",
        "Frequent Flyer",
        "Points",
      ]),
      rewards_balance: randomInt(0, 100000),
      last_used_date: randomDate("2024-01-01", "2024-12-31"),
      lost_stolen_reported: faker.datatype.boolean(0.03),
      digital_wallet: randomElement([
        null,
        "Apple Pay",
        "Google Pay",
        "Samsung Pay",
      ]),
      // churn additions
      days_since_last_use: randomInt(0, 365),
      utilisation_rate_pct: randomFloat(0, 100), // balance / credit_limit
      spend_last_30d: randomFloat(0, 10000),
      spend_last_90d: randomFloat(0, 30000),
      declined_txn_count_30d: randomInt(0, 5),
      competitor_card_indicator: faker.datatype.boolean(0.15), // bureau signal
      reward_redemption_rate: randomFloat(0, 1),
      card_not_present_ratio: randomFloat(0, 1), // % online vs physical
    };
  });
}

// ── Standalone fintech churn feature table ────────────────────────────────────
function generateFintechChurnFeatures(users) {
  return users.map((u) => ({
    user_id: u.user_id,
    model_snapshot_date: u.model_snapshot_date,
    // identity
    tenure_days: u.tenure_days,
    age_years: u.date_of_birth
      ? Math.floor(daysBetween(u.date_of_birth, "2024-01-01") / 365)
      : null,
    gender: u.gender,
    employment_status: u.employment_status,
    annual_income_band:
      u.annual_income < 50000
        ? "<50k"
        : u.annual_income < 100000
          ? "50-100k"
          : u.annual_income < 150000
            ? "100-150k"
            : ">150k",
    acquisition_channel: u.acquisition_channel,
    // recency
    days_since_last_login: u.days_since_last_login,
    days_since_last_transaction: u.days_since_last_transaction,
    days_since_last_app_open: u.days_since_last_app_open,
    // engagement
    login_count_last_30d: u.login_count_last_30d,
    login_count_last_90d: u.login_count_last_90d,
    app_sessions_last_30d: u.app_sessions_last_30d,
    days_active_last_90d: u.days_active_last_90d,
    avg_session_duration_mins: u.avg_session_duration_mins,
    // product depth
    active_product_count: u.active_product_count,
    has_savings_account: u.has_savings_account ? 1 : 0,
    has_transaction_account: u.has_transaction_account ? 1 : 0,
    has_term_deposit: u.has_term_deposit ? 1 : 0,
    has_home_loan: u.has_home_loan ? 1 : 0,
    has_credit_card: u.has_credit_card ? 1 : 0,
    salary_credited_flag: u.salary_credited_flag ? 1 : 0,
    // balance / monetary
    total_deposit_balance: u.total_deposit_balance,
    total_loan_balance: u.total_loan_balance,
    net_position: u.net_position,
    balance_trend_30d: u.balance_trend_30d,
    balance_trend_90d: u.balance_trend_90d,
    external_transfer_ratio: u.external_transfer_ratio,
    // fee/rate
    monthly_fees_paid_avg: u.monthly_fees_paid_avg,
    fee_waiver_active: u.fee_waiver_active ? 1 : 0,
    rate_comparison_events_30d: u.rate_comparison_events_30d,
    competitor_rate_inquiry_flag: u.competitor_rate_inquiry_flag ? 1 : 0,
    // friction
    support_contacts_90d: u.support_contacts_90d,
    failed_transactions_30d: u.failed_transactions_30d,
    complaint_lodged_12m: u.complaint_lodged_12m ? 1 : 0,
    // lifecycle events
    address_change_last_90d: u.address_change_last_90d ? 1 : 0,
    income_drop_flag: u.income_drop_flag ? 1 : 0,
    large_external_transfer_flag: u.large_external_transfer_flag ? 1 : 0,
    term_deposit_matured_not_renewed: u.term_deposit_matured_not_renewed
      ? 1
      : 0,
    loan_repayment_completed_flag: u.loan_repayment_completed_flag ? 1 : 0,
    account_closure_inquiry_flag: u.account_closure_inquiry_flag ? 1 : 0,
    // satisfaction
    nps_score: u.nps_score,
    csat_score: u.csat_score,
    // label
    churn_label: u.churn_label,
    churn_risk_segment: u.churn_risk_segment,
    days_to_churn_estimate: u.days_to_churn_estimate,
    clv_12m_estimate: u.clv_12m_estimate,
    observation_window_days: u.observation_window_days,
    prediction_window_days: u.prediction_window_days,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n🛒  Generating RETAIL datasets...");
const customers = generateRetailCustomers(RETAIL_CUSTOMERS);
const products = generateRetailProducts(RETAIL_PRODUCTS);
const customerIds = customers.map((c) => c.customer_id);
const productIds = products.map((p) => p.product_id);
const orders = generateRetailOrders(RETAIL_ORDERS, customerIds, productIds);
const reviews = generateRetailReviews(RETAIL_REVIEWS, customerIds, productIds);
const retailChurn = generateRetailChurnFeatures(customers);

writeJSON("retail_customers.json", customers);
writeJSON("retail_products.json", products);
writeJSON("retail_orders.json", orders);
writeJSON("retail_reviews.json", reviews);
writeJSON("retail_customer_churn_features.json", retailChurn);

console.log("\n🏦  Generating FINTECH datasets...");
const fintechUsers = generateFintechUsers(FINTECH_USERS);
const userIds = fintechUsers.map((u) => u.user_id);
const fintechAccounts = generateFintechAccounts(FINTECH_ACCOUNTS, userIds);
const accountIds = fintechAccounts.map((a) => a.account_id);
const transactions = generateFintechTransactions(
  FINTECH_TRANSACTIONS,
  accountIds,
);
const loans = generateFintechLoans(FINTECH_LOANS, userIds);
const cards = generateFintechCards(FINTECH_CARDS, userIds, accountIds);
const fintechChurn = generateFintechChurnFeatures(fintechUsers);

writeJSON("fintech_users.json", fintechUsers);
writeJSON("fintech_accounts.json", fintechAccounts);
writeJSON("fintech_transactions.json", transactions);
writeJSON("fintech_loans.json", loans);
writeJSON("fintech_cards.json", cards);
writeJSON("fintech_user_churn_features.json", fintechChurn);

console.log("\n📄  Generating CSV datasets...");
writeCSV("retail_customers.json", customers);
writeCSV("retail_products.json", products);
writeCSV("retail_orders.json", orders);
writeCSV("retail_reviews.json", reviews);
writeCSV("retail_customer_churn_features.json", retailChurn);
writeCSV("fintech_users.json", fintechUsers);
writeCSV("fintech_accounts.json", fintechAccounts);
writeCSV("fintech_transactions.json", transactions);
writeCSV("fintech_loans.json", loans);
writeCSV("fintech_cards.json", cards);
writeCSV("fintech_user_churn_features.json", fintechChurn);

// ── Churn distribution summary ────────────────────────────────────────────────
const retailChurnRate = (
  (retailChurn.filter((r) => r.churn_label === 1).length / retailChurn.length) *
  100
).toFixed(1);
const fintechChurnRate = (
  (fintechChurn.filter((r) => r.churn_label === 1).length /
    fintechChurn.length) *
  100
).toFixed(1);

console.log("\n📊  File sizes:");
const files = [
  "retail_customers.json",
  "retail_products.json",
  "retail_orders.json",
  "retail_reviews.json",
  "retail_customer_churn_features.json",
  "fintech_users.json",
  "fintech_accounts.json",
  "fintech_transactions.json",
  "fintech_loans.json",
  "fintech_cards.json",
  "fintech_user_churn_features.json",
];
files.forEach((f) => {
  const bytes = fs.statSync(path.join(OUTPUT_DIR, f)).size;
  const mb = (bytes / 1024 / 1024).toFixed(2);
  console.log(`     ${f.padEnd(46)} ${mb} MB`);
});

console.log(`\n📈  Simulated churn rates:`);
console.log(`     Retail   ${retailChurnRate}%   (label=1 / total)`);
console.log(`     Fintech  ${fintechChurnRate}%   (label=1 / total)`);
console.log(
  "\n✅  All done — JSON output saved to ./output/ and CSV output saved to ./output/csv/\n",
);
