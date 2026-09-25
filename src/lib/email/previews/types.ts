export interface RenderedEmail {
  subject: string;
  html: string;
  text?: string;
}

/** Template key → sample render. Keys are what ?template= takes in the admin preview. */
export type EmailPreviews = Record<string, () => RenderedEmail | Promise<RenderedEmail>>;

export const PREVIEW_LINKS = { unsubscribeUrl: "https://thegitcity.com/api/unsubscribe?dev=0&cat=all&token=preview" };

/** Receipts and account mail: the engine sends them without an unsubscribe link. */
export const TRANSACTIONAL_PREVIEW_LINKS = {};
