export type GuestIssue = {
  id: string;
  description: string;
  aiResponse?: string;
  propertyTypeId?: string;
  propertyTypeName?: string;
  seenByHost: boolean;
  resolved: boolean;
  createdAt: Date | null;
};

export const GUEST_ISSUE_MAX_LENGTH = 1000;

export function guestIssuesCollection(propertyId: string) {
  return `properties/${propertyId}/guestIssues`;
}
