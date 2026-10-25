export type ReviewRating=1|2|3|4|5
export type ReviewModeration='pending'|'approved'|'rejected'|'hidden'
export interface ReviewSummary {count:number;average:number|null;distribution:Array<{rating:number;count:number}>}
export interface ReviewRow {id:string;productId:string;productName:string;rating:ReviewRating;content:string;imageIds:string[];reply:string|null;revisionId:string;publicReplyRevisionId?:string;publishedAt:string;createdAt:string;verifiedPurchase:boolean;orderItemId?:string;moderationStatus?:ReviewModeration;version?:number;editCount?:number;canEdit?:boolean;withdrawnAt?:string;replyVersion?:number;replyDraft?:string;replyStatus?:ReviewModeration;publicContent?:string;publicRating?:number}
export interface ReviewPage {items:ReviewRow[];hasMore:boolean;nextCursor:string|null;summary?:ReviewSummary;policy?:{editWindowDays:number;maxEdits:number}}
export function reviewStatus(s?:ReviewModeration):string{return s?{pending:'待审核',approved:'审核通过',rejected:'未通过审核',hidden:'平台已隐藏'}[s]:'暂无'}
