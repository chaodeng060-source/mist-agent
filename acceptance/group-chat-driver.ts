/**
 * Host adapter contract for #191 group-chat acceptance.
 * The implementation belongs to a feature PR and must exercise a real Mist
 * host child process; this file intentionally contains no host or storage mock.
 */
export const GROUP_CHAT_CHECK_IDS = [
  "GC-01",
  "GC-02",
  "GC-03",
  "GC-04",
  "GC-05",
  "GC-09",
  "GC-15",
] as const;

export type GroupChatCheckId = (typeof GROUP_CHAT_CHECK_IDS)[number];
export type ResidentId = "test-resident:a" | "test-resident:b" | "test-resident:c";
export type DeliveryState = "loaded" | "queued" | "not-targeted";

export const groupChatSyntheticFixture = Object.freeze({
  roomId: "test-room:gc-191",
  humanId: "test-human:owner",
  residentIds: Object.freeze({
    a: "test-resident:a",
    b: "test-resident:b",
    c: "test-resident:c",
  }),
  canaries: Object.freeze({
    privateA: "TEST-PRIVATE-CANARY:a",
    privateB: "TEST-PRIVATE-CANARY:b",
    privateC: "TEST-PRIVATE-CANARY:c",
    draft: "TEST-PRIVATE-CANARY:draft",
    tool: "TEST-PRIVATE-CANARY:tool",
  }),
});

export interface GroupChatEvidenceById {
  "GC-01": {
    legitimateHuman: { accepted: boolean; authorId: string };
    legitimate: { accepted: boolean; authorId: string };
    forgedEnvelopeAccepted: boolean;
    recordedAuthorIds: readonly string[];
  };
  "GC-02": {
    publicPayloadAccepted: boolean;
    missingVisibilityAccepted: boolean;
    missingRoomAccepted: boolean;
    missingBindingAccepted: boolean;
    extraPrivateFieldsAccepted: boolean;
    leakedCanaries: readonly string[];
  };
  "GC-03": {
    roomEventIdsBeforeSave: readonly string[];
    roomEventIdsAfterSave: readonly string[];
    deliveryByResident: Readonly<Record<ResidentId, DeliveryState>>;
    memoryWritesByResident: Readonly<Record<ResidentId, number>>;
    privateCanariesVisibleToOtherResidents: readonly string[];
    savedSourceEventId: string | null;
  };
  "GC-04": {
    rosterVersion: number;
    expectedNewResidentId: ResidentId;
    residentIdsByPath: Readonly<
      Record<"broadcast" | "mention" | "projection" | "feedback" | "status", readonly ResidentId[]>
    >;
    hardCodedResidentBranchFound: boolean;
    humanRenderedAsResident: boolean;
  };
  "GC-05": {
    callsFromTextOnlyMentions: number;
    structuredTargetId: ResidentId;
    routedResidentId: ResidentId | null;
    unknownTargetRejected: boolean;
    unauthorizedTargetRejected: boolean;
    turnOrStopGateBypassed: boolean;
  };
  "GC-09": {
    receipts: readonly {
      actor: "system" | ResidentId;
      phase: string;
      claim?: string;
      contextCommitRef?: string;
    }[];
    systemClaimedPersonalPresence: boolean;
    systemClaimedUnderstandingOrMemory: boolean;
    residentReactionAuthorId: string | null;
  };
  "GC-15": {
    authorizedPublicSurface: readonly string[];
    unauthorizedSurfaceLeaks: readonly string[];
    crossResidentPrivateReads: number;
    newResidentReceivedHistoryByDefault: boolean;
  };
}

export interface GroupChatHostRun {
  readonly pid: number;
  readonly commit: string;
}

export interface GroupChatHostDriver {
  /** Literal marker is necessary but not sufficient; reviewer inspects this adapter. */
  readonly kind: "mist-host";
  startHost(): Promise<GroupChatHostRun>;
  stopHost(): Promise<void>;
  resetScenario(id: GroupChatCheckId, fixture: typeof groupChatSyntheticFixture): Promise<void>;
  execute<K extends GroupChatCheckId>(
    id: K,
    fixture: typeof groupChatSyntheticFixture,
    scenario: readonly string[],
  ): Promise<GroupChatEvidenceById[K]>;
}
