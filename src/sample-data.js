/**
 * sample-data.js — one-click sample document so judges (and users) can try
 * HybridNote AI without hunting for a document. A realistic product-team
 * meeting note with decisions, owned action items, deadlines and risks.
 */
export const SAMPLE_TEXT = `Product Sync — Project Lumen Launch Readiness
Date: Tuesday, November 18, 2026, 10:00–10:45
Attendees: Priya (PM), Marcus (Engineering), Sofia (Design), Dan (QA), Aisha (Marketing)

Priya opened by confirming the launch date: public launch is locked for December 9. The beta cohort (240 users) has been active for three weeks. Retention at day 7 is 41%, slightly below the 45% target, but activation improved after the new onboarding flow shipped last week.

Marcus reported that the sync engine rewrite is complete and merged. Median sync time dropped from 3.8s to 0.9s. However, the offline queue still has a bug: attachments larger than 25 MB occasionally duplicate when a user reconnects. Marcus owns the fix and expects it by Friday, November 21. He flagged that the fix touches the same module as the conflict-resolution work, so it needs a careful review from Dan.

Decision: The team agreed to freeze new features starting November 24. After the freeze, only launch-blocking bugs will be merged. Priya will publish the freeze notice in the team channel today.

Sofia presented the final empty-state illustrations and the revised pricing page. The pricing page A/B test showed the annual-plan layout converts 12% better. Decision: ship the annual-plan layout as the default for launch. Sofia still needs final legal copy for the refund section; legal promised it by November 20, and Aisha will chase them if it slips.

Dan gave the QA update. Full regression passes on staging except for two known issues: the attachment duplication bug above, and a timezone bug in scheduled reports that affects users east of UTC+8. The timezone bug is owned by the platform team; Dan estimates it is a one-line fix but it is not yet scheduled, which is a risk for the Asia launch segment.

Aisha walked through the launch campaign. The announcement post and video are drafted. Risk: the video depends on final UI screenshots, which cannot be captured until the feature freeze build exists on November 25. If the freeze slips, the video timeline slips with it. Aisha proposed recording a backup walkthrough with the current build; the team agreed this was a good mitigation and Aisha will record it by November 26.

Budget note: cloud spend for the beta is 18% over forecast, mostly from the sync service's retry traffic. Marcus believes the rewrite will bring this back in line, but finance wants a checkpoint review on December 1.

Action items recap:
- Marcus: fix the offline-queue attachment duplication bug by Friday, November 21.
- Dan: review Marcus's fix and run the attachment regression suite before the freeze.
- Priya: publish the feature-freeze notice today (November 18).
- Aisha: chase legal for the refund copy (due November 20) and record the backup walkthrough video by November 26.
- Platform team (unassigned owner): schedule the timezone fix for scheduled reports.
- Everyone: checkpoint on cloud spend with finance on December 1.

Next meeting: Tuesday, November 25, same time. Main agenda: freeze readiness and the go/no-go checklist for December 9.`;
