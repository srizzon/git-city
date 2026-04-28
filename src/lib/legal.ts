/**
 * Single source of truth for the legal entity behind Git City.
 *
 * Keep this file in sync with CNPJ records. Used by:
 *   - Privacy policy
 *   - Terms of service
 *   - Email footers (LGPD requires sender identification)
 *   - Customer-facing legal disclosures
 */

/** Trading / brand name (nome fantasia). What users see. */
export const LEGAL_NAME = "Git City";

/** Full corporate name (razão social). What goes in contracts and on invoices. */
export const LEGAL_RAZAO_SOCIAL = "Git City Solucoes em Tecnologia LTDA";

/** Brazilian corporate registration. Display format. */
export const LEGAL_CNPJ = "66.241.579/0001-92";

/** Brazilian corporate registration. Digits-only format (for APIs / tax fields). */
export const LEGAL_CNPJ_RAW = "66241579000192";

export const LEGAL_COUNTRY = "Brazil";
export const LEGAL_EMAIL = "samuel@thegitcity.com";

/** Founder / contact person — used for "built by" / public-facing references only. */
export const LEGAL_FOUNDER = "Samuel Rizzon";
export const LEGAL_X_HANDLE = "samuelrizzondev";
export const LEGAL_WEBSITE = "https://thegitcity.com";

/** Pre-formatted entity line for footers and headers. */
export const LEGAL_ENTITY_LINE = `${LEGAL_RAZAO_SOCIAL} · CNPJ ${LEGAL_CNPJ}`;

/** Short footer line — uses the trading name. */
export const LEGAL_SHORT_LINE = `${LEGAL_NAME} · CNPJ ${LEGAL_CNPJ}`;
