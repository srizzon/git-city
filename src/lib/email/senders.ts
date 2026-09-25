// Two sending subdomains so their reputations stay apart: if reminders or
// recaps ever draw spam complaints, receipts and sign-in links still land.
//   notify. → receipts, account and sign-in mail, company and advertiser
//             service mail, internal admin mail (click tracking off)
//   mail.   → reminders, recaps, social alerts, follow-ups and product news

export const FROM_NOTIFY = "Git City <noreply@notify.thegitcity.com>";
export const FROM_MAIL = "Git City <noreply@mail.thegitcity.com>";
export const FROM_JOBS = "Git City Jobs <noreply@notify.thegitcity.com>";
